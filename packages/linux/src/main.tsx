import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, Power, Upload } from 'lucide-react';
import { createWidgetClient, widgetUrlParam } from '@widget-games/widget-shared';
import { createTerminal } from './terminal';
import '@xterm/xterm/css/xterm.css';
import './style.css';

const widgetId = widgetUrlParam('widgetId');
if (window.parent !== window && widgetId) {
  const client = createWidgetClient(widgetId);
  const loaded = () => void client.matrixWidgetApi.sendContentLoaded().catch(() => undefined);
  const retry = window.setInterval(loaded, 3000);
  void client.initialize().finally(() => window.clearInterval(retry));
  loaded();
}

function App() {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createTerminal> | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState('Boot Linux to begin');
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [path, setPath] = useState('/mnt/');
  const [error, setError] = useState('');
  useEffect(() => {
    const instance = createTerminal(host.current!, setStatus, setMessage, setReady, setBusy);
    controller.current = instance;
    return () => {
      controller.current = null;
      instance.dispose();
    };
  }, []);
  async function download(event: FormEvent) {
    event.preventDefault();
    setTransferring(true);
    setError('');
    try {
      await controller.current?.download(path);
      dialog.current?.close();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setTransferring(false);
    }
  }
  return (
    <main>
      <header className="terminal-top">
        <strong>
          Linux <span>ttyS0</span>
        </strong>
        <span className="status" role="status" title={message || status}>
          {message || status}
        </span>
        <button
          title="Upload to /mnt"
          aria-label="Upload to /mnt"
          disabled={!ready || transferring}
          onClick={() => upload.current?.click()}
        >
          <Upload size={18} />
        </button>
        <button
          title="Download file"
          aria-label="Download file"
          disabled={!ready || transferring}
          onClick={() => {
            setError('');
            dialog.current?.showModal();
          }}
        >
          <Download size={18} />
        </button>
        <button
          title={ready ? 'Restart Linux (clears files)' : 'Boot Linux'}
          aria-label={ready ? 'Restart Linux' : 'Boot Linux'}
          disabled={busy || transferring}
          onClick={() => void controller.current?.boot()}
        >
          <Power size={18} />
        </button>
        <input
          ref={upload}
          type="file"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setTransferring(true);
            try {
              await controller.current?.upload(file);
            } finally {
              setTransferring(false);
              if (upload.current) upload.current.value = '';
            }
          }}
        />
      </header>
      <div ref={host} id="terminal" aria-label="Interactive Linux terminal" />
      <dialog ref={dialog} aria-labelledby="download-title">
        <form onSubmit={(event) => void download(event)}>
          <h2 id="download-title">Download a file</h2>
          <label htmlFor="download-path">Path in the shared filesystem</label>
          <input
            id="download-path"
            autoFocus
            required
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="/mnt/example.txt"
          />
          <p>Copy files to /mnt in the terminal before downloading.</p>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button type="button" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button disabled={transferring || !ready} type="submit">
              {transferring ? 'Downloading…' : 'Download'}
            </button>
          </footer>
        </form>
      </dialog>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
