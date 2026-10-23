import { V86 } from 'v86';
import './style.css';

const status = document.querySelector<HTMLElement>('#status')!;
const terminal = document.querySelector<HTMLElement>('#terminal')!;
const power = document.querySelector<HTMLButtonElement>('#power')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
const form = document.querySelector<HTMLFormElement>('#command-form')!;
const input = document.querySelector<HTMLInputElement>('#command')!;
const send = form.querySelector<HTMLButtonElement>('button')!;

let emulator: V86 | undefined;
let booting = false;
let ready = false;
let recent = '';

const asset = (name: string) => new URL(name, document.baseURI).href;

function setStatus(message: string) {
  status.textContent = message;
}

function appendOutput(character: string) {
  if (character === '\r') return;
  terminal.textContent += character;
  if (terminal.textContent.length > 60_000) {
    terminal.textContent = terminal.textContent.slice(-50_000);
  }
  terminal.scrollTop = terminal.scrollHeight;
  recent = (recent + character).slice(-100);
  if (!ready && /(?:~% |# |\$ )$/.test(recent)) {
    ready = true;
    input.disabled = false;
    send.disabled = false;
    setStatus('Shell ready');
    input.focus();
  }
}

async function boot() {
  if (booting) return;
  booting = true;
  ready = false;
  recent = '';
  power.disabled = true;
  restart.hidden = true;
  input.disabled = true;
  send.disabled = true;
  terminal.textContent = '';
  setStatus('Loading Linux…');

  if (emulator) {
    await emulator.destroy();
    emulator = undefined;
  }

  try {
    emulator = new V86({
      wasm_path: asset('v86.wasm'),
      memory_size: 64 * 1024 * 1024,
      vga_memory_size: 2 * 1024 * 1024,
      bios: { url: asset('seabios.bin') },
      vga_bios: { url: asset('vgabios.bin') },
      bzimage: { url: asset('buildroot-bzimage68.bin') },
      filesystem: {},
      cmdline: 'console=ttyS0 tsc=reliable mitigations=off random.trust_cpu=on',
      disable_keyboard: true,
      disable_mouse: true,
      disable_speaker: true,
      autostart: true,
    });
    emulator.add_listener('serial0-output-byte', (byte) => {
      appendOutput(String.fromCharCode(byte));
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
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!ready || !emulator || !input.value.trim()) return;
  emulator.serial0_send(`${input.value}\n`);
  input.value = '';
});
