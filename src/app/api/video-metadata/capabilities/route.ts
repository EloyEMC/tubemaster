import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { detectRuntimeCapabilities } from "@/lib/video-metadata/runtime-capabilities";

export function createCapabilitiesGetHandler(deps = {
  getSession: () => getServerSession(authOptions),
  detect: detectRuntimeCapabilities,
}) {
  return async function GET() {
    const session = await deps.getSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    try {
      const capabilities = await deps.detect();
      return NextResponse.json(capabilities, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "Capability check unavailable" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  };
}

export const GET = createCapabilitiesGetHandler();
