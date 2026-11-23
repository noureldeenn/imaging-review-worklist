/**
 * Two-process contention smoke test.
 * Spawns two API processes (separate ports, one shared test database) and fires
 * simultaneous claims for the same study. The guard is a single conditional UPDATE
 * in Postgres, so exactly one process must win and the other must get 412.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

process.env.NODE_ENV = 'test';

const ROUNDS = 20;
const STUDY_ID = 'study-001';
const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_INTERVAL_MS = 250;
const DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://imaging:imaging@localhost:5432/imaging_test';
const MAIN_JS = path.resolve(__dirname, '..', 'apps', 'api', 'dist', 'main.js');

interface Proc {
  port: number;
  child: ChildProcess;
  output: string[];
}

interface Reply {
  port: number;
  reviewerId: string;
  status: number;
  body: unknown;
}

function startApi(port: number): Proc {
  const child = spawn(process.execPath, [MAIN_JS], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_URL_TEST: DATABASE_URL,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output: string[] = [];
  child.stdout?.on('data', (d: Buffer) => output.push(d.toString()));
  child.stderr?.on('data', (d: Buffer) => output.push(d.toString()));
  return { port, child, output };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(proc: Proc): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      throw new Error(`API on port ${proc.port} exited early (code ${proc.child.exitCode})`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${proc.port}/api/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(HEALTH_INTERVAL_MS);
  }
  throw new Error(`API on port ${proc.port} not healthy within ${HEALTH_TIMEOUT_MS} ms`);
}

async function claim(port: number, reviewerId: string, expectedVersion: number): Promise<Reply> {
  const res = await fetch(`http://127.0.0.1:${port}/api/studies/${STUDY_ID}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reviewerId, expectedVersion }),
  });
  const body: unknown = await res.json().catch(() => null);
  return { port, reviewerId, status: res.status, body };
}

class RoundFailure extends Error {
  constructor(
    readonly round: number,
    reason: string,
    readonly replies: Reply[],
  ) {
    super(reason);
  }
}

async function runRound(
  prisma: PrismaClient,
  round: number,
  ports: [number, number],
): Promise<void> {
  const reset = await prisma.study.update({
    where: { id: STUDY_ID },
    data: { status: 'Unassigned', ownerId: null, reviewNote: null },
  });
  const v = reset.version;

  const replies = await Promise.all([
    claim(ports[0], 'reviewer-a', v),
    claim(ports[1], 'reviewer-b', v),
  ]);

  const statuses = replies.map((r) => r.status).sort((a, b) => a - b);
  if (statuses[0] !== 200 || statuses[1] !== 412) {
    throw new RoundFailure(
      round,
      `expected statuses [200,412], got [${statuses.join(',')}]`,
      replies,
    );
  }
  const winner = replies.find((r) => r.status === 200) as Reply;
  const loser = replies.find((r) => r.status === 412) as Reply;
  const loserBody = loser.body as { code?: string; current?: { version?: number } } | null;
  if (loserBody?.code !== 'STALE_VERSION') {
    throw new RoundFailure(round, 'loser body code is not STALE_VERSION', replies);
  }
  if (loserBody.current?.version !== v + 1) {
    throw new RoundFailure(round, `loser current.version is not ${v + 1}`, replies);
  }
  const row = await prisma.study.findUniqueOrThrow({ where: { id: STUDY_ID } });
  if (row.ownerId !== winner.reviewerId) {
    throw new RoundFailure(
      round,
      `DB ownerId ${String(row.ownerId)} != winner ${winner.reviewerId}`,
      replies,
    );
  }
}

async function main(): Promise<number> {
  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  const [first, second] = [startApi(4101), startApi(4102)] as const;
  const procs = [first, second];
  try {
    await Promise.all(procs.map(waitHealthy));
    let ok = 0;
    for (let round = 1; round <= ROUNDS; round += 1) {
      await runRound(prisma, round, [first.port, second.port]);
      ok += 1;
    }
    console.log(`rounds=${ROUNDS} ok=${ok}`);
    return 0;
  } catch (err) {
    if (err instanceof RoundFailure) {
      console.error(`FAILED round ${err.round}: ${err.message}`);
      console.error(JSON.stringify(err.replies, null, 2));
    } else {
      console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const p of procs) {
      console.error(`--- API :${p.port} output ---\n${p.output.join('')}`);
    }
    return 1;
  } finally {
    for (const p of procs) p.child.kill();
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
