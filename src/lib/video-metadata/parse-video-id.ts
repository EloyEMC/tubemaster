const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

function isVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (isVideoId(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !YOUTUBE_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    return null;
  }

  if (url.hostname === "youtu.be" || url.hostname === "www.youtu.be") {
    const segments = url.pathname.split("/");
    return segments.length === 2 && isVideoId(segments[1]) ? segments[1] : null;
  }

  if (url.pathname === "/watch") {
    const videoIds = url.searchParams.getAll("v");
    return videoIds.length === 1 && isVideoId(videoIds[0]) ? videoIds[0] : null;
  }

  const segments = url.pathname.split("/");
  if (segments.length !== 3 || !["embed", "v", "shorts"].includes(segments[1])) {
    return null;
  }

  return isVideoId(segments[2]) ? segments[2] : null;
}
