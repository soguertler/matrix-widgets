import type { IRoomEvent } from 'matrix-widget-api';

export const GAME_EVENT = 'com.local.matrix_widget_lab.doodle_phone';
export const MAX_GAME_EVENT_BYTES = 60_000;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 14;
export const ROUND_MS = 120_000;
export type Point = [number, number];
export const DRAW_COLORS = [
  '#111827',
  '#6b7280',
  '#1d4ed8',
  '#ffffff',
  '#9ca3af',
  '#0ea5e9',
  '#166534',
  '#b91c1c',
  '#92400e',
  '#16a34a',
  '#ef4444',
  '#f97316',
  '#ca8a04',
  '#a21caf',
  '#fb7185',
  '#facc15',
  '#ec4899',
  '#fecaca',
] as const;
export const DRAW_WIDTHS = [3, 6, 12, 24] as const;
export const DRAW_TOOLS = ['pen', 'eraser', 'line', 'rectangle', 'ellipse', 'fill'] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];
export type Stroke =
  | Point[]
  | {
      points: Point[];
      color: (typeof DRAW_COLORS)[number];
      width: (typeof DRAW_WIDTHS)[number];
      tool: DrawTool;
      filled?: boolean;
      data?: string;
    };
export type Entry =
  | { kind: 'text'; text: string }
  | { kind: 'drawing'; strokes: Stroke[]; emptyReason?: 'left' | 'timeout' };

type Action =
  | { version: 2; kind: 'create'; gameId: string }
  | { version: 2; kind: 'join'; gameId: string }
  | { version: 2; kind: 'leave'; gameId: string }
  | { version: 2; kind: 'cancel'; gameId: string }
  | { version: 2; kind: 'start'; gameId: string; players: string[] }
  | { version: 2; kind: 'submit'; gameId: string; round: number; entry: Entry }
  | { version: 2; kind: 'expire'; gameId: string; round: number }
  | { version: 2; kind: 'revealNext'; gameId: string; index: number };

export type GameAction = Action;
export type GameEvent = Pick<IRoomEvent, 'sender' | 'event_id' | 'origin_server_ts' | 'content'>;
export type SubmittedEntry = { author: string; round: number; entry: Entry };
export type Game = {
  id: string;
  owner: string;
  phase: 'lobby' | 'playing' | 'reveal';
  joined: string[];
  left: string[];
  players: string[];
  steps: number;
  round: number;
  roundStartedAt: number;
  revealIndex: number;
  submissions: Map<string, SubmittedEntry>;
};

export function gameEventBytes(action: GameAction): number {
  return new TextEncoder().encode(JSON.stringify(action)).length;
}

function validEntry(entry: unknown, expectedKind: 'text' | 'drawing'): entry is Entry {
  if (!entry || typeof entry !== 'object') return false;
  if (expectedKind === 'text') {
    const text = (entry as { text?: unknown }).text;
    return (
      (entry as { kind?: unknown }).kind === 'text' &&
      typeof text === 'string' &&
      text.length > 0 &&
      text.length <= 180
    );
  }
  const strokes = (entry as { strokes?: unknown }).strokes;
  if (
    (entry as { kind?: unknown }).kind !== 'drawing' ||
    (entry as { emptyReason?: unknown }).emptyReason !== undefined ||
    !Array.isArray(strokes) ||
    strokes.length > 100
  )
    return false;
  const points: unknown[] = [];
  for (const stroke of strokes) {
    if (Array.isArray(stroke)) {
      points.push(...stroke);
    } else if (
      stroke &&
      typeof stroke === 'object' &&
      DRAW_COLORS.includes((stroke as { color?: (typeof DRAW_COLORS)[number] }).color!) &&
      DRAW_WIDTHS.includes((stroke as { width?: (typeof DRAW_WIDTHS)[number] }).width!) &&
      DRAW_TOOLS.includes((stroke as { tool?: DrawTool }).tool!) &&
      ((stroke as { filled?: unknown }).filled === undefined ||
        typeof (stroke as { filled?: unknown }).filled === 'boolean') &&
      Array.isArray((stroke as { points?: unknown }).points)
    ) {
      const styled = stroke as { points: unknown[]; tool: DrawTool };
      if (styled.tool === 'fill') {
        const data = (stroke as { data?: unknown }).data;
        if (
          styled.points.length !== 1 ||
          typeof data !== 'string' ||
          !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(data) ||
          data.length > 40_000
        )
          return false;
      } else if (
        styled.points.length === 0 ||
        (styled.tool !== 'pen' && styled.tool !== 'eraser' && styled.points.length !== 2)
      )
        return false;
      points.push(...(stroke as { points: unknown[] }).points);
    } else return false;
  }
  return (
    points.length > 0 &&
    points.length <= 800 &&
    points.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(
          (value) =>
            typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 800,
        ),
    )
  );
}

function actionOf(event: GameEvent): Action | null {
  const content = event.content as Partial<Action>;
  if (content.version !== 2 || typeof content.gameId !== 'string') return null;
  if (
    !['create', 'join', 'leave', 'cancel', 'start', 'submit', 'expire', 'revealNext'].includes(
      String(content.kind),
    )
  )
    return null;
  return content as Action;
}

export function bookOwner(players: string[], player: string, round: number): string | null {
  const index = players.indexOf(player);
  if (index < 0 || players.length === 0) return null;
  return players[(((index - round) % players.length) + players.length) % players.length];
}

export function submissionKey(round: number, book: string): string {
  return `${round}:${book}`;
}

export function gameFromEvents(input: GameEvent[]): Game | null {
  const events = [...input].sort(
    (a, b) => a.origin_server_ts - b.origin_server_ts || a.event_id.localeCompare(b.event_id),
  );
  let game: Game | null = null;

  for (const event of events) {
    const action = actionOf(event);
    if (!action) continue;
    if (action.kind === 'create') {
      if (game && game.phase !== 'reveal') continue;
      game = {
        id: action.gameId,
        owner: event.sender,
        phase: 'lobby',
        joined: [event.sender],
        left: [],
        players: [],
        steps: 0,
        round: 0,
        roundStartedAt: 0,
        revealIndex: 0,
        submissions: new Map(),
      };
      continue;
    }
    if (!game || action.gameId !== game.id) continue;
    if (action.kind === 'cancel' && game.phase === 'lobby' && event.sender === game.owner) {
      game = null;
    } else if (action.kind === 'join' && game.phase === 'lobby') {
      if (!game.joined.includes(event.sender) && game.joined.length < MAX_PLAYERS)
        game.joined.push(event.sender);
    } else if (action.kind === 'leave' && game.phase === 'lobby') {
      if (event.sender !== game.owner)
        game.joined = game.joined.filter((player) => player !== event.sender);
    } else if (
      action.kind === 'leave' &&
      game.phase === 'playing' &&
      game.players.includes(event.sender) &&
      !game.left.includes(event.sender)
    ) {
      game.left.push(event.sender);
      fillLeftTurns(game);
      if (allSubmitted(game)) completeRound(game, event.origin_server_ts);
    } else if (action.kind === 'start' && game.phase === 'lobby' && event.sender === game.owner) {
      const roster = action.players;
      const joined = game.joined;
      if (
        !Array.isArray(roster) ||
        roster.length < MIN_PLAYERS ||
        roster.length > MAX_PLAYERS ||
        new Set(roster).size !== roster.length ||
        !roster.includes(game.owner) ||
        !roster.every((player) => joined.includes(player))
      )
        continue;
      game.players = roster;
      game.steps = roster.length;
      game.phase = 'playing';
      game.roundStartedAt = event.origin_server_ts;
    } else if (
      action.kind === 'submit' &&
      game.phase === 'playing' &&
      action.round === game.round
    ) {
      const book = bookOwner(game.players, event.sender, game.round);
      if (!book || game.left.includes(event.sender)) continue;
      const expectedKind = game.round % 2 === 1 ? 'drawing' : 'text';
      if (!validEntry(action.entry, expectedKind)) continue;
      const key = submissionKey(game.round, book);
      if (!game.submissions.has(key))
        game.submissions.set(key, { author: event.sender, round: game.round, entry: action.entry });
      if (allSubmitted(game)) completeRound(game, event.origin_server_ts);
    } else if (
      action.kind === 'expire' &&
      game.phase === 'playing' &&
      game.players.includes(event.sender) &&
      action.round === game.round &&
      event.origin_server_ts >= game.roundStartedAt + ROUND_MS
    ) {
      for (const player of game.players) {
        const book = bookOwner(game.players, player, game.round)!;
        const key = submissionKey(game.round, book);
        if (!game.submissions.has(key)) {
          const entry: Entry =
            game.round % 2 === 1
              ? { kind: 'drawing', strokes: [], emptyReason: 'timeout' }
              : { kind: 'text', text: '(time ran out)' };
          game.submissions.set(key, { author: player, round: game.round, entry });
        }
      }
      completeRound(game, event.origin_server_ts);
    } else if (
      action.kind === 'revealNext' &&
      game.phase === 'reveal' &&
      game.players.includes(event.sender) &&
      action.index === game.revealIndex &&
      game.revealIndex < game.players.length * game.steps
    ) {
      game.revealIndex += 1;
    }
  }
  return game;
}

function completeRound(game: Game, timestamp: number): void {
  do {
    if (game.round + 1 === game.steps) {
      game.phase = 'reveal';
      game.revealIndex = 1;
      return;
    }
    game.round += 1;
    game.roundStartedAt = timestamp;
    fillLeftTurns(game);
  } while (allSubmitted(game));
}

function fillLeftTurns(game: Game): void {
  for (const player of game.left) {
    const book = bookOwner(game.players, player, game.round)!;
    const key = submissionKey(game.round, book);
    if (game.submissions.has(key)) continue;
    const entry: Entry =
      game.round % 2 === 1
        ? { kind: 'drawing', strokes: [], emptyReason: 'left' }
        : { kind: 'text', text: '(player left)' };
    game.submissions.set(key, { author: player, round: game.round, entry });
  }
}

export function allSubmitted(game: Game): boolean {
  return game.players.every((player) => {
    const book = bookOwner(game.players, player, game.round);
    return book !== null && game.submissions.has(submissionKey(game.round, book));
  });
}

export function submittedForPlayer(game: Game, player: string): boolean {
  const book = bookOwner(game.players, player, game.round);
  return book !== null && game.submissions.has(submissionKey(game.round, book));
}

export function previousEntry(game: Game, player: string): SubmittedEntry | null {
  if (game.round === 0) return null;
  const book = bookOwner(game.players, player, game.round);
  return book ? (game.submissions.get(submissionKey(game.round - 1, book)) ?? null) : null;
}
