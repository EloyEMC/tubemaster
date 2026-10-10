const TRANSCRIPT_TIMESTAMP = /^\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{3}(?:\s+.*)?\s*$/;
const INLINE_TIMESTAMP = /<\d{1,2}:\d{2}:\d{2}[,.]\d{3}>/g;
const BASIC_MARKUP = /<\/?(?:b|i|u|c(?:\.[^ >]+)?|v(?:\s+[^>]*)?|lang(?:\s+[^>]*)?)>/gi;
const CUE_METADATA = /^(?:NOTE|STYLE|REGION|X-TIMESTAMP-MAP)\b/i;

export function normalizeTranscript(text: string) {
  const normalizedLines = text.replace(/\r\n?/g, "\n");
  const contentLines: string[] = [];
  const blocks = normalizedLines.split(/\n{2,}/);

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim());
    if (lines.length === 0 || lines.every((line) => line === "")) continue;
    if (lines[0].replace(/^\uFEFF/, "").toUpperCase() === "WEBVTT") continue;
    if (CUE_METADATA.test(lines[0])) continue;
    const timestampIndex = lines.findIndex((line) => TRANSCRIPT_TIMESTAMP.test(line));
    const transcriptLines = timestampIndex >= 0 ? lines.slice(timestampIndex + 1) : lines;

    for (const line of transcriptLines) {
      if (/^\d+$/.test(line)) continue;
      const cleaned = line.replace(INLINE_TIMESTAMP, "").replace(BASIC_MARKUP, "").replace(/\s+/g, " ").trim();
      if (cleaned) contentLines.push(cleaned);
    }
  }

  const result: string[] = [];
  for (const line of contentLines) if (result[result.length - 1] !== line) result.push(line);
  return result.join("\n");
}
