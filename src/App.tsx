import { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetApi } from 'matrix-widget-api';
import { Maximize2, Minimize2 } from 'lucide-react';
import Lobby from './Lobby';
import { displayName, usePlayerProfiles } from './PlayerProfiles';
import Playing from './Playing';
import Reveal from './Reveal';
import { GAME_EVENT, gameFromEvents, type GameAction, type GameEvent } from './game';

function urlParam(name: string): string | null {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#\/?\??/, ''));
  return query.get(name) ?? fragment.get(name);
}

export default function App() {
  const widgetId = useMemo(() => urlParam('widgetId'), []);
  const userId = useMemo(() => urlParam('userId'), []);
  const roomId = useMemo(() => urlParam('roomId'), []);
  const apiRef = useRef<WidgetApi | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [maximizedInElement, setMaximizedInElement] = useState(false);
  const game = useMemo(() => gameFromEvents(events), [events]);
  const { members, avatarUrls } = usePlayerProfiles(apiRef.current, connected, game);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);


  useEffect(() => {
    if (window.parent === window || !widgetId || !userId) return;
    const api = new WidgetApi(widgetId, '*');
    apiRef.current = api;
    api.requestCapabilityToSendEvent(GAME_EVENT);
    api.requestCapabilityToReceiveEvent(GAME_EVENT);
    api.requestCapabilityToReceiveState('m.room.member');
    let alive = true;
    let interval: number | undefined;
    let reading = false;

    async function refresh() {
      if (reading) return;
      reading = true;
      try {
        const roomEvents = await api.readRoomEvents(GAME_EVENT, 100);
        if (alive) {
          setEvents(roomEvents);
          setError('');
        }

      } catch (cause) {
        if (alive) setError(`Could not read game state: ${String(cause)}`);
      } finally {
        reading = false;
      }
    }
    refreshRef.current = refresh;
    api.on('ready', () => {
      if (!alive) return;
      setConnected(true);
      void refresh();
      interval = window.setInterval(() => void refresh(), 2000);
    });
    api.start();
    const loadedTimer = window.setTimeout(() => void api.sendContentLoaded().catch(() => undefined), 500);
    return () => {
      alive = false;
      window.clearTimeout(loadedTimer);
      if (interval !== undefined) window.clearInterval(interval);
      api.transport.stop();
      apiRef.current = null;
      refreshRef.current = null;
    };
  }, [widgetId, userId]);


  async function send(action: GameAction): Promise<boolean> {
    if (!apiRef.current || !connected) return false;
    setBusy(true);
    setError('');
    try {
      await apiRef.current.sendRoomEvent(GAME_EVENT, action);
      await refreshRef.current?.();
      return true;
    } catch (cause) {
      setError(`Could not save turn: ${String(cause)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

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
          <button type="button" className="float-right flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/30" onClick={() => void toggleFullscreen()}>
            {fullscreen || maximizedInElement ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            {fullscreen || maximizedInElement ? 'Restore' : 'Full screen'}
          </button>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/75">Matrix room game</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Doodle Phone</h1>
          <p className="mt-2 text-sm text-white/85">Write it. Draw it. Guess it. See how the story changes.</p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
          <span>{connected ? '● Connected to Element' : '○ Waiting for Element'}</span>
          {userId && <span>Playing as <strong className="text-white">{members[userId]?.name ?? displayName(userId)}</strong></span>}
        </div>

        {error && <div role="alert" className="rounded-xl border border-rose-500/50 bg-rose-950/60 p-3 text-sm text-rose-100">{error}</div>}
        {(!widgetId || !userId || window.parent === window) && (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">Open this in Element</h2>
            <p className="mt-2 text-slate-300">Add this page as a widget in a Matrix room. The room supplies the widget and player IDs.</p>
          </section>
        )}

        {connected && userId && !game && (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">Start a game</h2>
            <p className="mt-2 text-slate-300">Everyone opens the same room widget. Create a lobby, then invite at least one other player.</p>
            <button className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50" disabled={busy} onClick={() => void send({ version: 1, kind: 'create', gameId: crypto.randomUUID() })} type="button">Create lobby</button>
          </section>
        )}

        {game?.phase === 'lobby' && userId && <Lobby game={game} userId={userId} connected={connected} busy={busy} members={members} avatarUrls={avatarUrls} send={send} />}

        {game?.phase === 'playing' && userId && <Playing key={game.id} game={game} userId={userId} busy={busy} send={send} />}
        {game?.phase === 'reveal' && <Reveal game={game} busy={busy} send={send} />}
      </div>
    </main>
  );
}
