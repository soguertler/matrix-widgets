import assert from 'node:assert/strict';
import test from 'node:test';
import { fillRegion } from './fill.ts';

test('fill colors only the connected area and leaves its border intact', () => {
  const width = 5;
  const height = 5;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const shade = x === 0 || y === 0 || x === 4 || y === 4 ? 0 : 255;
      data.set([shade, shade, shade, 255], offset);
    }
  const result = fillRegion({ width, height, data }, [2, 2], '#ef4444')!;
  assert.deepEqual(
    Array.from(result.slice((2 * width + 2) * 4, (2 * width + 2) * 4 + 4)),
    [239, 68, 68, 255],
  );
  assert.deepEqual(Array.from(result.slice(0, 4)), [0, 0, 0, 0]);
  assert.equal(
    Array.from(result).filter((value, index) => index % 4 === 3 && value === 255).length,
    9,
  );
});

test('fill does nothing when clicked area already has the chosen color', () => {
  const data = new Uint8ClampedArray([239, 68, 68, 255]);
  assert.equal(fillRegion({ width: 1, height: 1, data }, [0, 0], '#ef4444'), null);
});
