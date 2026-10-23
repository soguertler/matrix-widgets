import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { compactDrawing, gameFromEvents } from './game.ts';

const alice = '@alice:localhost';
const bob = '@bob:localhost';
let clock = 1;
function event(sender: string, kind: string, fields: Record<string, unknown> = {}) {
  return {
    sender,
    event_id: `$${clock}`,
    origin_server_ts: clock++,
    content: { version: 1, kind, gameId: 'game', ...fields },
  };
}

test('only the host starts and only the drawer advances a round', () => {
  clock = 1;
  const events = [
    event(alice, 'create', { rounds: 1, seconds: 60 }),
    event(bob, 'join'),
    event(bob, 'start'),
    event(alice, 'start'),
    event(bob, 'round', { index: 0, length: 5 }),
  ];
  assert.equal(gameFromEvents(events)?.phase, 'choosing');
  events.push(event(alice, 'round', { index: 0, length: 5 }));
  assert.equal(gameFromEvents(events)?.phase, 'drawing');
});

test('a correct guess scores once and the word appears only after reveal', () => {
  clock = 1;
  const events = [
    event(alice, 'create', { rounds: 1, seconds: 60 }),
    event(bob, 'join'),
    event(alice, 'start'),
    event(alice, 'round', { index: 0, length: 5 }),
    event(alice, 'solve', { index: 0, player: bob, points: 70 }),
    event(alice, 'solve', { index: 0, player: bob, points: 70 }),
  ];
  const drawing = gameFromEvents(events)!;
  assert.equal(drawing.word, '');
  assert.equal(drawing.scores[bob], 70);
  assert.equal(drawing.scores[alice], 20);
  events.push(event(alice, 'reveal', { index: 0, word: 'apple', strokes: [] }));
  assert.equal(gameFromEvents(events)?.word, 'apple');
  events.push(event(alice, 'start'));
  assert.equal(gameFromEvents(events)?.drawer, bob);
});

test('a player can unblock a disconnected drawer only after the deadline', () => {
  clock = 1;
  const events = [
    event(alice, 'create', { rounds: 1, seconds: 60 }),
    event(bob, 'join'),
    event(alice, 'start'),
    event(alice, 'round', { index: 0, length: 5 }),
  ];
  const early = event(bob, 'expire', { index: 0 });
  early.origin_server_ts = events[3]!.origin_server_ts + 64_000;
  assert.equal(gameFromEvents([...events, early])?.phase, 'drawing');
  early.origin_server_ts += 1000;
  assert.equal(gameFromEvents([...events, early])?.phase, 'reveal');
});

test('reveal drawing stays below the point budget', () => {
  const strokes = Array.from({ length: 10 }, (_, i) => ({
    id: String(i),
    color: '#000',
    width: 5,
    points: Array.from({ length: 300 }, (_, x) => ({ x, y: i })),
  }));
  assert.ok(compactDrawing(strokes).reduce((sum, stroke) => sum + stroke.points.length, 0) <= 2000);
});

test('a stalled word choice moves to the next drawer after 30 seconds', () => {
  clock = 1;
  const events = [
    event(alice, 'create', { rounds: 1, seconds: 60 }),
    event(bob, 'join'),
    event(alice, 'start'),
  ];
  const skip = event(bob, 'skip', { index: 0 });
  skip.origin_server_ts = events[2]!.origin_server_ts + 29_999;
  assert.equal(gameFromEvents([...events, skip])?.drawer, alice);
  skip.origin_server_ts += 1;
  assert.equal(gameFromEvents([...events, skip])?.drawer, bob);
});

test('joined players can recover a deserted lobby or advance a reveal after a delay', () => {
  clock = 1;
  const lobby = [event(alice, 'create', { rounds: 1, seconds: 60 }), event(bob, 'join')];
  const cancel = event(bob, 'cancel');
  cancel.origin_server_ts = lobby[0]!.origin_server_ts + 119_999;
  assert.equal(gameFromEvents([...lobby, cancel])?.phase, 'lobby');
  cancel.origin_server_ts += 1;
  assert.equal(gameFromEvents([...lobby, cancel])?.phase, 'finished');

  const play = [
    ...lobby,
    event(alice, 'start'),
    event(alice, 'round', { index: 0, length: 5 }),
    event(alice, 'reveal', { index: 0, word: 'apple', strokes: [] }),
  ];
  const next = event(bob, 'start');
  next.origin_server_ts = play.at(-1)!.origin_server_ts + 4999;
  assert.equal(gameFromEvents([...play, next])?.drawer, alice);
  next.origin_server_ts += 1;
  assert.equal(gameFromEvents([...play, next])?.drawer, bob);
});
