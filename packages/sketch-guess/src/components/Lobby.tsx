import { Play, Users } from 'lucide-react';
import { displayName, type MemberProfile } from '@widget-games/widget-shared';
import type { Game } from '../model/game';

export default function Lobby({
  game,
  userId,
  members,
  avatarUrls,
  busy,
  onAction,
}: {
  game: Game;
  userId: string | null;
  members: Record<string, MemberProfile>;
  avatarUrls: Record<string, string>;
  busy: boolean;
  onAction: (kind: string) => void;
}) {
  return (
    <section className="rounded-2xl bg-slate-900 p-5">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <Users /> Lobby · {game.players.length}/14
      </h2>
      <div className="my-4 flex flex-wrap gap-3">
        {game.players.map((id) => (
          <div key={id} className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2">
            {avatarUrls[id] ? (
              <img src={avatarUrls[id]} alt="" className="h-8 w-8 rounded-full" />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-500">
                {displayName(id)[0]?.toUpperCase()}
              </span>
            )}
            {members[id]?.name ?? displayName(id)}
            {id === game.host && ' ★'}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {!game.players.includes(userId ?? '') && (
          <button
            disabled={busy}
            onClick={() => onAction('join')}
            className="rounded-lg bg-indigo-500 px-4 py-2"
          >
            Join
          </button>
        )}
        {game.players.includes(userId ?? '') && userId !== game.host && (
          <button
            disabled={busy}
            onClick={() => onAction('leave')}
            className="rounded-lg bg-slate-700 px-4 py-2"
          >
            Leave
          </button>
        )}
        {userId === game.host && (
          <>
            <button
              disabled={busy || game.players.length < 2}
              onClick={() => onAction('start')}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 disabled:opacity-50"
            >
              <Play size={16} /> Start
            </button>
            <button
              disabled={busy}
              onClick={() => onAction('cancel')}
              className="rounded-lg bg-slate-700 px-4 py-2"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </section>
  );
}
