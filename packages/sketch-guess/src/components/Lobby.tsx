import { useEffect, useState } from 'react';
import { Play, Users } from 'lucide-react';
import { displayName, type MemberProfile } from '@matrix-widgets/widget-shared';
import type { Game } from '../model/game';
import type { Language } from '../model/words';

export default function Lobby({
  game,
  userId,
  members,
  avatarUrls,
  busy,
  canCancel,
  onAction,
  onSettings,
}: {
  game: Game;
  userId: string | null;
  members: Record<string, MemberProfile>;
  avatarUrls: Record<string, string>;
  busy: boolean;
  canCancel: boolean;
  onAction: (kind: string) => void;
  onSettings: (settings: { language: Language; hints: number; customWords: string[] }) => void;
}) {
  const [language, setLanguage] = useState<Language>(game.language);
  const [hints, setHints] = useState(game.hints);
  const [customText, setCustomText] = useState(game.customWords.join('\n'));
  useEffect(() => {
    setLanguage(game.language);
    setHints(game.hints);
    setCustomText(game.customWords.join('\n'));
  }, [game.language, game.hints, game.customWords]);
  const customWords = [
    ...new Set(
      customText
        .split('\n')
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
  const valid =
    customWords.length <= 100 &&
    customWords.every((word) => word.length <= 40 && /[\p{L}\p{N}]/u.test(word));
  const dirty =
    language !== game.language ||
    hints !== game.hints ||
    customWords.join('\n') !== game.customWords.join('\n');
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
      {userId === game.host ? (
        <div className="mb-4 grid gap-3 rounded-xl bg-slate-800 p-4 sm:grid-cols-2">
          <label className="grid gap-1">
            Word list
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              className="rounded bg-slate-700 p-2"
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <label className="grid gap-1">
            Hints per turn
            <select
              value={hints}
              onChange={(event) => setHints(Number(event.target.value))}
              className="rounded bg-slate-700 p-2"
            >
              {[0, 1, 2, 3].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 sm:col-span-2">
            Custom words (one per line, added to the selected list)
            <textarea
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
              rows={3}
              className="rounded bg-slate-700 p-2"
            />
          </label>
          {!valid && (
            <p role="alert" className="text-rose-300">
              Use at most 100 words, up to 40 characters each.
            </p>
          )}
          <button
            disabled={busy || !dirty || !valid}
            onClick={() => onSettings({ language, hints, customWords })}
            className="w-fit rounded bg-indigo-500 px-4 py-2 disabled:opacity-50"
          >
            Save settings
          </button>
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-300">
          Word list: {game.language === 'de' ? 'Deutsch' : 'English'} · {game.hints} hints ·{' '}
          {game.customWords.length} custom words
        </p>
      )}
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
              disabled={busy || dirty || game.players.length < 2}
              onClick={() => onAction('start')}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 disabled:opacity-50"
            >
              <Play size={16} /> Start
            </button>
          </>
        )}
        {canCancel && (
          <button
            disabled={busy}
            onClick={() => onAction('cancel')}
            className="rounded-lg bg-slate-700 px-4 py-2"
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
