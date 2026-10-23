import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../public/', import.meta.url));
const assets = [
  {
    name: 'buildroot-bzimage68.bin',
    url: 'https://i.copy.sh/buildroot-bzimage68.bin',
    sha256: '507a759c70ab7a490a233be454d0b5b88bc667956a410b531cb4edc091e2eb1c',
  },
  {
    name: 'seabios.bin',
    url: 'https://copy.sh/v86/bios/seabios.bin',
    sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98',
  },
  {
    name: 'vgabios.bin',
    url: 'https://copy.sh/v86/bios/vgabios.bin',
    sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880',
  },
  {
    name: 'v86.wasm',
    url: new URL('../node_modules/v86/build/v86.wasm', import.meta.url),
    sha256: '2f0c4150f266415b754a84a32e6f8e4c975a1d3abb94c78b047fa30027db1ef1',
  },
];

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

await mkdir(directory, { recursive: true });
for (const asset of assets) {
  const path = fileURLToPath(new URL(`../public/${asset.name}`, import.meta.url));
  try {
    if (hash(await readFile(path)) === asset.sha256) continue;
  } catch {
    // Fetch a missing asset below.
  }

  const bytes =
    asset.url instanceof URL
      ? await readFile(fileURLToPath(asset.url))
      : Buffer.from(await (await fetch(asset.url)).arrayBuffer());
  if (hash(bytes) !== asset.sha256) {
    throw new Error(`Checksum mismatch for ${asset.name}`);
  }
  await writeFile(path, bytes);
  console.log(`Prepared ${asset.name}`);
}
