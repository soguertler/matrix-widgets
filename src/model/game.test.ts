import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookOwner,
  gameEventBytes,
  gameFromEvents,
  MAX_GAME_EVENT_BYTES,
  MAX_PLAYERS,
  previousEntry,
  ROUND_MS,
  submissionKey,
  type GameAction,
  type GameEvent,
} from './game.ts';

const players = Array.from({ length: MAX_PLAYERS + 1 }, (_, index) => `@player${index}:localhost`);
let counter = 0;
function event(sender: string, content: GameAction, timestamp?: number): GameEvent {
  counter += 1;
  return {
    sender,
    content,
    event_id: `$${counter}`,
    origin_server_ts: timestamp ?? counter * 1000,
  };
}
function lobby(count: number): GameEvent[] {
  counter = 0;
  const events = [event(players[0], { version: 2, kind: 'create', gameId: 'one' })];
  for (const player of players.slice(1, count))
    events.push(event(player, { version: 2, kind: 'join', gameId: 'one' }));
  return events;
}
function start(events: GameEvent[], count: number): void {
  events.push(
    event(players[0], {
      version: 2,
      kind: 'start',
      gameId: 'one',
      players: players.slice(0, count),
    }),
  );
}
function submitRound(events: GameEvent[], count: number, round: number): void {
  for (const player of players.slice(0, count)) {
    events.push(
      event(player, {
        version: 2,
        kind: 'submit',
        gameId: 'one',
        round,
        entry:
          round % 2 === 1
            ? {
                kind: 'drawing',
                strokes: [
                  [
                    [1, 2],
                    [3, 4],
                  ],
                ],
              }
            : { kind: 'text', text: `${player} round ${round}` },
      }),
    );
  }
}

test('two players progress automatically and reveal their chains', () => {
  const events = lobby(2);
  start(events, 2);
  assert.equal(bookOwner(players.slice(0, 2), players[0], 1), players[1]);
  submitRound(events, 2, 0);
  assert.equal(gameFromEvents(events)?.round, 1);
  assert.equal(previousEntry(gameFromEvents(events)!, players[0])?.entry.kind, 'text');
  submitRound(events, 2, 1);
  const game = gameFromEvents(events)!;
  assert.equal(game.phase, 'reveal');
  assert.equal(game.steps, 2);
  assert.equal(game.revealIndex, 1);
  assert.equal(game.submissions.size, 4);
  assert.equal(game.submissions.get(submissionKey(1, players[0]))?.author, players[1]);
});

test('fourteen players can join, while a fifteenth cannot', () => {
  const events = lobby(MAX_PLAYERS + 1);
  assert.equal(gameFromEvents(events)?.joined.length, MAX_PLAYERS);
  start(events, MAX_PLAYERS);
  const game = gameFromEvents(events)!;
  assert.equal(game.phase, 'playing');
  assert.equal(game.players.length, MAX_PLAYERS);
  assert.equal(game.steps, MAX_PLAYERS);
  assert.equal(bookOwner(game.players, players[0], MAX_PLAYERS - 1), players[1]);
});

test('fourteen-player game completes all books without repeating an author', () => {
  const events = lobby(MAX_PLAYERS);
  start(events, MAX_PLAYERS);
  for (let round = 0; round < MAX_PLAYERS; round++) submitRound(events, MAX_PLAYERS, round);
  const game = gameFromEvents(events)!;
  assert.equal(game.phase, 'reveal');
  assert.equal(game.submissions.size, MAX_PLAYERS * MAX_PLAYERS);
  for (const book of game.players) {
    const authors = new Set(
      Array.from(
        { length: game.steps },
        (_, round) => game.submissions.get(submissionKey(round, book))?.author,
      ),
    );
    assert.equal(authors.size, MAX_PLAYERS);
  }
});

test('a late start cannot include an unjoined player', () => {
  const events = lobby(2);
  start(events, 3);
  assert.equal(gameFromEvents(events)?.phase, 'lobby');
});

test('timeout fills missing turns and advances only after the deadline', () => {
  const events = lobby(3);
  start(events, 3);
  events.push(
    event(players[0], {
      version: 2,
      kind: 'submit',
      gameId: 'one',
      round: 0,
      entry: { kind: 'text', text: 'a cat' },
    }),
  );
  const deadline = gameFromEvents(events)!.roundStartedAt + ROUND_MS;
  events.push(
    event(players[1], { version: 2, kind: 'expire', gameId: 'one', round: 0 }, deadline - 1),
  );
  assert.equal(gameFromEvents(events)?.round, 0);
  events.push(event(players[1], { version: 2, kind: 'expire', gameId: 'one', round: 0 }, deadline));
  const game = gameFromEvents(events)!;
  assert.equal(game.round, 1);
  assert.equal(game.submissions.size, 3);
  assert.deepEqual(game.submissions.get(submissionKey(0, players[1]))?.entry, {
    kind: 'text',
    text: '(time ran out)',
  });
});

test('reveal progress is shared and stale duplicate steps are ignored', () => {
  const events = lobby(2);
  start(events, 2);
  submitRound(events, 2, 0);
  submitRound(events, 2, 1);
  events.push(event(players[0], { version: 2, kind: 'revealNext', gameId: 'one', index: 1 }));
  events.push(event(players[1], { version: 2, kind: 'revealNext', gameId: 'one', index: 1 }));
  assert.equal(gameFromEvents(events)?.revealIndex, 2);
  events.push(event(players[1], { version: 2, kind: 'revealNext', gameId: 'one', index: 2 }));
  assert.equal(gameFromEvents(events)?.revealIndex, 3);
});

test('new lobby cannot displace a game in progress', () => {
  const events = lobby(2);
  start(events, 2);
  events.push(event(players[1], { version: 2, kind: 'create', gameId: 'two' }));
  assert.equal(gameFromEvents(events)?.id, 'one');
});

test('only the host can cancel the current lobby', () => {
  const events = lobby(2);
  events.push(event(players[1], { version: 2, kind: 'cancel', gameId: 'one' }));
  assert.equal(gameFromEvents(events)?.phase, 'lobby');
  events.push(event(players[0], { version: 2, kind: 'cancel', gameId: 'one' }));
  assert.equal(gameFromEvents(events), null);
});

test('submission size counts the full encoded event content', () => {
  const action: GameAction = {
    version: 2,
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
