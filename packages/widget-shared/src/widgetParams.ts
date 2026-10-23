export function widgetUrlParam(name: string): string | null {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#\/?\??/, ''));
  return query.get(name) ?? fragment.get(name);
}
