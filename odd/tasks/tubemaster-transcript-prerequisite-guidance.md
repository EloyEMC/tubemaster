# Transcript prerequisite guidance

## Goal
Detect missing local transcript prerequisites and show safe, actionable installation guidance in the authenticated dashboard.

## Decision
Use guided installation only. TubeMaster must not silently install system binaries, Python packages, models, or execute package-manager commands. The app reports capability status and renders operator-approved commands.

## Tasks
1. Add read-only runtime capability detection for yt-dlp, ffmpeg, and Whisper backend availability.
2. Add an authenticated capability route and dashboard setup guidance.
3. Document macOS/Linux/Windows prerequisite commands and verification.
4. Run focused tests and structural checks.

## Acceptance evidence
- Missing prerequisites are detected without invoking real transcription.
- The dashboard explains which capability is missing and how to install it.
- Installation commands are displayed as guidance, not executed by the app.
- Existing transcript behavior and contracts remain unchanged.

## Non-goals
- Automatic installation or updates.
- Automatic model downloads.
- Running real yt-dlp, ffmpeg, or Whisper during tests.
