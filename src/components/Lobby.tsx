import { X } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS, type Game, type GameAction } from '../model/game';
import { displayName, type MemberProfile } from '../matrix/PlayerProfiles';

type Props = {
  game: Game;
  userId: string;
  connected: boolean;
  busy: boolean;
  members: Record<string, MemberProfile>;
  avatarUrls: Record<string, string>;
  send: (action: GameAction) => Promise<boolean>;
};

export default function Lobby({ game, userId, connected, busy, members, avatarUrls, send }: Props) {
  const isOwner = game.owner === userId;
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-xl font-bold">
        Lobby · {game.joined.length} player{game.joined.length === 1 ? '' : 's'}
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        Each person opens this widget in Element and joins here. The creator starts when everyone is
        ready ({MIN_PLAYERS}–{MAX_PLAYERS} players).
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {game.joined.map((player) => {
          const name = members[player]?.name ?? displayName(player);
          return (
            <li
              key={player}
              className="flex min-w-0 items-center gap-3 rounded-xl bg-slate-800 p-2"
            >
              {avatarUrls[player] ? (
                <img
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                  src={avatarUrls[player]}
                  alt=""
                />
              ) : (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-600 font-bold"
                  aria-hidden="true"
                >
                  {name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                <strong className="block truncate">{name}</strong>
                <span className="block truncate text-xs text-slate-400">
                  {player === game.owner ? 'Host · ' : ''}
                  {player}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {userId && !game.joined.includes(userId) && game.joined.length < MAX_PLAYERS && (
        <button
          className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
          disabled={busy || !connected}
          onClick={() => void send({ version: 2, kind: 'join', gameId: game.id })}
          type="button"
        >
          Join game
        </button>
      )}
      {isOwner && (
        <button
          className="mt-5 rounded-xl bg-violet-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50"
          disabled={busy || game.joined.length < MIN_PLAYERS || game.joined.length > MAX_PLAYERS}
          onClick={() =>
            void send({
              version: 2,
              kind: 'start',
              gameId: game.id,
              players: game.joined,
            })
          }
          type="button"
        >
          Start game
        </button>
      )}
      {isOwner && (
        <button
          className="ml-3 mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-400/60 px-5 py-3 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-50"
          disabled={busy}
          onClick={() => void send({ version: 2, kind: 'cancel', gameId: game.id })}
          type="button"
        >
          <X size={17} />
          Cancel game
        </button>
      )}
      {!isOwner && game.joined.includes(userId) && (
        <p className="mt-5 text-slate-300">Waiting for the host to start…</p>
      )}
    </section>
  );
}
