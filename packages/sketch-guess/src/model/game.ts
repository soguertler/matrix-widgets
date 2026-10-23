import type { RoomEvent } from '@widget-games/widget-shared';
import type { Language } from './words';

export const EVENT_TYPE = 'com.widget_games.sketch_guess';
export type Point = { x: number; y: number };
export type Stroke = { id: string; color: string; width: number; points: Point[] };
export function isStroke(value: unknown): value is Stroke {
  if (!value || typeof value !== 'object') return false;
  const stroke = value as Record<string, unknown>;
  return (
    typeof stroke.id === 'string' &&
    stroke.id.length <= 100 &&
    typeof stroke.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(stroke.color) &&
    typeof stroke.width === 'number' &&
    stroke.width >= 1 &&
    stroke.width <= 50 &&
    Array.isArray(stroke.points) &&
    stroke.points.length > 0 &&
    stroke.points.length <= 300 &&
    stroke.points.every((point: unknown) => {
      if (!point || typeof point !== 'object') return false;
      const p = point as Record<string, unknown>;
      return (
        typeof p.x === 'number' &&
        Number.isFinite(p.x) &&
        p.x >= 0 &&
        p.x <= 800 &&
        typeof p.y === 'number' &&
        Number.isFinite(p.y) &&
        p.y >= 0 &&
        p.y <= 500
      );
    })
  );
}
type Action =
  | { kind: 'create'; gameId: string; rounds: number; seconds: number; language: Language }
  | { kind: 'settings'; gameId: string; language: Language; customWords: string[]; hints: number }
  | { kind: 'join' | 'leave' | 'cancel' | 'start'; gameId: string }
  | { kind: 'round'; gameId: string; index: number; mask: string }
  | { kind: 'hint'; gameId: string; index: number; position: number; letter: string }
  | { kind: 'solve'; gameId: string; index: number; player: string; points: number }
  | { kind: 'expire'; gameId: string; index: number }
  | { kind: 'skip'; gameId: string; index: number }
  | { kind: 'reveal'; gameId: string; index: number; word: string; strokes: Stroke[] };

export type Game = {
  id: string;
  host: string;
  createdAt: number;
  players: string[];
  rounds: number;
  seconds: number;
  language: Language;
  customWords: string[];
  hints: number;
  usedWords: string[];
  phase: 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'finished';
  index: number;
  drawer: string | null;
  startedAt: number;
  choosingAt: number;
  revealedAt: number;
  mask: string;
  hintCount: number;
  word: string;
  strokes: Stroke[];
  scores: Record<string, number>;
  solved: string[];
};

export function compactDrawing(strokes: Stroke[]): Stroke[] {
  const recent = strokes.slice(-150);
  const total = recent.reduce((sum, stroke) => sum + stroke.points.length, 0);
  const step = Math.max(1, Math.ceil(total / 1800));
  return recent.map((stroke) => ({
    ...stroke,
    points: stroke.points.filter(
      (_, index) => index % step === 0 || index === stroke.points.length - 1,
    ),
  }));
}

function isAction(content: unknown): content is Action & { version: 1 } {
  if (!content || typeof content !== 'object') return false;
  const a = content as Record<string, unknown>;
  return a.version === 1 && typeof a.kind === 'string' && typeof a.gameId === 'string';
}

export function gameFromEvents(events: RoomEvent[]): Game | null {
  let game: Game | null = null;
  const ordered = [...events].sort(
    (a, b) => a.origin_server_ts - b.origin_server_ts || a.event_id.localeCompare(b.event_id),
  );
  for (const event of ordered) {
    if (!isAction(event.content)) continue;
    const action = event.content;
    if (action.kind === 'create') {
      if (
        !Number.isInteger(action.rounds) ||
        action.rounds < 1 ||
        action.rounds > 5 ||
        !Number.isInteger(action.seconds) ||
        action.seconds < 30 ||
        action.seconds > 180 ||
        (action.language !== 'en' && action.language !== 'de')
      )
        continue;
      if (game && game.phase !== 'finished') continue;
      game = {
        id: action.gameId,
        host: event.sender,
        createdAt: event.origin_server_ts,
        players: [event.sender],
        rounds: action.rounds,
        seconds: action.seconds,
        language: action.language,
        customWords: [],
        hints: 2,
        usedWords: [],
        phase: 'lobby',
        index: -1,
        drawer: null,
        startedAt: 0,
        choosingAt: 0,
        revealedAt: 0,
        mask: '',
        hintCount: 0,
        word: '',
        strokes: [],
        scores: { [event.sender]: 0 },
        solved: [],
      };
      continue;
    }
    if (!game || action.gameId !== game.id) continue;
    if (
      action.kind === 'settings' &&
      game.phase === 'lobby' &&
      event.sender === game.host &&
      (action.language === 'en' || action.language === 'de') &&
      Number.isInteger(action.hints) &&
      action.hints >= 0 &&
      action.hints <= 3 &&
      Array.isArray(action.customWords) &&
      action.customWords.length <= 100 &&
      action.customWords.every(
        (word) =>
          typeof word === 'string' &&
          word.trim().length > 0 &&
          word.length <= 40 &&
          /[\p{L}\p{N}]/u.test(word),
      )
    ) {
      game.language = action.language;
      game.customWords = action.customWords;
      game.hints = action.hints;
    } else if (
      action.kind === 'join' &&
      game.phase === 'lobby' &&
      !game.players.includes(event.sender) &&
      game.players.length < 14
    ) {
      game.players.push(event.sender);
      game.scores[event.sender] = 0;
    } else if (action.kind === 'leave' && game.phase === 'lobby' && event.sender !== game.host) {
      game.players = game.players.filter((id) => id !== event.sender);
      delete game.scores[event.sender];
    } else if (
      action.kind === 'cancel' &&
      game.phase === 'lobby' &&
      (event.sender === game.host ||
        (game.players.includes(event.sender) && event.origin_server_ts >= game.createdAt + 120_000))
    ) {
      game.phase = 'finished';
    } else if (
      action.kind === 'start' &&
      event.sender === game.host &&
      game.phase === 'lobby' &&
      game.players.length >= 2
    ) {
      game.phase = 'choosing';
      game.index = 0;
      game.drawer = game.players[0] ?? null;
      game.choosingAt = event.origin_server_ts;
    } else if (
      action.kind === 'skip' &&
      game.phase === 'choosing' &&
      game.players.includes(event.sender) &&
      action.index === game.index &&
      event.origin_server_ts >= game.choosingAt + 30_000
    ) {
      game.index += 1;
      if (game.index >= game.rounds * game.players.length) game.phase = 'finished';
      else {
        game.drawer = game.players[game.index % game.players.length] ?? null;
        game.choosingAt = event.origin_server_ts;
      }
    } else if (
      action.kind === 'round' &&
      game.phase === 'choosing' &&
      event.sender === game.drawer &&
      action.index === game.index &&
      typeof action.mask === 'string' &&
      action.mask.length > 0 &&
      action.mask.length <= 40 &&
      /^[^\p{L}\p{N}]*$/u.test(action.mask) &&
      action.mask.includes('_')
    ) {
      game.phase = 'drawing';
      game.startedAt = event.origin_server_ts;
      game.revealedAt = 0;
      game.mask = action.mask;
      game.hintCount = 0;
      game.word = '';
      game.strokes = [];
      game.solved = [];
    } else if (
      action.kind === 'hint' &&
      game.phase === 'drawing' &&
      event.sender === game.drawer &&
      action.index === game.index &&
      game.hintCount < game.hints &&
      Number.isInteger(action.position) &&
      action.position >= 0 &&
      action.position < Array.from(game.mask).length &&
      Array.from(game.mask)[action.position] === '_' &&
      typeof action.letter === 'string' &&
      Array.from(action.letter).length === 1 &&
      /[\p{L}\p{N}]/u.test(action.letter)
    ) {
      const chars = Array.from(game.mask);
      chars[action.position] = action.letter;
      game.mask = chars.join('');
      game.hintCount += 1;
    } else if (
      action.kind === 'solve' &&
      game.phase === 'drawing' &&
      event.sender === game.drawer &&
      action.index === game.index &&
      game.players.includes(action.player) &&
      action.player !== game.drawer &&
      !game.solved.includes(action.player) &&
      Number.isInteger(action.points) &&
      action.points >= 10 &&
      action.points <= 100
    ) {
      game.solved.push(action.player);
      game.scores[action.player] = (game.scores[action.player] ?? 0) + action.points;
      game.scores[event.sender] = (game.scores[event.sender] ?? 0) + 20;
    } else if (
      action.kind === 'reveal' &&
      game.phase === 'drawing' &&
      event.sender === game.drawer &&
      action.index === game.index &&
      typeof action.word === 'string' &&
      action.word.length <= 40 &&
      Array.isArray(action.strokes) &&
      action.strokes.length <= 150 &&
      action.strokes.every(isStroke)
    ) {
      game.phase = 'reveal';
      game.revealedAt = event.origin_server_ts;
      game.word = action.word;
      game.usedWords.push(action.word);
      game.strokes = action.strokes;
    } else if (
      action.kind === 'expire' &&
      game.phase === 'drawing' &&
      game.players.includes(event.sender) &&
      action.index === game.index &&
      event.origin_server_ts >= game.startedAt + game.seconds * 1000 + 5000
    ) {
      game.phase = 'reveal';
      game.revealedAt = event.origin_server_ts;
      game.word = '(drawer disconnected)';
      game.strokes = [];
    } else if (
      action.kind === 'start' &&
      game.phase === 'reveal' &&
      (event.sender === game.host ||
        (game.players.includes(event.sender) && event.origin_server_ts >= game.revealedAt + 5000))
    ) {
      game.index += 1;
      if (game.index >= game.rounds * game.players.length) game.phase = 'finished';
      else {
        game.phase = 'choosing';
        game.drawer = game.players[game.index % game.players.length] ?? null;
        game.choosingAt = event.origin_server_ts;
      }
    }
  }
  return game;
}
