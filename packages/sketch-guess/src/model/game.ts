import type { RoomEvent } from '@widget-games/widget-shared';

export const EVENT_TYPE = 'com.widget_games.sketch_guess';
export const WORDS = [
  'apple',
  'bicycle',
  'castle',
  'dragon',
  'elephant',
  'firework',
  'guitar',
  'hamburger',
  'island',
  'jellyfish',
  'kangaroo',
  'lighthouse',
  'mushroom',
  'octopus',
  'pancake',
  'rainbow',
  'spaceship',
  'telescope',
  'umbrella',
  'volcano',
  'waterfall',
  'whale',
  'wizard',
  'zebra',
  'airplane',
  'balloon',
  'camera',
  'dinosaur',
  'envelope',
  'forest',
  'glasses',
  'helicopter',
  'ice cream',
  'keyboard',
  'mountain',
  'newspaper',
  'penguin',
  'robot',
  'snowman',
  'teapot',
  'unicorn',
  'violin',
  'window',
  'yacht',
];

export type Point = { x: number; y: number };
export type Stroke = { id: string; color: string; width: number; points: Point[] };
type Action =
  | { kind: 'create'; gameId: string; rounds: number; seconds: number }
  | { kind: 'join' | 'leave' | 'cancel' | 'start'; gameId: string }
  | { kind: 'round'; gameId: string; index: number; length: number }
  | { kind: 'solve'; gameId: string; index: number; player: string; points: number }
  | { kind: 'expire'; gameId: string; index: number }
  | { kind: 'reveal'; gameId: string; index: number; word: string; strokes: Stroke[] };

export type Game = {
  id: string;
  host: string;
  players: string[];
  rounds: number;
  seconds: number;
  phase: 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'finished';
  index: number;
  drawer: string | null;
  startedAt: number;
  length: number;
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
        typeof action.rounds !== 'number' ||
        action.rounds < 1 ||
        action.rounds > 5 ||
        typeof action.seconds !== 'number' ||
        action.seconds < 30 ||
        action.seconds > 180
      )
        continue;
      if (game && game.phase !== 'finished') continue;
      game = {
        id: action.gameId,
        host: event.sender,
        players: [event.sender],
        rounds: action.rounds,
        seconds: action.seconds,
        phase: 'lobby',
        index: -1,
        drawer: null,
        startedAt: 0,
        length: 0,
        word: '',
        strokes: [],
        scores: { [event.sender]: 0 },
        solved: [],
      };
      continue;
    }
    if (!game || action.gameId !== game.id) continue;
    if (
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
    } else if (action.kind === 'cancel' && event.sender === game.host && game.phase === 'lobby') {
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
    } else if (
      action.kind === 'round' &&
      game.phase === 'choosing' &&
      event.sender === game.drawer &&
      action.index === game.index &&
      Number.isInteger(action.length) &&
      action.length > 0 &&
      action.length < 40
    ) {
      game.phase = 'drawing';
      game.startedAt = event.origin_server_ts;
      game.length = action.length;
      game.word = '';
      game.strokes = [];
      game.solved = [];
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
      Array.isArray(action.strokes)
    ) {
      game.phase = 'reveal';
      game.word = action.word;
      game.strokes = action.strokes;
    } else if (
      action.kind === 'expire' &&
      game.phase === 'drawing' &&
      game.players.includes(event.sender) &&
      action.index === game.index &&
      event.origin_server_ts >= game.startedAt + game.seconds * 1000 + 5000
    ) {
      game.phase = 'reveal';
      game.word = '(drawer disconnected)';
      game.strokes = [];
    } else if (action.kind === 'start' && game.phase === 'reveal' && event.sender === game.host) {
      game.index += 1;
      if (game.index >= game.rounds * game.players.length) game.phase = 'finished';
      else {
        game.phase = 'choosing';
        game.drawer = game.players[game.index % game.players.length] ?? null;
      }
    }
  }
  return game;
}
