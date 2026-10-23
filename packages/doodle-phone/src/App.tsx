import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { displayName, useRoomMemberProfiles, widgetUrlParam } from '@widget-games/widget-shared';
import Lobby from './components/Lobby';
import { useMatrixGame } from './matrix/useMatrixGame';
import Playing from './components/Playing';
import Reveal from './components/Reveal';
import { gamesFromEvents } from './model/game';

export default function App() {
  const widgetId = useMemo(() => widgetUrlParam('widgetId'), []);
  const userId = useMemo(() => widgetUrlParam('userId'), []);
  const roomId = useMemo(() => widgetUrlParam('roomId'), []);
  const missingSetup = window.parent === window || !widgetId || !userId;
  const { api, connected, gameStateReady, permissionDenied, events, busy, error, setError, send } =
    useMatrixGame(widgetId, !missingSetup);
  const [fullscreen, setFullscreen] = useState(false);
  const [maximizedInElement, setMaximizedInElement] = useState(false);
  const [viewPrevious, setViewPrevious] = useState(false);
  const { current: game, previousReveal } = useMemo(() => gamesFromEvents(events), [events]);
  const showingPrevious =
    viewPrevious && previousReveal && game?.phase !== 'playing' && game?.phase !== 'reveal';
  const { members, avatarUrls } = useRoomMemberProfiles(
    api,
    connected,
    game?.phase === 'lobby' ? game.joined : [],
  );

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (maximizedInElement && roomId) {
      window.parent.postMessage({ type: 'doodle-phone:layout', roomId, container: 'top' }, '*');
      setMaximizedInElement(false);
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      if (!roomId || window.parent === window) {
        setError('Full screen is unavailable in this browser.');
        return;
      }
      window.parent.postMessage({ type: 'doodle-phone:layout', roomId, container: 'center' }, '*');
      setMaximizedInElement(true);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl bg-gradient-to-br from-violet-700 via-fuchsia-700 to-rose-600 p-5 shadow-lg sm:p-7">
          <button
            type="button"
            className="float-right flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/30"
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen || maximizedInElement ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            {fullscreen || maximizedInElement ? 'Restore' : 'Full screen'}
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">
            Matrix room game
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Doodle Phone</h1>
          <p className="mt-2 text-sm text-white/85">
            Write it. Draw it. Guess it. See how the story changes.
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
          <span>
            {connected
              ? '● Ready to play'
              : missingSetup
                ? '○ Setup needed'
                : permissionDenied
                  ? '○ Permission needed'
                  : '○ Connecting…'}
          </span>
          {userId && (
            <span>
              Playing as{' '}
              <strong className="text-white">{members[userId]?.name ?? displayName(userId)}</strong>
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/50 bg-rose-950/60 p-3 text-sm text-rose-100"
          >
            {error}
          </div>
        )}
        {missingSetup && (
          <section role="alert" className="rounded-2xl border border-amber-500/50 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">Open this in a Matrix room</h2>
            <p className="mt-2 text-slate-300">
              {window.parent === window
                ? 'Add this page as a room widget and open it inside your Matrix client.'
                : `The widget URL is missing ${[!widgetId && 'widgetId', !userId && 'userId'].filter(Boolean).join(' and ')}. Add the Matrix URL placeholders to the room widget URL, then reopen it.`}
            </p>
          </section>
        )}

        {connected && gameStateReady && userId && !game && (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">Start a game</h2>
            <p className="mt-2 text-slate-300">
              Everyone opens the same room widget. Create a lobby, then invite at least one other
              player.
            </p>
            <button
              className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
              disabled={busy}
              onClick={() => void send({ version: 2, kind: 'create', gameId: crypto.randomUUID() })}
              type="button"
            >
              Create lobby
            </button>
          </section>
        )}

        {previousReveal && game?.phase !== 'playing' && game?.phase !== 'reveal' && (
          <button
            className="rounded-xl border border-violet-400/60 px-4 py-2 font-bold text-violet-100 hover:bg-violet-950"
            onClick={() => setViewPrevious((value) => !value)}
            type="button"
          >
            {showingPrevious ? 'Back to current game' : 'View last reveal'}
          </button>
        )}

        {game?.phase === 'lobby' && userId && !showingPrevious && (
          <Lobby
            game={game}
            userId={userId}
            connected={connected}
            busy={busy}
            members={members}
            avatarUrls={avatarUrls}
            send={send}
          />
        )}

        {game?.phase === 'playing' && userId && (
          <Playing
            key={`${game.id}-${game.round}`}
            game={game}
            userId={userId}
            busy={busy}
            send={send}
          />
        )}
        {game?.phase === 'reveal' && userId && (
          <Reveal key={game.id} game={game} busy={busy} send={send} allowNewGame />
        )}
        {showingPrevious && (
          <Reveal key={previousReveal.id} game={previousReveal} busy={busy} send={send} />
        )}
      </div>
    </main>
  );
}
