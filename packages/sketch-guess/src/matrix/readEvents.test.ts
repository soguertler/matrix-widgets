import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readCurrentGameEvents } from './readEvents.ts';

const make = (id: string, kind: string, time: number) => ({
  sender: '@alice:localhost',
  event_id: `$${time}`,
  origin_server_ts: time,
  content: { version: 1, gameId: id, kind },
});

test('loads more history when the newest game creation is missing', async () => {
  const newest = make('new', 'join', 3);
  const old = make('old', 'create', 2);
  const create = make('new', 'create', 1);
  const limits: number[] = [];
  const result = await readCurrentGameEvents(async (limit) => {
    limits.push(limit);
    return limit === 1000 ? [newest, old] : [newest, old, create];
  });
  assert.deepEqual(limits, [1000, 2000]);
  assert.deepEqual(result, [newest, old, create]);
});

test('reports missing creation rather than an empty game', async () => {
  await assert.rejects(
    () => readCurrentGameEvents(async () => [make('new', 'join', 3)]),
    /enough game history/,
  );
});
