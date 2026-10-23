import { useRef, useState } from 'react';
import {
  Circle,
  Eraser,
  Minus,
  PaintBucket,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { DRAW_COLORS, DRAW_WIDTHS, type DrawTool, type Point, type Stroke } from '../model/game';
import { CANVAS_HEIGHT, CANVAS_WIDTH, fillRegion, rasterize } from './fill';

type Props = { onChange: (strokes: Stroke[]) => void };
const WIDTH = CANVAS_WIDTH;
const HEIGHT = CANVAS_HEIGHT;
const MAX_POINTS = 800;

function isLegacy(stroke: Stroke): stroke is Point[] {
  return Array.isArray(stroke);
}
function pointsOf(stroke: Stroke): Point[] {
  return isLegacy(stroke) ? stroke : stroke.points;
}
function countPoints(strokes: Stroke[]): number {
  return strokes.reduce((sum, stroke) => sum + pointsOf(stroke).length, 0);
}

function renderStroke(stroke: Stroke, index: number) {
  const points = pointsOf(stroke);
  if (!points.length) return null;
  const color = isLegacy(stroke) ? '#111827' : stroke.color;
  const width = isLegacy(stroke) ? 5 : stroke.width;
  const tool = isLegacy(stroke) ? 'pen' : stroke.tool;
  if (tool === 'fill' && !isLegacy(stroke) && stroke.data) {
    return <image key={index} href={stroke.data} x={0} y={0} width={WIDTH} height={HEIGHT} />;
  }
  if (tool === 'rectangle' || tool === 'ellipse') {
    const [start, end] = points;
    const x = Math.min(start[0], end[0]);
    const y = Math.min(start[1], end[1]);
    const w = Math.abs(start[0] - end[0]);
    const h = Math.abs(start[1] - end[1]);
    const fill = !isLegacy(stroke) && stroke.filled ? color : 'none';
    return tool === 'rectangle' ? (
      <rect
        key={index}
        x={x}
        y={y}
        width={w}
        height={h}
        fill={fill}
        stroke={color}
        strokeWidth={width}
      />
    ) : (
      <ellipse
        key={index}
        cx={x + w / 2}
        cy={y + h / 2}
        rx={w / 2}
        ry={h / 2}
        fill={fill}
        stroke={color}
        strokeWidth={width}
      />
    );
  }
  if (
    points.length === 1 ||
    (points.length === 2 && points[0][0] === points[1][0] && points[0][1] === points[1][1])
  ) {
    return <circle key={index} cx={points[0][0]} cy={points[0][1]} r={width / 2} fill={color} />;
  }
  return (
    <polyline
      key={index}
      points={points.map((point) => point.join(',')).join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

const tools: { id: DrawTool; icon: LucideIcon; label: string }[] = [
  { id: 'pen', icon: Pencil, label: 'Pen' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'fill', icon: PaintBucket, label: 'Fill area' },
];

export default function DrawingPad({ onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const undoRef = useRef<Stroke[][]>([]);
  const redoRef = useRef<Stroke[][]>([]);
  const drawingRef = useRef(false);
  const fillingRef = useRef(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [, setHistoryTick] = useState(0);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState<(typeof DRAW_COLORS)[number]>('#111827');
  const [width, setWidth] = useState<(typeof DRAW_WIDTHS)[number]>(6);
  const [fillError, setFillError] = useState('');

  function point(event: React.PointerEvent<SVGSVGElement>): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      Math.round(Math.max(0, Math.min(WIDTH, ((event.clientX - rect.left) / rect.width) * WIDTH))),
      Math.round(
        Math.max(0, Math.min(HEIGHT, ((event.clientY - rect.top) / rect.height) * HEIGHT)),
      ),
    ];
  }

  function update(next: Stroke[]) {
    strokesRef.current = next;
    setStrokes(next);
    onChange(next);
  }

  function checkpoint() {
    undoRef.current.push(strokesRef.current);
    redoRef.current = [];
    setHistoryTick((tick) => tick + 1);
  }

  function start(event: React.PointerEvent<SVGSVGElement>) {
    if (
      event.button !== 0 ||
      drawingRef.current ||
      countPoints(strokesRef.current) >= MAX_POINTS - 1
    )
      return;
    event.preventDefault();
    const startPoint = point(event);
    if (tool === 'fill') {
      if (!fillingRef.current) void fillAt(startPoint);
      return;
    }
    checkpoint();
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    update([
      ...strokesRef.current,
      {
        points: tool === 'pen' || tool === 'eraser' ? [startPoint] : [startPoint, startPoint],
        color: tool === 'eraser' ? '#ffffff' : color,
        width: tool === 'eraser' ? 24 : width,
        tool,
      },
    ]);
  }

  async function fillAt(seed: Point) {
    fillingRef.current = true;
    setFillError('');
    try {
      const canvas = await rasterize(strokesRef.current);
      const source = canvas
        .getContext('2d', { willReadFrequently: true })!
        .getImageData(0, 0, WIDTH, HEIGHT);
      const mask = fillRegion(source, seed, color);
      if (!mask) return;
      const overlay = document.createElement('canvas');
      overlay.width = WIDTH;
      overlay.height = HEIGHT;
      overlay
        .getContext('2d')!
        .putImageData(new ImageData(new Uint8ClampedArray(mask), WIDTH, HEIGHT), 0, 0);
      const data = overlay.toDataURL('image/png');
      const storedBytes = strokesRef.current.reduce(
        (sum, stroke) => sum + (isLegacy(stroke) ? 0 : (stroke.data?.length ?? 0)),
        0,
      );
      if (data.length > 40_000 || storedBytes + data.length > 50_000) {
        setFillError(
          'This fill is too detailed to send through Matrix. Try closing gaps or simplifying the drawing.',
        );
        return;
      }
      checkpoint();
      update([...strokesRef.current, { tool: 'fill', points: [seed], color, width, data }]);
    } catch {
      setFillError('Could not fill this area. Try again.');
    } finally {
      fillingRef.current = false;
    }
  }

  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return;
    const current = strokesRef.current;
    const active = current.at(-1);
    if (!active || isLegacy(active)) return;
    const nextPoint = point(event);
    const previous = active.points.at(-1)!;
    if (Math.hypot(nextPoint[0] - previous[0], nextPoint[1] - previous[1]) < 3) return;
    if (active.tool === 'pen' || active.tool === 'eraser') {
      if (countPoints(current) >= MAX_POINTS) return;
      update([...current.slice(0, -1), { ...active, points: [...active.points, nextPoint] }]);
    } else {
      update([...current.slice(0, -1), { ...active, points: [active.points[0], nextPoint] }]);
    }
  }

  function stop(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return;
    move(event);
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function undo() {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(strokesRef.current);
    update(previous);
    setHistoryTick((tick) => tick + 1);
  }
  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(strokesRef.current);
    update(next);
    setHistoryTick((tick) => tick + 1);
  }
  function clear() {
    if (!strokesRef.current.length) return;
    checkpoint();
    update([]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row">
        <div
          className="grid grid-cols-9 gap-1 self-start rounded-xl bg-slate-800 p-2 lg:w-28 lg:grid-cols-3"
          aria-label="Colors"
        >
          {DRAW_COLORS.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-label={`Color ${choice}`}
              aria-pressed={color === choice && tool !== 'eraser'}
              className={`h-7 w-7 rounded border-2 ${color === choice && tool !== 'eraser' ? 'border-violet-300 ring-1 ring-white' : 'border-slate-600'}`}
              style={{ backgroundColor: choice }}
              onClick={() => {
                setColor(choice);
                if (tool === 'eraser') setTool('pen');
              }}
            />
          ))}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="aspect-[8/5] min-w-0 flex-1 touch-none cursor-crosshair rounded-xl bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={stop}
          onPointerCancel={stop}
          aria-label="Drawing canvas"
        >
          {strokes.map(renderStroke)}
        </svg>
        <div
          className="grid grid-cols-6 gap-1 self-start rounded-xl bg-slate-800 p-2 lg:w-28 lg:grid-cols-2"
          aria-label="Drawing tools"
        >
          {tools.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={tool === id}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border ${tool === id ? 'border-violet-300 bg-violet-500/40 text-white' : 'border-slate-600 text-slate-200 hover:bg-slate-700'}`}
              onClick={() => setTool(id)}
            >
              <Icon size={23} strokeWidth={2.2} className={id === 'line' ? '-rotate-45' : ''} />
            </button>
          ))}
        </div>
      </div>
      {fillError && (
        <p role="alert" className="text-sm text-amber-200">
          {fillError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-800 p-2">
        <span className="px-2 text-xs font-bold uppercase tracking-wider text-slate-300">Size</span>
        {DRAW_WIDTHS.map((size) => (
          <button
            key={size}
            type="button"
            aria-label={`Brush size ${size}`}
            aria-pressed={width === size}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border ${width === size ? 'border-violet-300 bg-violet-500/40' : 'border-slate-600'}`}
            onClick={() => setWidth(size)}
          >
            <span className="rounded-full bg-white" style={{ width: size, height: size }} />
          </button>
        ))}
        <div className="mx-1 h-7 w-px bg-slate-600" />
        <button
          className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40"
          disabled={!undoRef.current.length}
          onClick={undo}
          type="button"
        >
          <Undo2 size={16} />
          Undo
        </button>
        <button
          className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40"
          disabled={!redoRef.current.length}
          onClick={redo}
          type="button"
        >
          <Redo2 size={16} />
          Redo
        </button>
        <button
          className="flex items-center gap-1 rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40"
          disabled={!strokes.length}
          onClick={clear}
          type="button"
        >
          <Trash2 size={16} />
          Clear
        </button>
        <span className="ml-auto text-xs text-slate-400" aria-live="polite">
          {countPoints(strokes)}/{MAX_POINTS} points
        </span>
      </div>
    </div>
  );
}

export function Drawing({ strokes }: { strokes: Stroke[] }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="aspect-[8/5] w-full rounded-xl bg-white"
      role="img"
      aria-label="Player drawing"
    >
      {strokes.map(renderStroke)}
    </svg>
  );
}
