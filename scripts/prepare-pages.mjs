import { access, cp, mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const output = new URL('_site/', root);
const widgets = ['doodle-phone', 'sketch-guess', 'linux'];

for (const name of widgets) {
  await access(new URL(`packages/${name}/dist/index.html`, root));
}
await rm(output, { recursive: true, force: true });
await mkdir(output);
await cp(new URL('hosting/index.html', root), new URL('index.html', output));
await writeFile(new URL('.nojekyll', output), '');
for (const name of widgets) {
  await cp(new URL(`packages/${name}/dist/`, root), new URL(`${name}/`, output), {
    recursive: true,
  });
}
console.log('GitHub Pages site prepared in _site/');
