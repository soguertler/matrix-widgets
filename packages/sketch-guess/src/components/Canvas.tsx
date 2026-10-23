import { useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from 'react';
import { Eraser, RotateCcw } from 'lucide-react';
import type { Point, Stroke } from '../model/game';

const colors = [
  '#172033',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#0ea5e9',
  '#8b5cf6',
  '#ec4899',
];
function path(points: Point[]) {
  return points.map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
}

export default function Canvas({
  strokes,
  setStrokes,
  editable,
  onStroke,
  onDraft,
  onClear,
  remoteDraft,
}: {
  strokes: Stroke[];
  setStrokes: Dispatch<SetStateAction<Stroke[]>>;
  editable: boolean;
  onStroke: (stroke: Stroke) => void;
  onDraft: (stroke: Stroke) => void;
  onClear: () => void;
  remoteDraft?: Stroke | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const current = useRef<Stroke | null>(null);
  const lastDraftSent = useRef(0);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [color, setColor] = useState(colors[0]!);
  const [width, setWidth] = useState(5);
  function point(event: PointerEvent<SVGSVGElement>): Point {
    const bounds = svg.current!.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(800, Math.round(((event.clientX - bounds.left) * 800) / bounds.width)),
      ),
      y: Math.max(
        0,
        Math.min(500, Math.round(((event.clientY - bounds.top) * 500) / bounds.height)),
      ),
    };
  }
  function down(event: PointerEvent<SVGSVGElement>) {
    if (!editable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    current.current = { id: crypto.randomUUID(), color, width, points: [point(event)] };
    setDraft(current.current);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!current.current) return;
    const next = point(event);
    const last = current.current.points.at(-1)!;
    if (Math.hypot(next.x - last.x, next.y - last.y) < 2) return;
    let points = [...current.current.points, next];
    if (points.length > 500)
      points = points.filter((_, index) => index % 2 === 0 || index === points.length - 1);
    current.current = { ...current.current, points };
    setDraft(current.current);
    if (performance.now() - lastDraftSent.current >= 40) {
      lastDraftSent.current = performance.now();
      const step = Math.max(1, Math.ceil(current.current.points.length / 30));
      const preview = current.current.points;
      onDraft({
        ...current.current,
        points: preview.filter((_, index) => index % step === 0 || index === preview.length - 1),
      });
    }
  }
  function up() {
    if (!current.current) return;
    const drawn = current.current;
    const step = Math.max(1, Math.ceil(drawn.points.length / 250));
    const points = drawn.points.filter(
      (_, index) => index % step === 0 || index === drawn.points.length - 1,
    );
    const stroke = { ...drawn, points };
    current.current = null;
    setDraft(null);
    setStrokes((old) => [...old, stroke]);
    onStroke(stroke);
  }
  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {colors.map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Color ${value}`}
              onClick={() => setColor(value)}
              className={`h-8 w-8 rounded-full border-2 ${color === value ? 'border-white ring-2 ring-indigo-400' : 'border-slate-400'}`}
              style={{ background: value }}
            />
          ))}
          <button
            type="button"
            title="Eraser"
            onClick={() => setColor('#ffffff')}
            className="rounded-lg bg-slate-700 p-2"
          >
            <Eraser size={18} />
          </button>
          <input
            aria-label="Brush size"
            type="range"
            min="2"
            max="30"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
          <button
            type="button"
            onClick={() => {
              setStrokes([]);
              onClear();
            }}
            className="flex items-center gap-1 rounded-lg bg-slate-700 px-3 py-2"
          >
            <RotateCcw size={16} /> Clear
          </button>
        </div>
      )}
      <svg
        ref={svg}
        role="img"
        aria-label="Live drawing canvas"
        viewBox="0 0 800 500"
        className="w-full touch-none rounded-xl bg-white shadow-inner"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {[...strokes, ...(draft ? [draft] : []), ...(remoteDraft ? [remoteDraft] : [])].map(
          (stroke) =>
            stroke.points.length === 1 ? (
              <circle
                key={stroke.id}
                cx={stroke.points[0]!.x}
                cy={stroke.points[0]!.y}
                r={stroke.width / 2}
                fill={stroke.color}
              />
            ) : (
              <path
                key={stroke.id}
                d={path(stroke.points)}
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ),
        )}
      </svg>
    </div>
  );
}
