/** Escape user text for use inside an ILIKE pattern, so "%" and "_" match literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
