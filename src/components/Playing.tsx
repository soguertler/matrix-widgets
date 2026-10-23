import { useEffect, useRef, useState } from 'react';
import { LogOut, Timer } from 'lucide-react';
import {
  allSubmitted,
  bookOwner,
  previousEntry,
  submittedForPlayer,
  submissionKey,
  type Entry,
  type Game,
  type GameAction,
  type Stroke,
} from '../model/game';
import RoundEntry, { DrawingPad } from './RoundEntry';

type Props = {
  game: Game;
  userId: string;
  busy: boolean;
  send: (action: GameAction) => Promise<boolean>;
};

export default function Playing({ game, userId, busy, send }: Props) {
  const [text, setText] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawingWorking, setDrawingWorking] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const lastExpiryAttempt = useRef(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [game.roundStartedAt]);

  const hasLeft = game.left.includes(userId);
  const isPlayer = game.players.includes(userId) && !hasLeft;
  const myBook = bookOwner(game.players, userId, game.round);
  const previous = previousEntry(game, userId);
  const submitted = submittedForPlayer(game, userId);
  const complete = allSubmitted(game);
  const submittedCount = game.players.filter((player) => {
    const book = bookOwner(game.players, player, game.round);
    return book && game.submissions.has(submissionKey(game.round, book));
  }).length;
  const roundIsDrawing = game.round % 2 === 1;
  const roundName =
    game.round === 0
      ? 'Write a prompt'
      : roundIsDrawing
        ? 'Draw what you read'
        : 'Guess what you see';
  const secondsLeft = Math.max(0, Math.ceil((game.roundStartedAt + game.roundMs - now) / 1000));
  const awaitingConfirmation = lastSentAt > 0 && now - lastSentAt < 5000;
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  useEffect(() => {
    if (!isPlayer || complete || secondsLeft > 0 || busy || now - lastExpiryAttempt.current < 5000)
      return;
    lastExpiryAttempt.current = now;
    void send({ version: 2, kind: 'expire', gameId: game.id, round: game.round });
  }, [isPlayer, complete, secondsLeft, busy, now, game.id, game.round, send]);

  async function submitTurn() {
    if (!isPlayer || submitted || drawingWorking) return;
    const entry: Entry = roundIsDrawing
      ? { kind: 'drawing', strokes }
      : { kind: 'text', text: text.trim().slice(0, 180) };
    if (entry.kind === 'drawing' && entry.strokes.length === 0) return;
    if (entry.kind === 'text' && !entry.text) return;
    // Keep the draft until the room timeline confirms this turn. A late event may be
    // accepted by the client but ignored by the game after the round expires.
    const sent = await send({
      version: 2,
      kind: 'submit',
      gameId: game.id,
      round: game.round,
      entry,
    });
    if (sent) setLastSentAt(Date.now());
  }

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">
          Round {game.round + 1} of {game.steps} · {roundName}
        </h2>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${secondsLeft <= 30 ? 'bg-amber-900 text-amber-100' : 'bg-slate-800'}`}
          >
            <Timer size={15} />
            {clock}
          </span>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-sm">
            {submittedCount}/{game.players.length} ready
          </span>
        </div>
      </div>
      {secondsLeft === 0 && isPlayer && !submitted && (
        <p className="mt-3 text-sm text-amber-200">
          Time is up. Missing turns will be marked as timed out.
        </p>
      )}
      {isPlayer && !submitted && (
        <div className="mt-5 space-y-4">
          {lastSentAt > 0 && (
            <p
              className={`rounded-xl p-3 text-sm ${awaitingConfirmation ? 'bg-sky-950 text-sky-200' : 'bg-amber-950 text-amber-200'}`}
              role="status"
            >
              {awaitingConfirmation
                ? 'Turn sent. Waiting for the room to confirm it…'
                : 'Turn not confirmed yet. Your draft is still here; you can retry.'}
            </p>
          )}
          {myBook && (
            <p className="text-xs uppercase tracking-widest text-slate-400">
              Your turn in a secret chain
            </p>
          )}
          {previous && (
            <div>
              <p className="mb-2 text-sm text-slate-400">Your clue</p>
              <RoundEntry entry={previous.entry} />
            </div>
          )}
          {roundIsDrawing ? (
            <DrawingPad
              key={`${game.id}-${game.round}-${userId}`}
              onChange={setStrokes}
              onWorkingChange={setDrawingWorking}
            />
          ) : (
            <label className="block text-sm font-medium text-slate-300">
              {game.round === 0 ? 'Your opening phrase' : 'What do you think this drawing shows?'}
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-base text-white outline-none focus:border-fuchsia-400"
                maxLength={180}
                placeholder={
                  game.round === 0 ? 'A penguin driving a tiny bus…' : 'Write your guess…'
                }
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
          )}
          <button
            className="rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
            disabled={
              busy ||
              drawingWorking ||
              awaitingConfirmation ||
              (roundIsDrawing ? strokes.length === 0 : !text.trim())
            }
            onClick={() => void submitTurn()}
            type="button"
          >
            Submit turn
          </button>
        </div>
      )}
      {isPlayer && submitted && (
        <p className="mt-5 rounded-xl bg-emerald-950/60 p-4 text-emerald-200">
          Turn confirmed. Waiting for everyone else.
        </p>
      )}
      {!isPlayer && (
        <p className="mt-5 text-slate-300">
          {hasLeft
            ? 'You left this game. You can watch the reveal when it finishes.'
            : 'This game is in progress. You can watch the reveal when it finishes.'}
        </p>
      )}
      {isPlayer && (
        <button
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-400/60 px-4 py-2 text-sm font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-50"
          disabled={busy}
          onClick={() => void send({ version: 2, kind: 'leave', gameId: game.id })}
          type="button"
        >
          <LogOut size={16} />
          Leave game
        </button>
      )}
    </section>
  );
}
