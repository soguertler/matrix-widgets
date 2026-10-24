import { displayName, type MemberProfile } from '@matrix-widgets/widget-shared';
import type { Game } from '../model/game';

export default function Choosing({
  game,
  isDrawer,
  members,
  choices,
  busy,
  liveConnected,
  secondsLeft,
  onChoose,
}: {
  game: Game;
  isDrawer: boolean;
  members: Record<string, MemberProfile>;
  choices: string[];
  busy: boolean;
  liveConnected: boolean;
  secondsLeft: number;
  onChoose: (word: string) => void;
}) {
  return (
    <section className="rounded-2xl bg-slate-900 p-5">
      <h2 className="text-xl font-bold">
        Round {game.index + 1} / {game.rounds * game.players.length} · Choose in {secondsLeft}s
      </h2>
      {isDrawer ? (
        <>
          <p className="my-3">Choose a word to draw:</p>
          <div className="flex flex-wrap gap-2">
            {choices.map((choice) => (
              <button
                key={choice}
                onClick={() => onChoose(choice)}
                disabled={busy || !liveConnected}
                className="rounded-lg bg-indigo-500 px-5 py-3 font-bold disabled:opacity-50"
              >
                {choice}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3">
          Waiting for {members[game.drawer ?? '']?.name ?? displayName(game.drawer ?? '')} to choose
          a word…
        </p>
      )}
    </section>
  );
}
