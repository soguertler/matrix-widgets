export function sharedFilePath(path: string): string {
  const value = path.trim();
  const parts = value.split('/');
  if (
    !value.startsWith('/mnt/') ||
    parts.includes('..') ||
    parts.includes('.') ||
    value.includes('\\') ||
    value.includes('\0') ||
    !parts.at(-1)
  ) {
    throw new Error('Enter a file path inside /mnt, such as /mnt/example.txt');
  }
  return value.slice(4);
}
