/** Kích thước ảnh TMDB dùng cho poster trong admin. */
export type PosterSize = 'w200' | 'w342' | 'w500' | 'w780' | 'original';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/**
 * Chuẩn hoá `posterPath` thành URL hiển thị được:
 * - rỗng → `null` (render fallback);
 * - URL tuyệt đối (`http…`) → giữ nguyên;
 * - path TMDB (`/abc.jpg`) → ghép base + size.
 */
export function getPosterUrl(
  path: string | null | undefined,
  size: PosterSize = 'w342',
): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${TMDB_IMAGE_BASE}/${size}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}
