type Thumbnail = { url?: string | null } | null;

export function channelThumbnailCandidates(thumbnails?: {
  default?: Thumbnail;
  medium?: Thumbnail;
  high?: Thumbnail;
} | null): string[] {
  const urls = [thumbnails?.default, thumbnails?.medium, thumbnails?.high]
    .map((thumbnail) => thumbnail?.url?.trim())
    .filter((url): url is string => !!url && /^https?:\/\//i.test(url));
  return [...new Set(urls)];
}

export function selectChannelThumbnail(thumbnails?: Parameters<typeof channelThumbnailCandidates>[0]): string | undefined {
  return channelThumbnailCandidates(thumbnails)[0];
}

export function nextChannelThumbnail(candidates: string[], failed: string): string | undefined {
  const index = candidates.indexOf(failed);
  return index < 0 ? candidates[0] : candidates[index + 1];
}
