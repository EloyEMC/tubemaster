# Transcript acquisition

TubeMaster keeps the official YouTube Captions API provider as the preferred path for owned videos and its OAuth-backed behavior is unchanged.

An optional public-video adapter, `createYtDlpTranscriptProvider`, can be injected into the existing transcript provider chain. It invokes the locally installed `yt-dlp` executable with an argument array (no shell interpolation), a 15-second default timeout, deterministic language ordering, and manual subtitles before automatic subtitles. VTT/SRT output is normalized by the existing transcript normalization boundary.

## Runtime requirements

Install `yt-dlp` separately and make the executable available on `PATH`, or inject an explicit command path. TubeMaster does not install, update, or invoke a live public-video adapter unless the adapter is explicitly configured. Tests mock the child-process runner and never access live videos.

The adapter is read-only from TubeMaster's perspective: it does not write captions, metadata, embeddings, indexes, or backfill jobs. A future wiring decision is still required before changing the default fallback behavior for issue #15 or inferring whether a video is owned.

## Privacy and terms

Public-video retrieval sends the supplied video URL to `yt-dlp` and the relevant public service. Operators are responsible for complying with YouTube's terms, `yt-dlp`'s license and usage guidance, copyright, and applicable privacy law. Captions may contain personal or sensitive information. Errors returned through the transcript contract are sanitized and never expose command output, URLs, headers, tokens, or credentials.
