import { submissionKey, type Game, type GameAction } from '../model/game';
import { displayName } from '../matrix/PlayerProfiles';
import RoundEntry from './RoundEntry';

export default function Reveal({
  game,
  busy,
  send,
}: {
  game: Game;
  busy: boolean;
  send: (action: GameAction) => Promise<boolean>;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-2xl font-bold">The stories</h2>
        <p className="mt-2 text-slate-300">
          Follow each phrase as it turns into a drawing and then a new guess.
        </p>
        <button
          className="mt-4 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
          disabled={busy}
          onClick={() => void send({ version: 1, kind: 'create', gameId: crypto.randomUUID() })}
          type="button"
        >
          New game
        </button>
      </div>
      {game.players.map((book) => (
        <article key={book} className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h3 className="text-lg font-bold">{displayName(book)}’s story</h3>
          <div className="mt-4 space-y-4">
            {Array.from({ length: game.steps }, (_, round) => {
              const submission = game.submissions.get(submissionKey(round, book));
              if (!submission) return null;
              return (
                <div key={round} className="rounded-xl border border-slate-700 p-3">
                  <p className="mb-2 text-xs uppercase tracking-widest text-slate-400">
                    {round + 1}. {displayName(submission.author)} ·{' '}
                    {submission.entry.kind === 'drawing'
                      ? 'drawing'
                      : round === 0
                        ? 'prompt'
                        : 'guess'}
                  </p>
                  <RoundEntry entry={submission.entry} />
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </section>
  );
}
