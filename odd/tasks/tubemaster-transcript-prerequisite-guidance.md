# Transcript prerequisite guidance

## Goal
Detect missing local transcript prerequisites and show safe, actionable installation guidance in the authenticated dashboard.

## Decision
Use guided installation only. TubeMaster must not silently install system binaries, Python packages, models, or execute package-manager commands. The app reports capability status and renders operator-approved commands.

## Tasks
1. Add read-only runtime capability detection for yt-dlp, ffmpeg, and Whisper backend availability. **Done**
2. Add an authenticated capability route and dashboard setup guidance. **Done**
3. Document macOS/Linux/Windows prerequisite commands and verification. **Done**
4. Run focused tests and structural checks. **Done**

## Evidence
- PR #10 feature commit: `f0d55d3`.
- PR #15 propagated setup guidance and resolved transcript display merge: `167cc63`.
- Focused capability/dashboard tests: **13 passed, 0 failed**.
- `git diff --check`: passed.
- No packages, models, or live providers were installed or executed.

## Acceptance evidence
- Missing prerequisites are detected without invoking real transcription.
- The dashboard explains which capability is missing and how to install it.
- Installation commands are displayed as guidance, not executed by the app.
- Existing transcript behavior and contracts remain unchanged.

## Non-goals
- Automatic installation or updates.
- Automatic model downloads.
- Running real yt-dlp, ffmpeg, or Whisper during tests.
