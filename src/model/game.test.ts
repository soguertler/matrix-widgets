import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allSubmitted,
  bookOwner,
  gameEventBytes,
  gameFromEvents,
  MAX_GAME_EVENT_BYTES,
  previousEntry,
  submissionKey,
  type GameAction,
  type GameEvent,
} from './game.ts';

const alice = '@alice:localhost';
const bob = '@bob:localhost';
let counter = 0;
function event(sender: string, content: GameAction): GameEvent {
  counter += 1;
  return { sender, content, event_id: `$${counter}`, origin_server_ts: counter };
}

function base(): GameEvent[] {
  counter = 0;
  return [
    event(alice, { version: 1, kind: 'create', gameId: 'one' }),
    event(bob, { version: 1, kind: 'join', gameId: 'one' }),
    event(alice, { version: 1, kind: 'start', gameId: 'one', players: [alice, bob], steps: 3 }),
  ];
}

test('two players pass different books through prompt, drawing, guess and reveal', () => {
  const events = base();
  assert.equal(bookOwner([alice, bob], alice, 1), bob);
  events.push(
    event(alice, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'tiny bus' },
    }),
  );
  events.push(
    event(bob, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'blue moon' },
    }),
  );
  assert.equal(allSubmitted(gameFromEvents(events)!), true);
  events.push(event(alice, { version: 1, kind: 'advance', gameId: 'one', round: 0 }));
  assert.equal(previousEntry(gameFromEvents(events)!, alice)?.entry.kind, 'text');
  assert.equal(gameFromEvents(events)?.roundStartedAt, events.at(-1)?.origin_server_ts);
  events.push(
    event(alice, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 1,
      entry: {
        kind: 'drawing',
        strokes: [
          [
            [1, 2],
            [3, 4],
          ],
        ],
      },
    }),
  );
  events.push(
    event(bob, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 1,
      entry: {
        kind: 'drawing',
        strokes: [
          [
            [5, 6],
            [7, 8],
          ],
        ],
      },
    }),
  );
  events.push(event(alice, { version: 1, kind: 'advance', gameId: 'one', round: 1 }));
  assert.equal(previousEntry(gameFromEvents(events)!, alice)?.entry.kind, 'drawing');
  events.push(
    event(alice, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 2,
      entry: { kind: 'text', text: 'a bus' },
    }),
  );
  events.push(
    event(bob, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 2,
      entry: { kind: 'text', text: 'the moon' },
    }),
  );
  events.push(event(alice, { version: 1, kind: 'reveal', gameId: 'one' }));
  const game = gameFromEvents(events)!;
  assert.equal(game.phase, 'reveal');
  assert.equal(game.submissions.size, 6);
  assert.equal(game.submissions.get(submissionKey(1, alice))?.author, bob);
  assert.equal(game.submissions.get(submissionKey(2, alice))?.author, alice);
});

test('styled shape drawings are accepted while malformed tools are ignored', () => {
  const events = base();
  events.push(
    event(alice, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'cat' },
    }),
  );
  events.push(
    event(bob, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'moon' },
    }),
  );
  events.push(event(alice, { version: 1, kind: 'advance', gameId: 'one', round: 0 }));
  events.push(
    event(alice, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 1,
      entry: {
        kind: 'drawing',
        strokes: [
          {
            tool: 'rectangle',
            points: [
              [20, 30],
              [150, 180],
            ],
            color: '#ef4444',
            width: 6,
            filled: true,
          },
        ],
      },
    }),
  );
  events.push(
    event(bob, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 1,
      entry: {
        kind: 'drawing',
        strokes: [
          {
            tool: 'ellipse',
            points: [
              [10, 10],
              [100, 100],
            ],
            color: '#000000' as '#111827',
            width: 6,
          },
        ],
      },
    }),
  );
  const game = gameFromEvents(events)!;
  assert.equal(game.submissions.size, 3);
  assert.equal(game.submissions.get(submissionKey(1, bob))?.author, alice);
});

test('a bounded PNG area fill is accepted as a drawing turn', () => {
  const events = base();
  events.push(
    event(alice, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'cat' },
    }),
  );
  events.push(
    event(bob, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'moon' },
    }),
  );
  events.push(event(alice, { version: 1, kind: 'advance', gameId: 'one', round: 0 }));
  events.push(
    event(bob, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 1,
      entry: {
        kind: 'drawing',
        strokes: [
          {
            tool: 'fill',
            points: [[10, 10]],
            color: '#ef4444',
            width: 6,
            data: 'data:image/png;base64,iVBORw0KGgo=',
          },
        ],
      },
    }),
  );
  assert.equal(gameFromEvents(events)?.submissions.size, 3);
  assert.equal(
    gameFromEvents(events)?.submissions.get(submissionKey(1, alice))?.entry.kind,
    'drawing',
  );
});

test('host cannot advance before everyone submits', () => {
  const events = base();
  events.push(
    event(alice, {
      version: 1,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'one' },
    }),
  );
  events.push(event(alice, { version: 1, kind: 'advance', gameId: 'one', round: 0 }));
  assert.equal(gameFromEvents(events)?.round, 0);
});

test('new lobby cannot displace a game in progress', () => {
  const events = base();
  events.push(event(bob, { version: 1, kind: 'create', gameId: 'two' }));
  assert.equal(gameFromEvents(events)?.id, 'one');
});

test('any player can advance a completed round', () => {
  const events = base();
  for (const sender of [alice, bob]) {
    events.push(
      event(sender, {
        version: 1,
        kind: 'submit',
        gameId: 'one',
        round: 0,
        entry: { kind: 'text', text: sender },
      }),
    );
  }
  events.push(event(bob, { version: 1, kind: 'advance', gameId: 'one', round: 0 }));
  assert.equal(gameFromEvents(events)?.round, 1);
});

test('submission size counts the full encoded event content', () => {
  const action: GameAction = {
    version: 1,
    kind: 'submit',
    gameId: 'one',
    round: 1,
    entry: {
      kind: 'drawing',
      strokes: [
        {
          tool: 'fill',
          color: '#ef4444',
          width: 6,
          points: [[10, 10]],
          data: `data:image/png;base64,${'A'.repeat(MAX_GAME_EVENT_BYTES)}`,
        },
      ],
    },
  };
  assert.ok(gameEventBytes(action) > MAX_GAME_EVENT_BYTES);
});

test('only the host can cancel the current lobby', () => {
  counter = 0;
  const events = [event(alice, { version: 1, kind: 'create', gameId: 'one' })];
  events.push(event(bob, { version: 1, kind: 'cancel', gameId: 'one' }));
  assert.equal(gameFromEvents(events)?.phase, 'lobby');
  events.push(event(alice, { version: 1, kind: 'cancel', gameId: 'other' }));
  assert.equal(gameFromEvents(events)?.phase, 'lobby');
  events.push(event(alice, { version: 1, kind: 'cancel', gameId: 'one' }));
  assert.equal(gameFromEvents(events), null);
  events.push(event(bob, { version: 1, kind: 'create', gameId: 'two' }));
  assert.equal(gameFromEvents(events)?.id, 'two');
});
