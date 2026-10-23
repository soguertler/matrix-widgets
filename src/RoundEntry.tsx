import DrawingPad, { Drawing } from './DrawingPad';
import type { Entry } from './game';

export { DrawingPad };

export default function RoundEntry({ entry }: { entry: Entry }) {
  return entry.kind === 'drawing'
    ? <Drawing strokes={entry.strokes} />
    : <p className="rounded-xl bg-slate-800 p-4 text-lg font-semibold break-words">{entry.text}</p>;
}
