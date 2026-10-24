import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Maximize2 } from 'lucide-react';
import { MatrixCapabilities } from '@widget-games/widget-shared';
import {
  displayName,
  useRoomEventChannel,
  useRoomMemberProfiles,
  widgetUrlParam,
  type RoomEvent,
} from '@widget-games/widget-shared';
import StartScreen from './components/StartScreen';
import Lobby from './components/Lobby';
import Choosing from './components/Choosing';
import Board from './components/Board';
import { EVENT_TYPE, compactDrawing, gameFromEvents, type Stroke } from './model/game';
import { normalizeGuess, wordChoices, wordMask } from './model/words';
import { useLiveRoom, type Packet } from './rtc/useLiveRoom';
import { readCurrentGameEvents } from './matrix/readEvents';
import icon from './assets/icon.svg?raw';

const capabilities = [MatrixCapabilities.MSC4515RtcTransports];

export default function App() {
  const widgetId = useMemo(() => widgetUrlParam('widgetId'), []);
  const userId = useMemo(() => widgetUrlParam('userId'), []);
  const roomId = useMemo(() => widgetUrlParam('roomId'), []);
  const missing = !widgetId || !userId || !roomId || window.parent === window;
  const { api, connected, stateReady, events, busy, error, setError, send } = useRoomEventChannel<
    RoomEvent,
    object
  >({
    widgetId,
    enabled: !missing,
    eventType: EVENT_TYPE,
    readEvents: readCurrentGameEvents,
    capabilities,
  });
  const game = useMemo(() => gameFromEvents(events), [events]);
  const [rounds, setRounds] = useState(2);
  const [seconds, setSeconds] = useState(90);
  const [word, setWord] = useState('');
  const [guess, setGuess] = useState('');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [remoteDraft, setRemoteDraft] = useState<Stroke | null>(null);
  const completedStrokeIds = useRef(new Set<string>());
  const [chat, setChat] = useState<{ player: string; guess: string }[]>([]);
  const [now, setNow] = useState(Date.now());
  const pending = useRef(false);
  const pendingHint = useRef(-1);
  const pendingAdvance = useRef(false);
  const gameId = game?.phase !== 'finished' ? (game?.id ?? null) : null;
  const { members, avatarUrls } = useRoomMemberProfiles(api, connected, game?.players ?? []);
  const isDrawer = !!game && game.drawer === userId;
  const roundKey = game ? `${game.id}:${game.index}` : '';
  const wordRef = useRef(word);
  wordRef.current = word;
  const gameRef = useRef(game);
  gameRef.current = game;
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  async function action(kind: string, fields: Record<string, unknown> = {}) {
    if (!game) return false;
    return send({ version: 1, gameId: game.id, kind, ...fields });
  }

  async function onPacket(packet: Packet, identity: string) {
    const current = gameRef.current;
    if (packet.kind === 'presence') return;
    if (!current || packet.index !== current.index || current.phase !== 'drawing') return;
    if (
      packet.kind === 'stroke' &&
      !isDrawer &&
      live.identities[current.drawer ?? ''] === identity
    ) {
      completedStrokeIds.current.add(packet.stroke.id);
      setRemoteDraft((draft) => (draft?.id === packet.stroke.id ? null : draft));
      setStrokes((old) =>
        old.some((item) => item.id === packet.stroke.id) ? old : [...old, packet.stroke],
      );
    } else if (
      packet.kind === 'undo' &&
      !isDrawer &&
      live.identities[current.drawer ?? ''] === identity
    ) {
      completedStrokeIds.current.add(packet.strokeId);
      setStrokes((old) => old.filter((stroke) => stroke.id !== packet.strokeId));
      setRemoteDraft((draft) => (draft?.id === packet.strokeId ? null : draft));
    } else if (
      packet.kind === 'draft' &&
      !isDrawer &&
      live.identities[current.drawer ?? ''] === identity &&
      !completedStrokeIds.current.has(packet.stroke.id)
    ) {
      setRemoteDraft(packet.stroke);
    } else if (
      packet.kind === 'clear' &&
      !isDrawer &&
      live.identities[current.drawer ?? ''] === identity
    ) {
      setStrokes([]);
      setRemoteDraft(null);
      completedStrokeIds.current.clear();
    } else if (packet.kind === 'sync' && isDrawer && identity) {
      void (async () => {
        await live.send({ kind: 'clear', index: current.index }, identity);
        for (const stroke of strokesRef.current) {
          await live.send({ kind: 'stroke', stroke, index: current.index }, identity);
        }
      })();
    } else if (
      packet.kind === 'guess' &&
      isDrawer &&
      current.players.includes(packet.player) &&
      live.identities[packet.player] === identity &&
      !current.solved.includes(packet.player)
    ) {
      const text = packet.guess.trim().slice(0, 80);
      if (!text) return;
      if (
        normalizeGuess(text, current.language) === normalizeGuess(wordRef.current, current.language)
      ) {
        const remaining = Math.max(
          0,
          current.seconds - Math.floor((Date.now() - current.startedAt) / 1000),
        );
        await action('solve', {
          index: current.index,
          player: packet.player,
          points: Math.max(10, Math.round((100 * remaining) / current.seconds)),
        });
      } else {
        setChat((old) => [...old.slice(-29), { player: packet.player, guess: text }]);
        void live.send({ kind: 'chat', player: packet.player, guess: text, index: current.index });
      }
    } else if (packet.kind === 'chat' && live.identities[current.drawer ?? ''] === identity) {
      setChat((old) => [...old.slice(-29), { player: packet.player, guess: packet.guess }]);
    }
  }

  const live = useLiveRoom(connected ? api : null, roomId, gameId, onPacket);
  const remaining =
    game?.phase === 'drawing'
      ? Math.max(0, game.seconds - Math.floor((now - game.startedAt) / 1000))
      : 0;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    setStrokes([]);
    setRemoteDraft(null);
    completedStrokeIds.current.clear();
    setChat([]);
    pending.current = false;
    pendingHint.current = -1;
    pendingAdvance.current = false;
    setWord(roundKey ? (sessionStorage.getItem(`sketch-word:${roundKey}`) ?? '') : '');
  }, [roundKey]);
  useEffect(() => {
    if (live.state === 'connected' && game?.phase === 'drawing' && !isDrawer) {
      void live.send({ kind: 'sync', index: game.index });
    }
  }, [live.state, roundKey, game?.phase, isDrawer]);
  useEffect(() => {
    if (
      !game ||
      game.phase !== 'choosing' ||
      !game.players.includes(userId ?? '') ||
      now < game.choosingAt + 30_000 ||
      pending.current
    )
      return;
    pending.current = true;
    void action('skip', { index: game.index }).then((ok) => {
      if (!ok) pending.current = false;
    });
  }, [now, game?.phase, game?.index, userId]);
  useEffect(() => {
    const allSolved = game?.players.every(
      (player) => player === game.drawer || game.solved.includes(player),
    );
    if (
      !game ||
      !isDrawer ||
      game.phase !== 'drawing' ||
      (remaining > 0 && !allSolved) ||
      !word ||
      pending.current
    )
      return;
    pending.current = true;
    void action('reveal', {
      index: game.index,
      word,
      strokes: compactDrawing(strokesRef.current),
    }).then((ok) => {
      if (!ok) pending.current = false;
    });
  }, [remaining, game?.phase, game?.index, game?.solved, isDrawer, word]);
  useEffect(() => {
    if (
      !game ||
      game.phase !== 'drawing' ||
      !isDrawer ||
      !word ||
      game.hints === 0 ||
      game.hintCount >= game.hints ||
      pendingHint.current === game.hintCount ||
      remaining <= 0
    )
      return;
    const elapsed = game.seconds - remaining;
    if (elapsed < (game.seconds * (game.hintCount + 1)) / (game.hints + 1)) return;
    const hidden = Array.from(game.mask).flatMap((char, index) => (char === '_' ? [index] : []));
    if (!hidden.length) return;
    const position = hidden[(game.index * 17 + game.hintCount * 7) % hidden.length]!;
    pendingHint.current = game.hintCount;
    void action('hint', { index: game.index, position, letter: Array.from(word)[position] }).then(
      (ok) => {
        if (!ok) {
          pendingHint.current = -1;
          setError('Could not send a word hint.');
        }
      },
    );
  }, [remaining, game?.mask, game?.hintCount, game?.phase, word, isDrawer]);
  useEffect(() => {
    if (
      !game ||
      game.phase !== 'reveal' ||
      !game.players.includes(userId ?? '') ||
      now < game.revealedAt + 5000 ||
      pendingAdvance.current
    )
      return;
    pendingAdvance.current = true;
    void action('start').then((ok) => {
      if (!ok) pendingAdvance.current = false;
    });
  }, [now, game?.phase, game?.index, userId]);
  useEffect(() => {
    if (
      !game ||
      game.phase !== 'drawing' ||
      !game.players.includes(userId ?? '') ||
      now < game.startedAt + game.seconds * 1000 + 5000 ||
      pending.current
    )
      return;
    pending.current = true;
    void action('expire', { index: game.index }).then((ok) => {
      if (!ok) pending.current = false;
    });
  }, [now, game?.phase, game?.index, userId]);

  async function choose(chosen: string) {
    if (!game || !isDrawer) return;
    sessionStorage.setItem(`sketch-word:${roundKey}`, chosen);
    setWord(chosen);
    await action('round', { index: game.index, mask: wordMask(chosen) });
  }
  async function submitGuess(event: FormEvent) {
    event.preventDefault();
    if (!game || !guess.trim() || live.state !== 'connected') return;
    const drawerIdentity = live.identities[game.drawer ?? ''];
    if (!drawerIdentity) {
      setError('Waiting for the drawer’s live connection.');
      return;
    }
    const text = guess.trim().slice(0, 80);
    setGuess('');
    const sent = await live.send(
      { kind: 'guess', player: userId!, guess: text, index: game.index },
      drawerIdentity,
    );
    if (!sent) setError('The live connection is unavailable.');
  }
  const choices = useMemo(() => {
    return game ? wordChoices(game.language, game.customWords, game.usedWords) : [];
  }, [roundKey, game?.language, game?.customWords.join('\n'), game?.usedWords.join('\n')]);

  return (
    <main className="min-h-screen bg-slate-950 p-3 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-indigo-700 to-fuchsia-700 p-5">
          <div className="flex items-center gap-4">
            <img
              src={`data:image/svg+xml,${encodeURIComponent(icon)}`}
              alt=""
              className="h-14 w-14 rounded-xl"
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/70">
                Matrix room game
              </p>
              <h1 className="text-3xl font-black">Sketch & Guess</h1>
              <p className="text-sm text-white/80">Draw live. Guess fast. Score points.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void document.documentElement.requestFullscreen()}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2"
          >
            <Maximize2 size={16} /> Full screen
          </button>
        </header>
        <div className="flex justify-between text-sm text-slate-300">
          <span>
            {connected ? '● Ready' : '○ Connecting…'}
            {game && ` · Live: ${live.state}`}
          </span>
          <span>{userId && (members[userId]?.name ?? displayName(userId))}</span>
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-950 p-3 text-rose-200">
            {error}
          </p>
        )}
        {live.error && (
          <p role="alert" className="rounded-lg bg-amber-950 p-3 text-amber-200">
            {live.error} Check your LiveKit service and its browser certificate.
          </p>
        )}
        {missing && (
          <p className="rounded-xl bg-slate-800 p-5">
            Add this page as a Matrix room widget with widgetId, userId, roomId, and deviceId URL
            placeholders.
          </p>
        )}
        {connected && stateReady && (!game || game.phase === 'finished') && (
          <StartScreen
            game={game}
            members={members}
            rounds={rounds}
            setRounds={setRounds}
            seconds={seconds}
            setSeconds={setSeconds}
            busy={busy}
            onCreate={() =>
              void send({
                version: 1,
                kind: 'create',
                gameId: crypto.randomUUID(),
                rounds,
                seconds,
                language: 'en',
              })
            }
          />
        )}
        {game?.phase === 'lobby' && (
          <Lobby
            game={game}
            userId={userId}
            members={members}
            avatarUrls={avatarUrls}
            busy={busy}
            canCancel={
              userId === game.host ||
              (game.players.includes(userId ?? '') && now >= game.createdAt + 120_000)
            }
            onAction={(kind) => void action(kind)}
            onSettings={(settings) => void action('settings', settings)}
          />
        )}
        {game?.phase === 'choosing' && (
          <Choosing
            game={game}
            isDrawer={isDrawer}
            members={members}
            choices={choices}
            busy={busy}
            liveConnected={live.state === 'connected'}
            secondsLeft={Math.max(0, Math.ceil((game.choosingAt + 30_000 - now) / 1000))}
            onChoose={(choice) => void choose(choice)}
          />
        )}
        {game && (game.phase === 'drawing' || game.phase === 'reveal') && (
          <Board
            game={game}
            userId={userId}
            members={members}
            isDrawer={isDrawer}
            word={word}
            remaining={remaining}
            strokes={strokes}
            setStrokes={setStrokes}
            liveConnected={live.state === 'connected'}
            drawerConnected={!!live.identities[game.drawer ?? '']}
            onStroke={(stroke) => void live.send({ kind: 'stroke', stroke, index: game.index })}
            onDraft={(stroke) => void live.send({ kind: 'draft', stroke, index: game.index })}
            onClear={() => void live.send({ kind: 'clear', index: game.index })}
            onUndo={(strokeId) => void live.send({ kind: 'undo', strokeId, index: game.index })}
            remoteDraft={remoteDraft}
            onNext={() => void action('start')}
            canAdvance={
              userId === game.host ||
              (game.players.includes(userId ?? '') && now >= game.revealedAt + 5000)
            }
            busy={busy}
            chat={chat}
            guess={guess}
            setGuess={setGuess}
            onGuess={(event) => void submitGuess(event)}
          />
        )}
      </div>
    </main>
  );
}
