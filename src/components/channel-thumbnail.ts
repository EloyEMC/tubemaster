type Thumbnail = { url?: string | null } | null;

export function selectChannelThumbnail(thumbnails?: {
  default?: Thumbnail;
  medium?: Thumbnail;
  high?: Thumbnail;
} | null): string | undefined {
  for (const thumbnail of [thumbnails?.default, thumbnails?.medium, thumbnails?.high]) {
    const url = thumbnail?.url?.trim();
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  return undefined;
}

export function fallbackChannelThumbnail(
  primary: string | undefined,
  sessionImage: string | null | undefined,
  current: string | undefined,
): string | undefined {
  const fallback = sessionImage?.trim();
  return current === primary && fallback && /^https?:\/\//i.test(fallback) && fallback !== primary
    ? fallback
    : undefined;
}
