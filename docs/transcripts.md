# Transcript acquisition

TubeMaster keeps the official YouTube Captions API provider as the preferred path for owned videos and its OAuth-backed behavior is unchanged.

An optional public-video adapter, `createYtDlpTranscriptProvider`, can be injected into the existing transcript provider chain. It invokes the locally installed `yt-dlp` executable with an argument array (no shell interpolation), a 15-second default timeout, deterministic language ordering, and manual subtitles before automatic subtitles. VTT/SRT output is normalized by the existing transcript normalization boundary.

## Runtime requirements

Install `yt-dlp` separately and make the executable available on `PATH`, or inject an explicit command path. TubeMaster does not install, update, or invoke a live public-video adapter unless the adapter is explicitly configured. Tests mock the child-process runner and never access live videos.

The adapter is read-only from TubeMaster's perspective: it does not write captions, metadata, embeddings, indexes, or backfill jobs. A future wiring decision is still required before changing the default fallback behavior for issue #15 or inferring whether a video is owned.

## Guided local setup

The authenticated dashboard checks server-side executable availability on mount and shows manual setup suggestions only when a prerequisite is missing. The read-only capabilities endpoint (`GET /api/video-metadata/capabilities`) reports boolean availability for `yt-dlp`, `ffmpeg`, and Whisper, plus a coarse platform and supported-backend flag. It never returns paths, environment values, credentials, command output, or probe errors. It does not run transcription or install anything. YouTube captions remain usable independently of local tools.

The Whisper check uses `TUBEMASTER_WHISPER_COMMAND` when set, otherwise the provider default `mlx_whisper`. `TUBEMASTER_WHISPER_BACKEND` optionally selects the backend; `mlx_whisper` is the supported default. Other backend values are reported unsupported rather than guessed to work. Presence checks cannot guarantee that a command works or a model is available. Install dependencies on the **server**, not the browser device, and refresh the dashboard after changing its environment or PATH. On macOS the suggestions use Homebrew for yt-dlp/ffmpeg and pip for mlx-whisper; Linux and Windows show platform-specific yt-dlp/ffmpeg suggestions and advise using a compatible host for mlx-whisper. TubeMaster will not execute suggested commands, auto-install software, or download models.

## Privacy and terms

Public-video retrieval sends the supplied video URL to `yt-dlp` and the relevant public service. Operators are responsible for complying with YouTube's terms, `yt-dlp`'s license and usage guidance, copyright, and applicable privacy law. Captions may contain personal or sensitive information. Errors returned through the transcript contract are sanitized and never expose command output, URLs, headers, tokens, or credentials.
