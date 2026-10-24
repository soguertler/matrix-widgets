import { execFileSync } from 'node:child_process';
import { access, cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('release/', root);
const widgets = ['doodle-phone', 'sketch-guess', 'linux'];

execFileSync('zip', ['-v'], { stdio: 'ignore' });
for (const name of widgets) {
  await access(new URL(`packages/${name}/dist/index.html`, root));
}
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const name of widgets) {
  await cp(new URL(`packages/${name}/dist/`, root), new URL(`${name}/`, output), {
    recursive: true,
  });
}
execFileSync('zip', ['-q', '-r', 'matrix-widgets.zip', ...widgets], {
  cwd: fileURLToPath(output),
  stdio: 'inherit',
});
console.log('Release archive prepared at release/matrix-widgets.zip');
