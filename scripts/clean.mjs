import { rm } from 'node:fs/promises';

for (const directory of [
  'release',
  'packages/doodle-phone/dist',
  'packages/sketch-guess/dist',
  'packages/linux/dist',
]) {
  await rm(new URL(`../${directory}`, import.meta.url), { recursive: true, force: true });
}
