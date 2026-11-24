/**
 * Local-only DICOM import for browsing your own files in the dev database.
 *
 *   npm run import:dicom -- <dir> [<dir>...] [--limit N=40] [--per-series 1]
 *     [--modalities CT,MR,...] [--transfer-syntaxes UID,...] [--dry-run]
 *
 * Reads only an allowlist of technical tags (never patient data), copies the picked
 * files to <repo>/local-dicom/<uuid>.dcm (git-ignored) and inserts Study rows with
 * synthetic ids (local-001...) into the DEV database. Never run against test data.
 */
import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_MODALITIES,
  SUPPORTED_TRANSFER_SYNTAXES,
  classify,
  formatStudyId,
  localNumber,
  nextLocalNumber,
  planSelection,
  syntheticCreatedAt,
  type Candidate,
  type PlanOptions,
  type SkipReason,
} from './import-dicom-plan';
import { readDicomMeta } from './import-dicom-reader';

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(process.env.LOCAL_DICOM_DIR ?? path.join(REPO_ROOT, 'local-dicom'));
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const DEFAULT_DB = 'postgresql://imaging:imaging@localhost:5432/imaging';

type Manifest = Record<string, { uuid: string; studyId: string }>;

interface Cli {
  dirs: string[];
  options: PlanOptions;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Cli {
  const dirs: string[] = [];
  const options: PlanOptions = {
    limit: 40,
    perSeries: 1,
    modalities: DEFAULT_MODALITIES,
    transferSyntaxes: SUPPORTED_TRANSFER_SYNTAXES,
  };
  let dryRun = false;
  const value = (i: number): string => {
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${argv[i]} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--limit') options.limit = Number(value(i++));
    else if (arg === '--per-series') options.perSeries = Number(value(i++));
    else if (arg === '--modalities') {
      options.modalities = value(i++).toUpperCase().split(',').filter(Boolean);
    } else if (arg === '--transfer-syntaxes') {
      options.transferSyntaxes = value(i++).split(',').filter(Boolean);
    } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else dirs.push(path.resolve(arg));
  }
  if (dirs.length === 0) throw new Error('Usage: import:dicom -- <dir> [<dir>...] [options]');
  for (const n of [options.limit, options.perSeries]) {
    if (!Number.isInteger(n) || n < 1) throw new Error('--limit and --per-series must be >= 1');
  }
  return { dirs, options, dryRun };
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(dcm|dicom)$/i.test(entry.name)) out.push(full);
  }
}

const norm = (p: string): string => p.split(path.sep).join('/');

function scan(dirs: string[], options: PlanOptions) {
  const candidates: Candidate[] = [];
  const skipped = new Map<SkipReason, number>();
  const bump = (r: SkipReason) => skipped.set(r, (skipped.get(r) ?? 0) + 1);
  let scanned = 0;
  dirs.forEach((dir, rootIndex) => {
    const files: string[] = [];
    walk(dir, files);
    for (const f of files.sort()) {
      scanned += 1;
      const meta = readDicomMeta(f);
      if (!meta) {
        bump('unreadable');
        continue;
      }
      const reason = classify(meta, options);
      if (reason) bump(reason);
      else {
        const sourcePath = norm(f);
        candidates.push({ sourcePath, rootIndex, series: path.posix.dirname(sourcePath), meta });
      }
    }
  });
  return { candidates, skipped, scanned };
}

function loadManifest(): Manifest {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest) : {};
}

function tally<T>(items: T[], key: (t: T) => string): string[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(key(i), (counts.get(key(i)) ?? 0) + 1);
  return [...counts.entries()].sort().map(([k, n]) => `  ${k.padEnd(28)} ${n}`);
}

function printPlan(picks: Candidate[], label: string): void {
  console.log(
    `\n${label}: ${picks.length} studies from ${new Set(picks.map((p) => p.series)).size} series`,
  );
  console.log('By modality:');
  console.log(tally(picks, (p) => p.meta.modality.toUpperCase()).join('\n'));
  console.log('By transfer syntax:');
  console.log(tally(picks, (p) => p.meta.transferSyntax).join('\n'));
}

async function importPicks(picks: Candidate[]): Promise<number> {
  if (process.env.NODE_ENV === 'test') throw new Error('Refusing to import with NODE_ENV=test');
  const envFile = path.join(REPO_ROOT, 'apps', 'api', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL ?? DEFAULT_DB } },
  });
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    const manifest = loadManifest();
    const rows = await prisma.study.findMany({ select: { id: true } });
    const taken = new Set(rows.map((r) => r.id));
    let next = nextLocalNumber([...taken, ...Object.values(manifest).map((m) => m.studyId)]);
    let created = 0;
    const create = async (uuid: string, studyId: string, modality: string) => {
      const n = localNumber(studyId) ?? next;
      await prisma.study.create({
        data: {
          id: studyId,
          modality: modality.toUpperCase(),
          createdAt: syntheticCreatedAt(n),
          status: 'Unassigned',
          version: 1,
          ownerId: null,
          fileKey: `local:${uuid}`,
        },
      });
      taken.add(studyId);
      created += 1;
    };
    for (const pick of picks) {
      const key = pick.sourcePath;
      const known = manifest[key];
      if (
        known &&
        taken.has(known.studyId) &&
        existsSync(path.join(OUT_DIR, `${known.uuid}.dcm`))
      ) {
        continue;
      }
      // New pick, or a manifest entry whose row/file vanished (e.g. after db:reset).
      const uuid = known?.uuid ?? randomUUID();
      const target = path.join(OUT_DIR, `${uuid}.dcm`);
      if (!existsSync(target)) copyFileSync(key, target);
      let studyId = known?.studyId ?? formatStudyId(next);
      if (taken.has(studyId)) studyId = formatStudyId(next);
      next = Math.max(next, (localNumber(studyId) ?? 0) + 1);
      await create(uuid, studyId, pick.meta.modality);
      manifest[key] = { uuid, studyId };
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    }
    return created;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const { dirs, options, dryRun } = parseArgs(process.argv.slice(2));
  const { candidates, skipped, scanned } = scan(dirs, options);
  const picks = planSelection(candidates, options);
  console.log(`Scanned ${scanned} files, ${candidates.length} eligible.`);
  console.log('Skipped by reason:');
  for (const [reason, n] of [...skipped.entries()].sort())
    console.log(`  ${reason.padEnd(28)} ${n}`);
  printPlan(picks, dryRun ? 'Plan (dry run, nothing written)' : 'Selected');
  if (dryRun) return;
  const created = await importPicks(picks);
  console.log(`\nImported ${created} new studies (${picks.length - created} already present).`);
  console.log(`Files: ${OUT_DIR}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'import failed');
  process.exit(1);
});
