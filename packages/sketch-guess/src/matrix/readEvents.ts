import type { RoomEvent } from '@widget-games/widget-shared';

export async function readCurrentGameEvents(
  read: (limit: number) => Promise<RoomEvent[]>,
): Promise<RoomEvent[]> {
  let previousCount = -1;
  for (const limit of [1000, 2000, 4000]) {
    const events = await read(limit);
    const actions = events.filter(
      (event) => event.content?.version === 1 && typeof event.content.gameId === 'string',
    );
    const latest = [...actions].sort((a, b) => b.origin_server_ts - a.origin_server_ts)[0];
    if (
      !latest ||
      actions.some(
        (event) =>
          event.content.kind === 'create' && event.content.gameId === latest.content.gameId,
      )
    )
      return events;
    if (events.length < limit && events.length <= previousCount) break;
    previousCount = events.length;
  }
  throw new Error(
    'The Matrix client did not provide enough game history to find the current game.',
  );
}
