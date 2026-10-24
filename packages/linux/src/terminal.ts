import { sharedFilePath } from './downloadPath';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { V86 } from 'v86';

export function createTerminal(
  terminalElement: HTMLElement,
  onStatus: (value: string) => void,
  onMessage: (value: string) => void,
  onReady: (value: boolean) => void,
  onBusy: (value: boolean) => void,
) {
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
  const observer = new ResizeObserver(() => fitAddon.fit());
  observer.observe(terminalElement);
  let emulator: V86 | undefined;
  let disposed = false;
  let bootTimeout: number | undefined;
  const guestCommandNames = ['widgetfetch', 'micropython', 'snake', 'top'] as const;
  let guestCommands: Map<string, Uint8Array> | undefined;
  let booting = false;
  let ready = false;
  let configuring = false;
  let recent = '';
  let outputVisible = false;
  let markerTail = '';
  let skipMarkerLine = false;

  const readyMarker = '__WIDGET_LINUX_READY__';
  const finishSetup = "clear; printf '%s%s\\n' __WIDGET_ LINUX_READY__";
  const guestSetup = [
    'hostname widget-linux',
    'udhcpc -i eth0 -q -n -t 3 -T 2',
    'cp /mnt/widgetfetch /usr/bin/widgetfetch',
    'cp /mnt/micropython /usr/bin/micropython',
    'chmod +x /usr/bin/widgetfetch /usr/bin/micropython /mnt/snake /mnt/top',
    'ln -sf /mnt/snake /usr/bin/snake',
    `stty rows ${terminal.rows} cols ${terminal.cols}`,
    'ln -sf /mnt/top /usr/bin/top',
    'ln -sf widgetfetch /usr/bin/fetch',
    'ln -sf micropython /usr/bin/python',
    'export TERM=xterm',
  ];

  const asset = (name: string) => new URL(name, document.baseURI).href;

  function setStatus(message: string) {
    onStatus(message);
  }

  async function configureGuest() {
    const active = emulator;
    if (!active || !guestCommands) return;
    try {
      for (const [name, bytes] of guestCommands) {
        await active.create_file(`/${name}`, bytes);
      }
      if (active !== emulator) return;
      active.serial0_send(`${[...guestSetup, finishSetup, 'widgetfetch'].join('; ')}\n`);
    } catch (error) {
      onMessage(`Could not install guest commands: ${String(error)}`);
      if (active === emulator) {
        active.serial0_send(`${guestSetup.slice(0, 2).join('; ')}; ${finishSetup}\n`);
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
      if (!outputVisible) return;
      ready = true;
      booting = false;
      window.clearTimeout(bootTimeout);
      onBusy(false);
      onReady(true);
      setStatus('Shell ready');
      terminal.focus();
    }
  }

  async function boot() {
    if (booting || disposed) return;
    booting = true;
    ready = false;
    onReady(false);
    configuring = false;
    recent = '';
    outputVisible = false;
    markerTail = '';
    skipMarkerLine = false;
    onBusy(true);
    onMessage('');
    terminal.reset();
    setStatus('Loading Linux…');

    try {
      if (emulator) {
        const previous = emulator;
        emulator = undefined;
        await previous.destroy();
      }
      guestCommands = new Map(
        await Promise.all(
          guestCommandNames.map(async (name) => {
            const response = await window.fetch(asset(name));
            if (!response.ok) throw new Error(`Could not load ${name}`);
            return [name, new Uint8Array(await response.arrayBuffer())] as const;
          }),
        ),
      );
      if (disposed) return;
      const active = new V86({
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
      emulator = active;
      bootTimeout = window.setTimeout(() => {
        if (emulator !== active || ready) return;
        setStatus('Linux startup timed out. Use power to retry.');
        booting = false;
        onBusy(false);
      }, 90_000);
      active.add_listener('serial0-output-byte', (byte) => {
        if (emulator !== active) return;
        appendOutput(byte);
      });
      active.add_listener('download-progress', ({ file_name, loaded, total }) => {
        if (emulator !== active) return;
        const name = file_name.split('/').pop() ?? 'file';
        setStatus(
          total ? `Loading ${name} · ${Math.round((loaded / total) * 100)}%` : `Loading ${name}…`,
        );
      });
      active.add_listener('emulator-started', () => {
        if (emulator === active) setStatus('Linux is starting…');
      });
      active.add_listener('download-error', ({ file_name }) => {
        if (emulator !== active) return;
        setStatus(`Could not load ${file_name.split('/').pop() ?? 'asset'}`);
        onBusy(false);
        booting = false;
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Linux could not start');
      onBusy(false);
      booting = false;
    }
  }

  const input = terminal.onData((data) => {
    if (ready) emulator?.serial0_send(data);
  });
  async function upload(file: File) {
    if (!ready || !emulator || !file) return;
    onMessage(`Uploading ${file.name}…`);
    try {
      const name = file.name.replaceAll(/[\\/]/g, '_');
      await emulator.create_file(`/${name}`, new Uint8Array(await file.arrayBuffer()));
      onMessage(`${name} is available at /mnt/${name}`);
    } catch (error) {
      onMessage(`Upload failed: ${String(error)}`);
    } finally {
      terminal.focus();
    }
  }

  async function download(path: string) {
    const name = path.trim();
    if (!ready || !emulator) throw new Error('Shell is not ready');
    const sharedPath = sharedFilePath(name);
    try {
      const contents = await emulator.read_file(sharedPath);
      const url = URL.createObjectURL(new Blob([new Uint8Array(contents)]));
      const link = document.createElement('a');
      link.href = url;
      link.download = name.split('/').pop()!;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      onMessage(`Downloaded ${name}`);
    } finally {
      terminal.focus();
    }
  }

  return {
    boot,
    upload,
    download,
    dispose() {
      disposed = true;
      window.clearTimeout(bootTimeout);
      observer.disconnect();
      input.dispose();
      terminal.dispose();
      const active = emulator;
      emulator = undefined;
      void active?.destroy();
    },
  };
}
