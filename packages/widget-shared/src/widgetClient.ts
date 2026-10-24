import { WidgetApiImpl, type WidgetApiOptions } from '@matrix-widget-toolkit/api';
import { WidgetApi } from 'matrix-widget-api';
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
