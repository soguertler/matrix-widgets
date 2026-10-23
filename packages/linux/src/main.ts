import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { WidgetApi } from 'matrix-widget-api';
import { V86 } from 'v86';
import './style.css';

// Element keeps its loading overlay until the widget announces that its UI loaded.
const widgetId = new URLSearchParams(window.location.search).get('widgetId');
if (window.parent !== window && widgetId) {
  const widgetApi = new WidgetApi(widgetId, '*');
  let loadedRetry: number | undefined;
  widgetApi.on('ready', () => {
    if (loadedRetry !== undefined) window.clearInterval(loadedRetry);
  });
  widgetApi.start();
  const notifyLoaded = () => void widgetApi.sendContentLoaded().catch(() => undefined);
  notifyLoaded();
  loadedRetry = window.setInterval(notifyLoaded, 3000);
}

const status = document.querySelector<HTMLElement>('#status')!;
const terminalElement = document.querySelector<HTMLElement>('#terminal')!;
const terminal = new Terminal({
  cursorBlink: true,
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  fontSize: 14,
  screenReaderMode: true,
  scrollback: 4000,
  theme: { background: '#050a0e', foreground: '#e6edf5', cursor: '#61d6a3' },
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(terminalElement);
fitAddon.fit();
new ResizeObserver(() => fitAddon.fit()).observe(terminalElement);
terminal.writeln(
  'Press “Boot Linux” to start. Downloads about 13 MB of emulator and system files.',
);
const power = document.querySelector<HTMLButtonElement>('#power')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
const keyButtons = [
  document.querySelector<HTMLButtonElement>('#ctrl-c')!,
  document.querySelector<HTMLButtonElement>('#ctrl-d')!,
  document.querySelector<HTMLButtonElement>('#ctrl-l')!,
];
const upload = document.querySelector<HTMLInputElement>('#upload')!;
const downloadForm = document.querySelector<HTMLFormElement>('#download-form')!;
const downloadPath = document.querySelector<HTMLInputElement>('#download-path')!;
const downloadButton = downloadForm.querySelector<HTMLButtonElement>('button')!;
const fileStatus = document.querySelector<HTMLElement>('#file-status')!;

let emulator: V86 | undefined;
let widgetfetchBytes: Uint8Array | undefined;
let micropythonBytes: Uint8Array | undefined;
let booting = false;
let ready = false;
let configuring = false;
let recent = '';
let outputVisible = false;
let markerTail = '';
let skipMarkerLine = false;

const readyMarker = '__WIDGET_LINUX_READY__';
const finishSetup = "clear; printf '%s%s\\n' __WIDGET_ LINUX_READY__";

const asset = (name: string) => new URL(name, document.baseURI).href;

function setStatus(message: string) {
  status.textContent = message;
}

async function configureGuest() {
  const active = emulator;
  if (!active || !widgetfetchBytes || !micropythonBytes) return;
  setStatus('Configuring Widget Linux…');
  try {
    await active.create_file('/widgetfetch', widgetfetchBytes);
    await active.create_file('/micropython', micropythonBytes);
    if (active !== emulator) return;
    active.serial0_send(
      `hostname widget-linux; udhcpc -i eth0 -q -n -t 3 -T 2; cp /mnt/widgetfetch /usr/bin/widgetfetch; cp /mnt/micropython /usr/bin/micropython; chmod +x /usr/bin/widgetfetch /usr/bin/micropython; ln -sf widgetfetch /usr/bin/fetch; ln -sf micropython /usr/bin/python; export TERM=xterm; ${finishSetup}; widgetfetch\n`,
    );
  } catch (error) {
    fileStatus.textContent = `Could not install guest commands: ${String(error)}`;
    if (active === emulator) {
      active.serial0_send(
        `hostname widget-linux; udhcpc -i eth0 -q -n -t 3 -T 2; ${finishSetup}\n`,
      );
    }
  }
}

function appendOutput(byte: number) {
  const character = String.fromCharCode(byte);
  if (!outputVisible) {
    markerTail = (markerTail + character).slice(-readyMarker.length);
    if (markerTail === readyMarker) {
      outputVisible = true;
      skipMarkerLine = true;
      terminal.reset();
    }
  } else if (skipMarkerLine) {
    if (byte === 10) skipMarkerLine = false;
  } else {
    terminal.write(Uint8Array.of(byte));
  }
  if (character === '\r') return;
  recent = (recent + character).slice(-100);
  if (!ready && /(?:~% |# |\$ )$/.test(recent)) {
    if (!configuring) {
      configuring = true;
      void configureGuest();
      return;
    }
    ready = true;
    keyButtons.forEach((button) => (button.disabled = false));
    upload.disabled = false;
    downloadPath.disabled = false;
    downloadButton.disabled = false;
    setStatus('Shell ready');
    terminal.focus();
  }
}

async function boot() {
  if (booting) return;
  booting = true;
  ready = false;
  configuring = false;
  recent = '';
  outputVisible = false;
  markerTail = '';
  skipMarkerLine = false;
  power.disabled = true;
  restart.hidden = true;
  keyButtons.forEach((button) => (button.disabled = true));
  upload.disabled = true;
  downloadPath.disabled = true;
  downloadButton.disabled = true;
  fileStatus.textContent = '';
  terminal.reset();
  setStatus('Loading Linux…');

  if (emulator) {
    await emulator.destroy();
    emulator = undefined;
  }

  try {
    const [widgetfetchResponse, micropythonResponse] = await Promise.all([
      window.fetch(asset('widgetfetch')),
      window.fetch(asset('micropython')),
    ]);
    if (!widgetfetchResponse.ok || !micropythonResponse.ok) {
      throw new Error('Could not load guest commands');
    }
    widgetfetchBytes = new Uint8Array(await widgetfetchResponse.arrayBuffer());
    micropythonBytes = new Uint8Array(await micropythonResponse.arrayBuffer());
    emulator = new V86({
      wasm_path: asset('v86.wasm'),
      memory_size: 64 * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      bios: { url: asset('seabios.bin') },
      vga_bios: { url: asset('vgabios.bin') },
      bzimage: { url: asset('buildroot-bzimage68.bin') },
      filesystem: {},
      net_device: { type: 'virtio', relay_url: 'fetch' },
      cmdline: 'console=ttyS0 tsc=reliable mitigations=off random.trust_cpu=on',
      disable_keyboard: true,
      disable_mouse: true,
      disable_speaker: true,
      autostart: true,
    });
    emulator.add_listener('serial0-output-byte', (byte) => {
      appendOutput(byte);
    });
    emulator.add_listener('download-progress', ({ file_name, loaded, total }) => {
      const name = file_name.split('/').pop() ?? 'file';
      setStatus(
        total ? `Loading ${name} · ${Math.round((loaded / total) * 100)}%` : `Loading ${name}…`,
      );
    });
    emulator.add_listener('emulator-started', () => setStatus('Linux is starting…'));
    emulator.add_listener('download-error', ({ file_name }) => {
      setStatus(`Could not load ${file_name.split('/').pop() ?? 'asset'}`);
      power.disabled = false;
      booting = false;
    });
    restart.hidden = false;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Linux could not start');
    power.disabled = false;
  } finally {
    booting = false;
  }
}

power.addEventListener('click', () => void boot());
restart.addEventListener('click', () => void boot());
terminal.onData((data) => {
  if (ready) emulator?.serial0_send(data);
});

const controlBytes: Record<string, string> = {
  'ctrl-c': '\x03',
  'ctrl-d': '\x04',
  'ctrl-l': '\x0c',
};
for (const button of keyButtons) {
  button.addEventListener('click', () => {
    if (ready) emulator?.serial0_send(controlBytes[button.id]!);
    terminal.focus();
  });
}

upload.addEventListener('change', async () => {
  const file = upload.files?.[0];
  if (!ready || !emulator || !file) return;
  upload.disabled = true;
  fileStatus.textContent = `Uploading ${file.name}…`;
  try {
    const name = file.name.replaceAll(/[\\/]/g, '_');
    await emulator.create_file(`/${name}`, new Uint8Array(await file.arrayBuffer()));
    fileStatus.textContent = `${name} is available at /mnt/${name}`;
  } catch (error) {
    fileStatus.textContent = `Upload failed: ${String(error)}`;
  } finally {
    upload.value = '';
    upload.disabled = false;
    terminal.focus();
  }
});

downloadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = downloadPath.value.trim();
  if (!ready || !emulator || !name || name.includes('/') || name.includes('\\')) return;
  downloadButton.disabled = true;
  try {
    const contents = await emulator.read_file(`/${name}`);
    const url = URL.createObjectURL(new Blob([new Uint8Array(contents)]));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    fileStatus.textContent = `Downloaded ${name}`;
  } catch (error) {
    fileStatus.textContent = `Download failed: ${String(error)}`;
  } finally {
    downloadButton.disabled = false;
    terminal.focus();
  }
});
