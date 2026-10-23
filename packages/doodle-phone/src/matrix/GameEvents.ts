import type { GameEvent } from '../model/game';

const HISTORY_LIMITS = [1000, 2000, 4000];

export async function readCurrentGameEvents(
  read: (limit: number) => Promise<GameEvent[]>,
): Promise<GameEvent[]> {
  let previousCount = -1;
  for (const limit of HISTORY_LIMITS) {
    const events = await read(limit);
    const hasGameActions = events.some(
      (event) => event.content?.version === 2 && typeof event.content.gameId === 'string',
    );
    const hasGameStart = events.some(
      (event) => event.content?.version === 2 && event.content.kind === 'create',
    );
    if (!hasGameActions || hasGameStart) return events;
    if (events.length < limit && events.length <= previousCount) break;
    previousCount = events.length;
  }
  throw new Error(
    'The Matrix client did not provide enough game history to find the current game.',
  );
}
