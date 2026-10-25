import { WidgetApiImpl, type WidgetApiOptions } from '@matrix-widget-toolkit/api';
import {
  WidgetApi,
  EventDirection,
  MatrixCapabilities,
  WidgetEventCapability,
} from 'matrix-widget-api';
import { widgetUrlParam } from './widgetParams';

export function createWidgetClient(widgetId: string, options: WidgetApiOptions = {}) {
  const parentUrl = widgetUrlParam('parentUrl');
  const transport = new WidgetApi(widgetId, parentUrl ? new URL(parentUrl).origin : '*');
  const params = Object.fromEntries(
    ['userId', 'roomId', 'deviceId'].flatMap((key) => {
      const value = widgetUrlParam(key);
      return value ? [[key, value]] : [];
    }),
  );
  return new WidgetApiImpl(transport, widgetId, { ...params, isOpenedByClient: true }, options);
}

const roomClients = new Map<string, { client: WidgetApiImpl; ready: Promise<void> }>();

export function startRoomWidget(eventType: string, capabilities: string[] = []) {
  const widgetId = widgetUrlParam('widgetId');
  if (!widgetId || window.parent === window) return null;
  const existing = roomClients.get(widgetId);
  if (existing) return existing;
  const client = createWidgetClient(widgetId, {
    capabilities: [
      WidgetEventCapability.forRoomEvent(EventDirection.Send, eventType),
      WidgetEventCapability.forRoomEvent(EventDirection.Receive, eventType),
      WidgetEventCapability.forStateEvent(EventDirection.Receive, 'm.room.member'),
      MatrixCapabilities.MSC4039DownloadFile,
      ...capabilities,
    ],
  });
  const ready = client.initialize();
  void ready.catch(() => undefined);
  const connection = { client, ready };
  roomClients.set(widgetId, connection);
  window.addEventListener('pagehide', () => client.matrixWidgetApi.transport.stop(), {
    once: true,
  });
  return connection;
}
