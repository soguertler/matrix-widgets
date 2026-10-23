import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { allSubmitted, bookOwner, previousEntry, submittedForPlayer, submissionKey, type Entry, type Game, type GameAction, type Stroke } from './game';
import RoundEntry, { DrawingPad } from './RoundEntry';

type Props = { game: Game; userId: string; busy: boolean; send: (action: GameAction) => Promise<boolean> };

export default function Playing({ game, userId, busy, send }: Props) {
  const [text, setText] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [game.roundStartedAt]);

  const isOwner = game.owner === userId;
  const isPlayer = game.players.includes(userId);
  const myBook = bookOwner(game.players, userId, game.round);
  const previous = previousEntry(game, userId);
  const submitted = submittedForPlayer(game, userId);
  const complete = allSubmitted(game);
  const submittedCount = game.players.filter((player) => {
    const book = bookOwner(game.players, player, game.round);
    return book && game.submissions.has(submissionKey(game.round, book));
  }).length;
  const roundIsDrawing = game.round % 2 === 1;
  const roundName = game.round === 0 ? 'Write a prompt' : roundIsDrawing ? 'Draw what you read' : 'Guess what you see';
  const secondsLeft = Math.max(0, Math.ceil((game.roundStartedAt + 120_000 - now) / 1000));
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  async function submitTurn() {
    if (!isPlayer || submitted) return;
    const entry: Entry = roundIsDrawing
      ? { kind: 'drawing', strokes }
      : { kind: 'text', text: text.trim().slice(0, 180) };
    if (entry.kind === 'drawing' && entry.strokes.length === 0) return;
    if (entry.kind === 'text' && !entry.text) return;
    const saved = await send({ version: 1, kind: 'submit', gameId: game.id, round: game.round, entry });
    if (saved) { setText(''); setStrokes([]); }
  }

  return <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">Round {game.round + 1} of {game.steps} · {roundName}</h2>
      <div className="flex items-center gap-2">
        <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${secondsLeft <= 30 ? 'bg-amber-900 text-amber-100' : 'bg-slate-800'}`}><Timer size={15} />{clock}</span>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-sm">{submittedCount}/{game.players.length} ready</span>
      </div>
    </div>
    {secondsLeft === 0 && <p className="mt-3 text-sm text-amber-200">Time is up. You can still finish and submit your turn.</p>}
    {isPlayer && !submitted && <div className="mt-5 space-y-4">
      {myBook && <p className="text-xs uppercase tracking-widest text-slate-400">Your turn in a secret chain</p>}
      {previous && <div><p className="mb-2 text-sm text-slate-400">Your clue</p><RoundEntry entry={previous.entry} /></div>}
      {roundIsDrawing ? <DrawingPad key={`${game.id}-${game.round}-${userId}`} onChange={setStrokes} /> : <label className="block text-sm font-medium text-slate-300">
        {game.round === 0 ? 'Your opening phrase' : 'What do you think this drawing shows?'}
        <textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-base text-white outline-none focus:border-fuchsia-400" maxLength={180} placeholder={game.round === 0 ? 'A penguin driving a tiny bus…' : 'Write your guess…'} value={text} onChange={(event) => setText(event.target.value)} />
      </label>}
      <button className="rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50" disabled={busy || (roundIsDrawing ? strokes.length === 0 : !text.trim())} onClick={() => void submitTurn()} type="button">Submit turn</button>
    </div>}
    {isPlayer && submitted && <p className="mt-5 rounded-xl bg-emerald-950/60 p-4 text-emerald-200">Turn submitted. Waiting for everyone else.</p>}
    {!isPlayer && <p className="mt-5 text-slate-300">This game is in progress. You can watch the reveal when it finishes.</p>}
    {isOwner && complete && <button className="mt-5 rounded-xl bg-violet-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" disabled={busy} onClick={() => void send(game.round + 1 === game.steps ? { version: 1, kind: 'reveal', gameId: game.id } : { version: 1, kind: 'advance', gameId: game.id, round: game.round })} type="button">{game.round + 1 === game.steps ? 'Reveal the stories' : 'Next round'}</button>}
  </section>;
}
