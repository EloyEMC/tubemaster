type Thumbnail = { url?: string | null } | null;

export function channelThumbnailCandidates(thumbnails?: {
  default?: Thumbnail;
  medium?: Thumbnail;
  high?: Thumbnail;
  standard?: Thumbnail;
  maxres?: Thumbnail;
} | null): string[] {
  const urls = [thumbnails?.maxres, thumbnails?.standard, thumbnails?.high, thumbnails?.medium, thumbnails?.default]
    .map((thumbnail) => thumbnail?.url?.trim())
    .map((url) => url?.startsWith("//") ? `https:${url}` : url)
    .filter((url): url is string => !!url && /^https?:\/\//i.test(url));
  return [...new Set(urls)];
}

export function withProfileImageFallback(
  candidates: string[],
  profileImage: string | null | undefined,
): string[] {
  const image = profileImage?.trim();
  if (!image || candidates.includes(image)) return candidates;
  try {
    if (new URL(image).protocol === "https:") return [...candidates, image];
  } catch {
    // Ignore malformed profile image URLs.
  }
  return candidates;
}

export function nextChannelThumbnail(candidates: string[], failed: string): string | undefined {
  const index = candidates.indexOf(failed);
  return index < 0 ? candidates[0] : candidates[index + 1];
}
