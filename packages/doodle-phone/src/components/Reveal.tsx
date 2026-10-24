import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { submissionKey, type Game, type GameAction } from '../model/game';
import { displayName } from '@matrix-widgets/widget-shared';
import { exportStory } from '../reveal/export';
import RoundEntry from './RoundEntry';

export default function Reveal({
  game,
  busy,
  send,
  allowNewGame = false,
}: {
  game: Game;
  busy: boolean;
  send: (action: GameAction) => Promise<boolean>;
  allowNewGame?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const total = game.players.length * game.steps;
  const bookIndex = Math.floor(index / game.steps);
  const visibleSteps = (index % game.steps) + 1;
  const book = game.players[bookIndex];

  async function download() {
    setExporting(true);
    setExportError('');
    try {
      await exportStory(game, bookIndex);
    } catch {
      setExportError('Could not export this story. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-2xl font-bold">The stories</h2>
        <p className="mt-2 text-slate-300">
          Story {bookIndex + 1} of {game.players.length} · Step {visibleSteps} of {game.steps}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 font-bold disabled:opacity-40"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            type="button"
          >
            <ChevronLeft size={17} /> Previous
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-40"
            disabled={index + 1 === total}
            onClick={() => setIndex(index + 1)}
            type="button"
          >
            {visibleSteps === game.steps ? 'Next story' : 'Next step'} <ChevronRight size={17} />
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2 font-bold disabled:opacity-40"
            disabled={exporting}
            onClick={() => void download()}
            type="button"
          >
            <Download size={17} /> {exporting ? 'Exporting…' : 'Download story'}
          </button>
        </div>
        {exportError && (
          <p role="alert" className="mt-3 text-sm text-rose-200">
            {exportError}
          </p>
        )}
        {allowNewGame && (
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
