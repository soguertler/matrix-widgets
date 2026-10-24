import { cp, mkdir, readdir, rm } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('release/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const name of ['doodle-phone', 'sketch-guess', 'linux']) {
  await cp(new URL(`packages/${name}/dist/index.html`, root), new URL(`${name}.html`, output));
}
const linux = new URL('packages/linux/dist/', root);
for (const file of await readdir(linux)) {
  if (file !== 'index.html')
    await cp(new URL(file, linux), new URL(file, output), { recursive: true });
}
console.log('Release assets prepared in release/');
