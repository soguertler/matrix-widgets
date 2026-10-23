import type { IRoomEvent } from 'matrix-widget-api';

export const GAME_EVENT = 'com.local.matrix_widget_lab.doodle_phone';
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
export type Entry = { kind: 'text'; text: string } | { kind: 'drawing'; strokes: Stroke[] };

type Action =
  | { version: 1; kind: 'create'; gameId: string }
  | { version: 1; kind: 'join'; gameId: string }
  | { version: 1; kind: 'cancel'; gameId: string }
  | { version: 1; kind: 'start'; gameId: string; players: string[]; steps: number }
  | { version: 1; kind: 'submit'; gameId: string; round: number; entry: Entry }
  | { version: 1; kind: 'advance'; gameId: string; round: number }
  | { version: 1; kind: 'reveal'; gameId: string };

export type GameAction = Action;
export type GameEvent = Pick<IRoomEvent, 'sender' | 'event_id' | 'origin_server_ts' | 'content'>;
export type SubmittedEntry = { author: string; round: number; entry: Entry };
export type Game = {
  id: string;
  owner: string;
  phase: 'lobby' | 'playing' | 'reveal';
  joined: string[];
  players: string[];
  steps: number;
  round: number;
  roundStartedAt: number;
  submissions: Map<string, SubmittedEntry>;
};

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
  if (content.version !== 1 || typeof content.gameId !== 'string') return null;
  if (
    !['create', 'join', 'cancel', 'start', 'submit', 'advance', 'reveal'].includes(
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
  const creations = events.filter((event) => actionOf(event)?.kind === 'create');
  const created = creations.at(-1);
  if (!created) return null;
  const create = actionOf(created)!;
  const game: Game = {
    id: create.gameId,
    owner: created.sender,
    phase: 'lobby',
    joined: [created.sender],
    players: [],
    steps: 0,
    round: 0,
    roundStartedAt: 0,
    submissions: new Map(),
  };

  for (const event of events) {
    if (event.origin_server_ts < created.origin_server_ts) continue;
    const action = actionOf(event);
    if (!action || action.gameId !== game.id || event.event_id === created.event_id) continue;
    if (action.kind === 'cancel' && game.phase === 'lobby' && event.sender === game.owner) {
      return null;
    } else if (action.kind === 'join' && game.phase === 'lobby') {
      if (!game.joined.includes(event.sender)) game.joined.push(event.sender);
    } else if (action.kind === 'start' && game.phase === 'lobby' && event.sender === game.owner) {
      const roster = action.players;
      if (
        !Array.isArray(roster) ||
        roster.length < 2 ||
        roster.length > 3 ||
        new Set(roster).size !== roster.length ||
        !roster.every((player) => game.joined.includes(player))
      )
        continue;
      game.players = roster;
      game.steps = roster.length % 2 === 1 ? roster.length : roster.length + 1;
      game.phase = 'playing';
      game.roundStartedAt = event.origin_server_ts;
    } else if (
      action.kind === 'submit' &&
      game.phase === 'playing' &&
      action.round === game.round
    ) {
      const book = bookOwner(game.players, event.sender, game.round);
      if (!book) continue;
      const expectedKind = game.round % 2 === 1 ? 'drawing' : 'text';
      if (!validEntry(action.entry, expectedKind)) continue;
      const key = submissionKey(game.round, book);
      if (!game.submissions.has(key))
        game.submissions.set(key, { author: event.sender, round: game.round, entry: action.entry });
    } else if (
      action.kind === 'advance' &&
      game.phase === 'playing' &&
      event.sender === game.owner &&
      action.round === game.round
    ) {
      if (!allSubmitted(game)) continue;
      if (game.round + 1 < game.steps) {
        game.round += 1;
        game.roundStartedAt = event.origin_server_ts;
      }
    } else if (
      action.kind === 'reveal' &&
      game.phase === 'playing' &&
      event.sender === game.owner
    ) {
      if (game.round === game.steps - 1 && allSubmitted(game)) game.phase = 'reveal';
    }
  }
  return game;
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
