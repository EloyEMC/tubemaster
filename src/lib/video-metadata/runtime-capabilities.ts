import { access, constants, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export type RuntimeCapabilities = {
  platform: "macos" | "linux" | "windows" | "other";
  ytDlp: boolean;
  ffmpeg: boolean;
  whisper: boolean;
  whisperBackend: "mlx_whisper" | "unsupported";
};

/** Check executable presence without invoking it. Never return paths or environment values. */
export async function commandAvailable(command: string, env: NodeJS.ProcessEnv = process.env, platform = process.platform): Promise<boolean> {
  if (!command || command.trim() !== command || /[\0\r\n]/.test(command)) return false;
  const windows = platform === "win32";
  const extensions = windows ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
  const candidates = windows && !extensions.some((extension) => command.toLowerCase().endsWith(extension.toLowerCase()))
    ? extensions.map((extension) => command + extension.toLowerCase()) : [command];
  const paths = isAbsolute(command) ? [""] : command.includes("/") || command.includes("\\") ? [] : (env.PATH ?? "").split(windows ? ";" : ":").filter(Boolean);
  for (const directory of paths) {
    for (const candidate of candidates) {
      try {
        const target = directory ? join(directory, candidate) : candidate;
        await access(target, windows ? constants.F_OK : constants.X_OK);
        if ((await stat(target)).isFile()) return true;
      } catch { /* Try the next PATH entry. */ }
    }
  }
  return false;
}

export async function detectRuntimeCapabilities(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
  available: (command: string, env: NodeJS.ProcessEnv, platform: string) => Promise<boolean> = commandAvailable,
): Promise<RuntimeCapabilities> {
  const backend = env.TUBEMASTER_WHISPER_BACKEND ?? "mlx_whisper";
  const whisperBackend = backend === "mlx_whisper" ? "mlx_whisper" : "unsupported";
  const [ytDlp, ffmpeg, whisper] = await Promise.all([
    available("yt-dlp", env, platform),
    available("ffmpeg", env, platform),
    whisperBackend === "mlx_whisper" ? available(env.TUBEMASTER_WHISPER_COMMAND ?? "mlx_whisper", env, platform) : Promise.resolve(false),
  ]);
  return { platform: platform === "darwin" ? "macos" : platform === "win32" ? "windows" : platform === "linux" ? "linux" : "other", ytDlp, ffmpeg, whisper, whisperBackend };
}
