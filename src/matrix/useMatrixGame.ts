import { useEffect, useRef, useState } from 'react';
import {
  EventDirection,
  MatrixCapabilities,
  WidgetApi,
  WidgetEventCapability,
} from 'matrix-widget-api';
import {
  GAME_EVENT,
  gameEventBytes,
  MAX_GAME_EVENT_BYTES,
  type GameAction,
  type GameEvent,
} from '../model/game';
import { readCurrentGameEvents } from './GameEvents';

export function useMatrixGame(widgetId: string | null, enabled: boolean) {
  const apiRef = useRef<WidgetApi | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const [api, setApi] = useState<WidgetApi | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameStateReady, setGameStateReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !widgetId) return;
    const widgetApi = new WidgetApi(widgetId, '*');
    apiRef.current = widgetApi;
    setApi(widgetApi);
    widgetApi.requestCapabilityToSendEvent(GAME_EVENT);
    widgetApi.requestCapabilityToReceiveEvent(GAME_EVENT);
    widgetApi.requestCapabilityToReceiveState('m.room.member');
    widgetApi.requestCapability(MatrixCapabilities.MSC4039DownloadFile);
    let alive = true;
    let pollTimer: number | undefined;
    let contentLoadedRetry: number | undefined;
    let connectionTimeout: number | undefined;
    let reading = false;

    async function refresh() {
      if (reading) return;
      reading = true;
      try {
        const roomEvents = await readCurrentGameEvents((limit) =>
          widgetApi.readRoomEvents(GAME_EVENT, limit),
        );
        if (alive) {
          setEvents(roomEvents);
          setGameStateReady(true);
          setError('');
        }
      } catch (cause) {
        if (alive) {
          setGameStateReady(false);
          setError(`Could not read game state: ${String(cause)}`);
        }
      } finally {
        reading = false;
      }
    }
    refreshRef.current = refresh;
    widgetApi.on('ready', () => {
      if (!alive) return;
      if (contentLoadedRetry !== undefined) window.clearInterval(contentLoadedRetry);
      if (connectionTimeout !== undefined) window.clearTimeout(connectionTimeout);
      const canSend = widgetApi.hasCapability(
        WidgetEventCapability.forRoomEvent(EventDirection.Send, GAME_EVENT).raw,
      );
      const canReceive = widgetApi.hasCapability(
        WidgetEventCapability.forRoomEvent(EventDirection.Receive, GAME_EVENT).raw,
      );
      if (!canSend || !canReceive) {
        setPermissionDenied(true);
        setError(
          'The Matrix client did not grant permission to send and receive game events. Review this widget’s permissions in your client, then reopen it.',
        );
        return;
      }
      setPermissionDenied(false);
      setError('');
      setConnected(true);
      void refresh();
      pollTimer = window.setInterval(() => void refresh(), 2000);
    });
    widgetApi.start();
    const notifyLoaded = () => void widgetApi.sendContentLoaded().catch(() => undefined);
    notifyLoaded();
    contentLoadedRetry = window.setInterval(notifyLoaded, 3000);
    connectionTimeout = window.setTimeout(() => {
      if (alive)
        setError(
          'The Matrix client did not complete the widget handshake. Check that the widget URL includes widgetId and userId.',
        );
    }, 15_000);
    return () => {
      alive = false;
      if (contentLoadedRetry !== undefined) window.clearInterval(contentLoadedRetry);
      if (connectionTimeout !== undefined) window.clearTimeout(connectionTimeout);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      widgetApi.transport.stop();
      apiRef.current = null;
      refreshRef.current = null;
      setApi(null);
      setConnected(false);
    };
  }, [widgetId, enabled]);

  async function send(action: GameAction): Promise<boolean> {
    if (!apiRef.current || !connected) return false;
    if (gameEventBytes(action) > MAX_GAME_EVENT_BYTES) {
      setError('This drawing is too large to send. Undo a fill or simplify it.');
      return false;
    }
    setBusy(true);
    setError('');
    try {
      await apiRef.current.sendRoomEvent(GAME_EVENT, action);
      await refreshRef.current?.();
      return true;
    } catch (cause) {
      setError(`Could not save turn: ${String(cause)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { api, connected, gameStateReady, permissionDenied, events, busy, error, setError, send };
}
