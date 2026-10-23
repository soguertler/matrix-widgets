import { useEffect, useRef, useState } from 'react';
import {
  EventDirection,
  MatrixCapabilities,
  WidgetApi,
  WidgetEventCapability,
  type IRoomEvent,
} from 'matrix-widget-api';

export type RoomEvent = Pick<IRoomEvent, 'sender' | 'event_id' | 'origin_server_ts' | 'content'>;

type Options<TEvent extends RoomEvent> = {
  widgetId: string | null;
  enabled: boolean;
  eventType: string;
  readEvents: (read: (limit: number) => Promise<RoomEvent[]>) => Promise<TEvent[]>;
  validateAction?: (action: object) => string | null;
  readErrorLabel?: string;
  sendErrorLabel?: string;
  permissionError?: string;
  capabilities?: string[];
};

export function useRoomEventChannel<TEvent extends RoomEvent, TAction extends object>({
  widgetId,
  enabled,
  eventType,
  readEvents,
  validateAction,
  readErrorLabel = 'Could not read room events',
  sendErrorLabel = 'Could not send room event',
  permissionError = 'The Matrix client did not grant permission to send and receive room events. Review this widget’s permissions in your client, then reopen it.',
  capabilities = [],
}: Options<TEvent>) {
  const apiRef = useRef<WidgetApi | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const [api, setApi] = useState<WidgetApi | null>(null);
  const [connected, setConnected] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [events, setEvents] = useState<TEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !widgetId) return;
    const widgetApi = new WidgetApi(widgetId, '*');
    apiRef.current = widgetApi;
    setApi(widgetApi);
    widgetApi.requestCapabilityToSendEvent(eventType);
    widgetApi.requestCapabilityToReceiveEvent(eventType);
    widgetApi.requestCapabilityToReceiveState('m.room.member');
    widgetApi.requestCapability(MatrixCapabilities.MSC4039DownloadFile);
    for (const capability of capabilities) widgetApi.requestCapability(capability);
    let alive = true;
    let pollTimer: number | undefined;
    let contentLoadedRetry: number | undefined;
    let connectionTimeout: number | undefined;
    let reading = false;

    async function refresh() {
      if (reading) return;
      reading = true;
      try {
        const roomEvents = await readEvents((limit) => widgetApi.readRoomEvents(eventType, limit));
        if (alive) {
          setEvents(roomEvents);
          setStateReady(true);
          setError('');
        }
      } catch (cause) {
        if (alive) {
          setStateReady(false);
          setError(`${readErrorLabel}: ${String(cause)}`);
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
        WidgetEventCapability.forRoomEvent(EventDirection.Send, eventType).raw,
      );
      const canReceive = widgetApi.hasCapability(
        WidgetEventCapability.forRoomEvent(EventDirection.Receive, eventType).raw,
      );
      if (!canSend || !canReceive) {
        setPermissionDenied(true);
        setError(permissionError);
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
  }, [widgetId, enabled, eventType, readEvents, readErrorLabel, permissionError]);

  async function send(action: TAction): Promise<boolean> {
    if (!apiRef.current || !connected) return false;
    const validationError = validateAction?.(action);
    if (validationError) {
      setError(validationError);
      return false;
    }
    setBusy(true);
    setError('');
    try {
      await apiRef.current.sendRoomEvent(eventType, action);
      await refreshRef.current?.();
      return true;
    } catch (cause) {
      setError(`${sendErrorLabel}: ${String(cause)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { api, connected, stateReady, permissionDenied, events, busy, error, setError, send };
}
