export interface BoardRoute { boardId: string; path: string; legacy: boolean; }

export function resolveBoardRoute(pathname: string, search: string): BoardRoute {
  const pathMatch = pathname.match(/^\/board\/([^/]+)\/?$/);
  if (pathMatch?.[1]) {
    let boardId = pathMatch[1];
    try { boardId = decodeURIComponent(boardId); } catch { /* Keep malformed segments for the API to reject. */ }
    return { boardId, path: pathname, legacy: false };
  }
  const legacyId = new URLSearchParams(search).get('board');
  if (!legacyId) return { boardId: '', path: pathname, legacy: false };
  const params = new URLSearchParams(search);
  params.delete('board');
  const path = `/board/${encodeURIComponent(legacyId)}${params.size ? `?${params}` : ''}`;
  return { boardId: legacyId, path, legacy: true };
}

export function boardPath(boardId: string): string {
  return `/board/${encodeURIComponent(boardId)}`;
}