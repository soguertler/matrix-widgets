import { useEffect, useMemo, useRef, useState } from 'react';
import { WidgetApi } from 'matrix-widget-api';
import { Maximize2, Minimize2, Timer } from 'lucide-react';
import DrawingPad, { Drawing } from './DrawingPad';
import {
  allSubmitted, bookOwner, GAME_EVENT, gameFromEvents, previousEntry,
  submittedForPlayer, submissionKey,
  type Entry, type GameAction, type GameEvent, type Stroke,
} from './game';

function urlParam(name: string): string | null {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#\/?\??/, ''));
  return query.get(name) ?? fragment.get(name);
}

function displayName(userId: string): string {
  return userId.match(/^@([^:]+):/)?.[1] ?? userId;
}

function RoundEntry({ entry }: { entry: Entry }) {
  return entry.kind === 'drawing'
    ? <Drawing strokes={entry.strokes} />
    : <p className="rounded-xl bg-slate-800 p-4 text-lg font-semibold break-words">{entry.text}</p>;
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
  const [text, setText] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [now, setNow] = useState(Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const [maximizedInElement, setMaximizedInElement] = useState(false);
  const game = useMemo(() => gameFromEvents(events), [events]);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  useEffect(() => {
    if (game?.phase !== 'playing') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [game?.phase, game?.roundStartedAt]);

  useEffect(() => {
    if (window.parent === window || !widgetId || !userId) return;
    const api = new WidgetApi(widgetId, '*');
    apiRef.current = api;
    api.requestCapabilityToSendEvent(GAME_EVENT);
    api.requestCapabilityToReceiveEvent(GAME_EVENT);
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

  const isOwner = game?.owner === userId;
  const isPlayer = !!(game && userId && game.players.includes(userId));
  const myBook = game && userId ? bookOwner(game.players, userId, game.round) : null;
  const previous = game && userId ? previousEntry(game, userId) : null;
  const submitted = !!(game && userId && submittedForPlayer(game, userId));
  const complete = !!(game && game.phase === 'playing' && allSubmitted(game));
  const submittedCount = game?.phase === 'playing'
    ? game.players.filter((player) => {
        const book = bookOwner(game.players, player, game.round);
        return book && game.submissions.has(submissionKey(game.round, book));
      }).length
    : 0;
  const roundIsDrawing = !!(game && game.round % 2 === 1);
  const roundName = !game ? '' : game.round === 0 ? 'Write a prompt' : roundIsDrawing ? 'Draw what you read' : 'Guess what you see';
  const secondsLeft = game?.phase === 'playing' ? Math.max(0, Math.ceil((game.roundStartedAt + 120_000 - now) / 1000)) : 0;
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (maximizedInElement && roomId) {
      window.parent.postMessage({ type: 'drawing-phone:layout', roomId, container: 'top' }, '*');
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
      window.parent.postMessage({ type: 'drawing-phone:layout', roomId, container: 'center' }, '*');
      setMaximizedInElement(true);
    }
  }

  async function submitTurn() {
    if (!game || !userId || !isPlayer || submitted) return;
    const entry: Entry = roundIsDrawing
      ? { kind: 'drawing', strokes }
      : { kind: 'text', text: text.trim().slice(0, 180) };
    if (entry.kind === 'drawing' && entry.strokes.length === 0) return;
    if (entry.kind === 'text' && !entry.text) return;
    const saved = await send({ version: 1, kind: 'submit', gameId: game.id, round: game.round, entry });
    if (saved) {
      setText('');
      setStrokes([]);
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
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Drawing Phone</h1>
          <p className="mt-2 text-sm text-white/85">Write it. Draw it. Guess it. See how the story changes.</p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
          <span>{connected ? '● Connected to Element' : '○ Waiting for Element'}</span>
          {userId && <span>Playing as <strong className="text-white">{displayName(userId)}</strong></span>}
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

        {game?.phase === 'lobby' && (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold">Lobby · {game.joined.length} player{game.joined.length === 1 ? '' : 's'}</h2>
            <p className="mt-2 text-sm text-slate-300">Each person opens this widget in Element and joins here. The creator starts when everyone is ready (2–3 players).</p>
            <div className="mt-4 flex flex-wrap gap-2">{game.joined.map((player) => <span key={player} className="rounded-full bg-slate-800 px-3 py-1 text-sm">{displayName(player)}{player === game.owner ? ' · host' : ''}</span>)}</div>
            {userId && !game.joined.includes(userId) && <button className="mt-5 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" disabled={busy || !connected} onClick={() => void send({ version: 1, kind: 'join', gameId: game.id })} type="button">Join game</button>}
            {isOwner && <button className="mt-5 rounded-xl bg-violet-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" disabled={busy || game.joined.length < 2 || game.joined.length > 3} onClick={() => void send({ version: 1, kind: 'start', gameId: game.id, players: game.joined, steps: game.joined.length % 2 === 1 ? game.joined.length : game.joined.length + 1 })} type="button">Start game</button>}
            {!isOwner && game.joined.includes(userId ?? '') && <p className="mt-5 text-slate-300">Waiting for the host to start…</p>}
          </section>
        )}

        {game?.phase === 'playing' && (
          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">Round {game.round + 1} of {game.steps} · {roundName}</h2>
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold ${secondsLeft <= 30 ? 'bg-amber-900 text-amber-100' : 'bg-slate-800'}`}><Timer size={15} />{clock}</span>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-sm">{submittedCount}/{game.players.length} ready</span>
              </div>
            </div>
            {secondsLeft === 0 && <p className="mt-3 text-sm text-amber-200">Time is up. You can still finish and submit your turn.</p>}
            {isPlayer && !submitted && (
              <div className="mt-5 space-y-4">
                {myBook && <p className="text-xs uppercase tracking-widest text-slate-400">Your turn in a secret chain</p>}
                {previous && <div><p className="mb-2 text-sm text-slate-400">Your clue</p><RoundEntry entry={previous.entry} /></div>}
                {roundIsDrawing ? (
                  <DrawingPad key={`${game.id}-${game.round}-${userId}`} onChange={setStrokes} />
                ) : (
                  <label className="block text-sm font-medium text-slate-300">
                    {game.round === 0 ? 'Your opening phrase' : 'What do you think this drawing shows?'}
                    <textarea className="mt-2 min-h-24 w-full rounded-xl border border-slate-600 bg-slate-800 p-3 text-base text-white outline-none focus:border-fuchsia-400" maxLength={180} placeholder={game.round === 0 ? 'A penguin driving a tiny bus…' : 'Write your guess…'} value={text} onChange={(event) => setText(event.target.value)} />
                  </label>
                )}
                <button className="rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50" disabled={busy || (roundIsDrawing ? strokes.length === 0 : !text.trim())} onClick={() => void submitTurn()} type="button">Submit turn</button>
              </div>
            )}
            {isPlayer && submitted && <p className="mt-5 rounded-xl bg-emerald-950/60 p-4 text-emerald-200">Turn submitted. Waiting for everyone else.</p>}
            {!isPlayer && <p className="mt-5 text-slate-300">This game is in progress. You can watch the reveal when it finishes.</p>}
            {isOwner && complete && <button className="mt-5 rounded-xl bg-violet-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" disabled={busy} onClick={() => void send(game.round + 1 === game.steps ? { version: 1, kind: 'reveal', gameId: game.id } : { version: 1, kind: 'advance', gameId: game.id, round: game.round })} type="button">{game.round + 1 === game.steps ? 'Reveal the stories' : 'Next round'}</button>}
          </section>
        )}

        {game?.phase === 'reveal' && (
          <section className="space-y-5">
            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
              <h2 className="text-2xl font-bold">The stories</h2>
              <p className="mt-2 text-slate-300">Follow each phrase as it turns into a drawing and then a new guess.</p>
              <button className="mt-4 rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-50" disabled={busy} onClick={() => void send({ version: 1, kind: 'create', gameId: crypto.randomUUID() })} type="button">New game</button>
            </div>
            {game.players.map((book) => (
              <article key={book} className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
                <h3 className="text-lg font-bold">{displayName(book)}’s story</h3>
                <div className="mt-4 space-y-4">
                  {Array.from({ length: game.steps }, (_, round) => {
                    const submission = game.submissions.get(submissionKey(round, book));
                    if (!submission) return null;
                    return <div key={round} className="rounded-xl border border-slate-700 p-3"><p className="mb-2 text-xs uppercase tracking-widest text-slate-400">{round + 1}. {displayName(submission.author)} · {submission.entry.kind === 'drawing' ? 'drawing' : round === 0 ? 'prompt' : 'guess'}</p><RoundEntry entry={submission.entry} /></div>;
                  })}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
