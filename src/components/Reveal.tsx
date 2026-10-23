import { submissionKey, type Game, type GameAction } from '../model/game';
import { displayName } from '../matrix/PlayerProfiles';
import RoundEntry from './RoundEntry';

export default function Reveal({
  game,
  userId,
  busy,
  send,
}: {
  game: Game;
  userId: string;
  busy: boolean;
  send: (action: GameAction) => Promise<boolean>;
}) {
  const total = game.players.length * game.steps;
  const bookIndex = Math.floor((game.revealIndex - 1) / game.steps);
  const visibleSteps = ((game.revealIndex - 1) % game.steps) + 1;
  const book = game.players[bookIndex];
  const finished = game.revealIndex === total;

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-2xl font-bold">The stories</h2>
        <p className="mt-2 text-slate-300">
          Story {bookIndex + 1} of {game.players.length} · Step {visibleSteps} of {game.steps}
        </p>
        {game.players.includes(userId) && !finished && (
          <button
            className="mt-4 rounded-xl bg-violet-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              void send({
                version: 2,
                kind: 'revealNext',
                gameId: game.id,
                index: game.revealIndex,
              })
            }
            type="button"
          >
            {visibleSteps === game.steps ? 'Next story' : 'Next step'}
          </button>
        )}
        {finished && (
          <button
            className="mt-4 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
            disabled={busy}
            onClick={() => void send({ version: 2, kind: 'create', gameId: crypto.randomUUID() })}
            type="button"
          >
            New game
          </button>
        )}
      </div>
      <article className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h3 className="text-lg font-bold">{displayName(book)}’s story</h3>
        <div className="mt-4 space-y-4">
          {Array.from({ length: visibleSteps }, (_, round) => {
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
    </section>
  );
}
