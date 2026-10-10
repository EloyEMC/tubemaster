import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), process.env.NEXT_TURBOPACK_ROOT ?? ".");

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
