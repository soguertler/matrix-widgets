import { displayName, type MemberProfile } from '@matrix-widgets/widget-shared';
import type { Game } from '../model/game';

export default function StartScreen({
  game,
  members,
  rounds,
  setRounds,
  seconds,
  setSeconds,
  busy,
  onCreate,
}: {
  game: Game | null;
  members: Record<string, MemberProfile>;
  rounds: number;
  setRounds: (value: number) => void;
  seconds: number;
  setSeconds: (value: number) => void;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-2xl bg-slate-900 p-5">
      {game?.phase === 'finished' && (
        <div className="mb-5">
          <h2 className="text-xl font-bold">Final scores</h2>
          {[...game.players]
            .sort((a, b) => game.scores[b]! - game.scores[a]!)
            .map((id) => (
              <p key={id}>
                {members[id]?.name ?? displayName(id)}: {game.scores[id]}
              </p>
            ))}
        </div>
      )}
      <h2 className="mb-3 text-xl font-bold">Create a game</h2>
      <div className="flex flex-wrap gap-3">
        <label>
          Rounds per player{' '}
          <select
            value={rounds}
            onChange={(event) => setRounds(Number(event.target.value))}
            className="ml-2 rounded bg-slate-800 p-2"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Drawing time{' '}
          <select
            value={seconds}
            onChange={(event) => setSeconds(Number(event.target.value))}
            className="ml-2 rounded bg-slate-800 p-2"
          >
            {[30, 60, 90, 120, 180].map((n) => (
              <option key={n} value={n}>
                {n}s
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        disabled={busy}
        onClick={onCreate}
        className="mt-4 rounded-lg bg-indigo-500 px-5 py-2 font-bold disabled:opacity-50"
      >
        Create lobby
      </button>
    </section>
  );
}
