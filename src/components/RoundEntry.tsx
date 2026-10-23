import DrawingPad, { Drawing } from '../drawing/DrawingPad';
import type { Entry } from '../model/game';

export { DrawingPad };

export default function RoundEntry({ entry }: { entry: Entry }) {
  if (entry.kind === 'drawing' && entry.strokes.length === 0)
    return <p className="rounded-xl bg-slate-800 p-4 text-lg font-semibold">(time ran out)</p>;
  return entry.kind === 'drawing' ? (
    <Drawing strokes={entry.strokes} />
  ) : (
    <p className="rounded-xl bg-slate-800 p-4 text-lg font-semibold break-words">{entry.text}</p>
  );
}
