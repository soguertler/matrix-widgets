import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Pencil, Send, Timer } from 'lucide-react';
import { displayName, type MemberProfile } from '@widget-games/widget-shared';
import type { Game, Stroke } from '../model/game';
import Canvas from './Canvas';

export default function Board({
  game,
  userId,
  members,
  isDrawer,
  word,
  remaining,
  strokes,
  setStrokes,
  liveConnected,
  drawerConnected,
  onStroke,
  onDraft,
  onClear,
  remoteDraft,
  onNext,
  canAdvance,
  busy,
  chat,
  guess,
  setGuess,
  onGuess,
}: {
  game: Game;
  userId: string | null;
  members: Record<string, MemberProfile>;
  isDrawer: boolean;
  word: string;
  remaining: number;
  strokes: Stroke[];
  setStrokes: Dispatch<SetStateAction<Stroke[]>>;
  liveConnected: boolean;
  drawerConnected: boolean;
  onStroke: (stroke: Stroke) => void;
  onDraft: (stroke: Stroke) => void;
  onClear: () => void;
  remoteDraft: Stroke | null;
  onNext: () => void;
  canAdvance: boolean;
  busy: boolean;
  chat: { player: string; guess: string }[];
  guess: string;
  setGuess: (value: string) => void;
  onGuess: (event: FormEvent) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
      <section className="rounded-2xl bg-slate-900 p-4">
        <div className="mb-3 flex flex-wrap justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">
              {game.phase === 'reveal'
                ? `The word was ${game.word}`
                : isDrawer
                  ? `Draw: ${word || 'loading…'}`
                  : `${game.length} letters`}
            </h2>
            <p className="text-sm text-slate-400">
              <Pencil size={14} className="inline" />{' '}
              {members[game.drawer ?? '']?.name ?? displayName(game.drawer ?? '')} is drawing
            </p>
          </div>
          <span className="flex items-center gap-1 text-xl font-bold">
            <Timer size={20} /> {remaining}s
          </span>
        </div>
        <Canvas
          strokes={game.phase === 'reveal' ? game.strokes : strokes}
          setStrokes={setStrokes}
          editable={game.phase === 'drawing' && isDrawer && remaining > 0 && liveConnected}
          onStroke={onStroke}
          onDraft={onDraft}
          onClear={onClear}
          remoteDraft={remoteDraft}
        />
        {game.phase === 'reveal' && canAdvance && (
          <button
            onClick={onNext}
            disabled={busy}
            className="mt-4 rounded-lg bg-indigo-500 px-5 py-2 font-bold"
          >
            Next round
          </button>
        )}
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl bg-slate-900 p-4">
          <h3 className="mb-2 font-bold">Scores</h3>
          {[...game.players]
            .sort((a, b) => game.scores[b]! - game.scores[a]!)
            .map((id) => (
              <p key={id} className="flex justify-between py-1">
                <span>
                  {members[id]?.name ?? displayName(id)}
                  {game.solved.includes(id) && ' ✓'}
                </span>
                <strong>{game.scores[id]}</strong>
              </p>
            ))}
        </section>
        <section className="rounded-2xl bg-slate-900 p-4">
          <h3 className="mb-2 font-bold">Guesses</h3>
          <div className="h-48 overflow-auto text-sm">
            {chat.map((entry, index) => (
              <p key={index} className="py-1">
                <strong>{members[entry.player]?.name ?? displayName(entry.player)}:</strong>{' '}
                {entry.guess}
              </p>
            ))}
          </div>
          {game.phase === 'drawing' &&
            !isDrawer &&
            game.players.includes(userId ?? '') &&
            !game.solved.includes(userId ?? '') && (
              <form onSubmit={onGuess} className="mt-3 flex gap-2">
                <input
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  maxLength={80}
                  placeholder="Your guess"
                  className="min-w-0 flex-1 rounded bg-slate-800 p-2"
                />
                <button
                  aria-label="Send guess"
                  disabled={!liveConnected || !drawerConnected}
                  className="rounded bg-indigo-500 p-2 disabled:opacity-50"
                >
                  <Send size={17} />
                </button>
              </form>
            )}
        </section>
      </aside>
    </div>
  );
}
