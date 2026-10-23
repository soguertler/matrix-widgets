import assert from 'node:assert/strict';
import test from 'node:test';
import { clearTurnDraft, readTurnDraft, saveTurnDraft } from './turnDraft.ts';
import type { Stroke } from '../model/game.ts';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'sessionStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
  configurable: true,
});

test('restores a valid drawing draft and clears it after confirmation', () => {
  const strokes: Stroke[] = [
    {
      tool: 'pen',
      color: '#111827',
      width: 6,
      points: [
        [1, 2],
        [3, 4],
      ],
    },
  ];
  saveTurnDraft('game', 1, '@alice:example.org', { text: '', strokes });
  assert.deepEqual(readTurnDraft('game', 1, '@alice:example.org').strokes, strokes);
  clearTurnDraft('game', 1, '@alice:example.org');
  assert.deepEqual(readTurnDraft('game', 1, '@alice:example.org'), { text: '', strokes: [] });
});

test('rejects invalid drawing data from storage', () => {
  saveTurnDraft('game', 2, '@alice:example.org', {
    text: 'hello',
    strokes: [{ tool: 'fill', points: [[1, 2]], data: 'invalid' }] as unknown as Stroke[],
  });
  assert.deepEqual(readTurnDraft('game', 2, '@alice:example.org'), {
    text: 'hello',
    strokes: [],
  });
});
