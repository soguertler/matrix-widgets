import { type WidgetApi } from '@matrix-widget-toolkit/api';
import { startRoomWidget } from './widgetClient';
import { useEffect, useRef, useState } from 'react';
import { EventDirection, WidgetEventCapability, type IRoomEvent } from 'matrix-widget-api';

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
    const required = [
      WidgetEventCapability.forRoomEvent(EventDirection.Send, eventType),
      WidgetEventCapability.forRoomEvent(EventDirection.Receive, eventType),
    ];
    const connection = startRoomWidget(eventType, capabilities);
    if (!connection) return;
    const { client, ready } = connection;
    const widgetApi = client.matrixWidgetApi;
    apiRef.current = client;
    setApi(client);
    let alive = true;
    let pollTimer: number | undefined;
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
    void ready
      .then(() => {
        if (!alive) return;
        if (connectionTimeout !== undefined) window.clearTimeout(connectionTimeout);
        if (!client.hasCapabilities(required)) {
          setPermissionDenied(true);
          setError(permissionError);
          return;
        }
        setPermissionDenied(false);
        setError('');
        setConnected(true);
        void refresh();
        pollTimer = window.setInterval(() => void refresh(), 2000);
      })
      .catch((cause: unknown) => {
        if (alive) setError(String(cause));
      });
    connectionTimeout = window.setTimeout(() => {
      if (alive)
        setError(
          'The Matrix client did not complete the widget handshake. Check that the widget URL includes widgetId and userId.',
        );
    }, 15_000);
    return () => {
      alive = false;
      if (connectionTimeout !== undefined) window.clearTimeout(connectionTimeout);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
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
