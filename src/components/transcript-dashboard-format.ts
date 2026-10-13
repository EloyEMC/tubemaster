import type { TranscriptResult } from "@/lib/video-metadata/contracts";

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  const parts = hours > 0 ? [hours, minutes, remainder] : [minutes, remainder];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatTranscriptResult(transcript: Extract<TranscriptResult, { status: "available" }>): string {
  if (transcript.source !== "local-whisper") return transcript.text;
  const segments = transcript.segments?.filter((segment) =>
    Number.isFinite(segment.start) && segment.start >= 0 && typeof segment.text === "string" && segment.text.trim()
  );
  if (!segments?.length) return transcript.text;
  return [...segments]
    .sort((left, right) => left.start - right.start)
    .map((segment) => `[${formatTimestamp(segment.start)}] ${segment.text.trim()}`)
    .join("\n");
}
