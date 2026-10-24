import { useState } from 'react';
import { X } from 'lucide-react';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUND_MS,
  ROUND_OPTIONS,
  type Game,
  type GameAction,
} from '../model/game';
import { displayName, type MemberProfile } from '@matrix-widgets/widget-shared';

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
  const [turns, setTurns] = useState<number | 'all'>('all');
  const [roundMs, setRoundMs] = useState<number>(ROUND_MS);
  const steps = turns === 'all' ? game.joined.length : Math.min(turns, game.joined.length);
  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
      <h2 className="text-xl font-bold">
        Lobby · {game.joined.length} player{game.joined.length === 1 ? '' : 's'}
      </h2>
      <p className="mt-2 text-sm text-slate-300">
        Each person opens this widget in their Matrix client and joins here. The creator starts when
        everyone is ready ({MIN_PLAYERS}–{MAX_PLAYERS} players).
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
      {isOwner && (
        <div className="mt-5 flex flex-wrap gap-4 rounded-xl bg-slate-800 p-4">
          <label className="text-sm font-medium text-slate-200">
            Turns per story
            <select
              className="mt-1 block rounded-lg border border-slate-600 bg-slate-900 px-3 py-2"
              value={turns}
              onChange={(event) =>
                setTurns(event.target.value === 'all' ? 'all' : Number(event.target.value))
              }
            >
              <option value="all">All players ({game.joined.length})</option>
              {Array.from(
                { length: Math.max(0, game.joined.length - 2) },
                (_, index) => index + 2,
              ).map((count) => (
                <option key={count} value={count}>
                  {count} turns
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-200">
            Time per turn
            <select
              className="mt-1 block rounded-lg border border-slate-600 bg-slate-900 px-3 py-2"
              value={roundMs}
              onChange={(event) => setRoundMs(Number(event.target.value))}
            >
              {ROUND_OPTIONS.map((duration) => (
                <option key={duration} value={duration}>
                  {duration / 60_000} minute{duration === 60_000 ? '' : 's'}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
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
              steps,
              roundMs,
            })
          }
          type="button"
        >
          Start game
        </button>
      )}
      {!isOwner && game.joined.includes(userId) && (
        <button
          className="ml-3 mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-400/60 px-5 py-3 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-50"
          disabled={busy || !connected}
          onClick={() => void send({ version: 2, kind: 'leave', gameId: game.id })}
          type="button"
        >
          <X size={17} />
          Leave game
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
