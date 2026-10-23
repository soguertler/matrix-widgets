import assert from 'node:assert/strict';
import test from 'node:test';
import { readCurrentGameEvents } from './GameEvents.ts';
import type { GameEvent } from '../model/game.ts';

function gameEvent(index: number, kind: string): GameEvent {
  return {
    sender: '@alice:example.org',
    event_id: `$${index}`,
    origin_server_ts: index,
    content: { version: 2, gameId: 'one', kind },
  };
}

test('loads more history when the first page excludes game creation', async () => {
  const history = [
    gameEvent(0, 'create'),
    ...Array.from({ length: 1200 }, (_, index) => gameEvent(index + 1, 'submit')),
  ];
  const limits: number[] = [];
  const events = await readCurrentGameEvents(async (limit) => {
    limits.push(limit);
    return history.slice(-limit);
  });
  assert.deepEqual(limits, [1000, 2000]);
  assert.equal(events[0].content.kind, 'create');
});

test('reports a client history cap instead of treating an active game as empty', async () => {
  const history = Array.from({ length: 1000 }, (_, index) => gameEvent(index + 1, 'submit'));
  await assert.rejects(() => readCurrentGameEvents(async () => history), /enough game history/);
});
