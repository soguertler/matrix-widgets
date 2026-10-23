import type { Point, Stroke } from '../model/game';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 500;
const TOLERANCE = 24;

export async function rasterize(strokes: Stroke[]): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) {
    if (!Array.isArray(stroke) && stroke.tool === 'fill' && stroke.data) {
      const image = new Image();
      image.src = stroke.data;
      await image.decode();
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      continue;
    }
    const points = Array.isArray(stroke) ? stroke : stroke.points;
    if (!points.length) continue;
    const color = Array.isArray(stroke) ? '#111827' : stroke.color;
    const width = Array.isArray(stroke) ? 5 : stroke.width;
    const tool = Array.isArray(stroke) ? 'pen' : stroke.tool;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (tool === 'rectangle' || tool === 'ellipse') {
      const [start, end] = points;
      const x = Math.min(start[0], end[0]);
      const y = Math.min(start[1], end[1]);
      const w = Math.abs(start[0] - end[0]);
      const h = Math.abs(start[1] - end[1]);
      context.beginPath();
      if (tool === 'rectangle') context.rect(x, y, w, h);
      else context.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      if (!Array.isArray(stroke) && stroke.filled) context.fill();
      context.stroke();
    } else if (points.length === 1) {
      context.beginPath();
      context.arc(points[0][0], points[0][1], width / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(points[0][0], points[0][1]);
      for (const [x, y] of points.slice(1)) context.lineTo(x, y);
      context.stroke();
    }
  }
  return canvas;
}

export function fillRegion(
  source: Pick<ImageData, 'width' | 'height' | 'data'>,
  seed: Point,
  color: string,
): Uint8ClampedArray | null {
  const { width, height, data } = source;
  const x = Math.min(width - 1, Math.max(0, Math.floor(seed[0])));
  const y = Math.min(height - 1, Math.max(0, Math.floor(seed[1])));
  const start = (y * width + x) * 4;
  const target = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const rgb = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  if (
    target[3] === 255 &&
    rgb.every((value, channel) => Math.abs(value - target[channel]) <= TOLERANCE)
  )
    return null;

  const output = new Uint8ClampedArray(width * height * 4);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  queue[tail++] = y * width + x;
  visited[y * width + x] = 1;
  while (head < tail) {
    const pixel = queue[head++];
    const offset = pixel * 4;
    if (target.some((value, channel) => Math.abs(data[offset + channel] - value) > TOLERANCE))
      continue;
    output[offset] = rgb[0];
    output[offset + 1] = rgb[1];
    output[offset + 2] = rgb[2];
    output[offset + 3] = 255;
    const px = pixel % width;
    const py = Math.floor(pixel / width);
    for (const neighbor of [
      px > 0 ? pixel - 1 : -1,
      px < width - 1 ? pixel + 1 : -1,
      py > 0 ? pixel - width : -1,
      py < height - 1 ? pixel + width : -1,
    ]) {
      if (neighbor >= 0 && !visited[neighbor]) {
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }
  return output;
}
