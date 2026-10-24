import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedFilePath } from './downloadPath.ts';

test('maps absolute guest paths into the shared filesystem', () => {
  assert.equal(sharedFilePath('/mnt/report.txt'), '/report.txt');
  assert.equal(sharedFilePath(' /mnt/project/my report.txt '), '/project/my report.txt');
});

test('rejects paths outside the shared filesystem and directories', () => {
  for (const path of [
    '/etc/passwd',
    '/mnt/../etc/passwd',
    '/mnt',
    '/mnt/',
    '/mnt/a/../../file',
    '/mnt/a\\b',
    '/mnt/a\0b',
  ]) {
    assert.throws(() => sharedFilePath(path), /file path inside \/mnt/);
  }
});
