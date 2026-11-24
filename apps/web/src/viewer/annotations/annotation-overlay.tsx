import { useLayoutEffect, useRef, useState } from 'react';
import {
  ellipseOnCanvas,
  handlesOf,
  labelAnchor,
  outlineOf,
  type ImageMapper,
  type Shape,
} from './annotation-geometry';
import { labelFor, type Annotation, type Point } from './measure-math';
import { useAnnotations } from './use-annotations';

const COLOR = '#facc15';
const SELECTED = '#22d3ee';

type Props = {
  studyId: string;
  /** Changes on every camera change and resize: the overlay re-projects then. */
  revision: unknown;
  getMapper(): ImageMapper | null;
};

const pts = (points: Point[]) => points.map(([x, y]) => `${x},${y}`).join(' ');

function Outline({
  shape,
  mapper,
  color,
  dashed,
}: {
  shape: Shape;
  mapper: ImageMapper;
  color: string;
  dashed?: boolean;
}) {
  const dash = dashed ? '5 4' : undefined;
  const stroke = (
    body: (p: { stroke: string; strokeWidth: number; dash?: string }) => JSX.Element,
  ) => (
    <>
      {/* A dark underlay keeps the line visible on white and on black. */}
      {body({ stroke: 'rgba(0,0,0,0.75)', strokeWidth: 3.5 })}
      {body({ stroke: color, strokeWidth: 1.75, dash })}
    </>
  );
  if (shape.kind === 'ellipse') {
    const e = ellipseOnCanvas(shape.points, mapper);
    return stroke((p) => (
      <ellipse
        cx={e.cx}
        cy={e.cy}
        rx={e.rx}
        ry={e.ry}
        transform={`rotate(${e.rotation} ${e.cx} ${e.cy})`}
        fill="none"
        stroke={p.stroke}
        strokeWidth={p.strokeWidth}
        strokeDasharray={p.dash}
      />
    ));
  }
  const outline = outlineOf(shape);
  const canvas = pts(outline.points.map((q) => mapper.toCanvas(q)));
  return stroke((p) =>
    outline.closed ? (
      <polygon
        points={canvas}
        fill="none"
        stroke={p.stroke}
        strokeWidth={p.strokeWidth}
        strokeDasharray={p.dash}
        strokeLinejoin="round"
      />
    ) : (
      <polyline
        points={canvas}
        fill="none"
        stroke={p.stroke}
        strokeWidth={p.strokeWidth}
        strokeDasharray={p.dash}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    ),
  );
}

function Measurement({
  annotation,
  mapper,
  selected,
  width,
}: {
  annotation: Annotation;
  mapper: ImageMapper;
  selected: boolean;
  width: number;
}) {
  const color = selected ? SELECTED : COLOR;
  const handles = handlesOf(annotation).map((h) => mapper.toCanvas(h));
  const at = labelAnchor(annotation, mapper, width);
  const label = labelFor(annotation);
  return (
    <g
      data-annotation-id={annotation.id}
      data-kind={annotation.kind}
      data-selected={selected ? 'true' : undefined}
      data-label={label}
    >
      <Outline shape={annotation} mapper={mapper} color={color} />
      {handles.map(([x, y], i) => (
        <circle
          key={i}
          data-handle={i}
          cx={x}
          cy={y}
          r={selected ? 5 : 3}
          fill={selected ? SELECTED : COLOR}
          stroke="black"
          strokeWidth={1.25}
        />
      ))}
      {/* White (cyan when selected) text on a dark halo: legible on black and white. */}
      <text
        x={at.x}
        y={at.y}
        textAnchor={at.anchor}
        fill={selected ? SELECTED : 'white'}
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={3}
        strokeLinejoin="round"
        paintOrder="stroke"
        className="font-sans text-[13px] font-semibold tabular-nums"
      >
        {label}
      </text>
    </g>
  );
}

/**
 * Measurement layer: an SVG sibling ABOVE the viewport element (never inside
 * Cornerstone's element or a transformed ancestor), aria-hidden and without
 * pointer events (the interaction handler hit-tests by geometry). Every
 * render re-projects the image-space points through the current camera, read
 * through the guarded getter, so nothing here ever reaches a destroyed viewport.
 * Nothing animates.
 */
export function AnnotationOverlay({ studyId, revision, getMapper }: Props) {
  const { annotations, selectedId, draft } = useAnnotations(studyId);
  const ref = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const w = ref.current?.clientWidth ?? 0;
    setWidth((prev) => (prev === w ? prev : w));
  }, [revision]);
  const mapper = getMapper();
  return (
    <svg
      ref={ref}
      aria-hidden="true"
      data-testid="measurement-overlay"
      className="pointer-events-none absolute inset-0 size-full select-none"
    >
      {mapper &&
        annotations.map((a) => (
          <Measurement
            key={a.id}
            annotation={a}
            mapper={mapper}
            selected={a.id === selectedId}
            width={width}
          />
        ))}
      {mapper && draft && (
        <g data-draft={draft.kind}>
          <Outline shape={draft} mapper={mapper} color={COLOR} dashed />
        </g>
      )}
    </svg>
  );
}
