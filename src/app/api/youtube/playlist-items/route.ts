import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createPlaylistManagementCore } from "@/lib/playlist-management";

type Deps = {
  getSession: () => Promise<{ user?: { id?: string | null } } | null>;
  core: Pick<ReturnType<typeof createPlaylistManagementCore>, "listPlaylistItems">;
};

export function createPlaylistItemsGetHandler(deps: Deps = {
  getSession: () => getServerSession(authOptions),
  core: createPlaylistManagementCore(),
}) {
  return async function GET(request: Request) {
    const session = await deps.getSession();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const playlistId = new URL(request.url).searchParams.get("playlistId")?.trim();
    if (!playlistId) return NextResponse.json({ error: "Missing playlistId" }, { status: 400 });
    const result = await deps.core.listPlaylistItems({
      credentialRef: { userId: session.user.id }, playlistId,
    });
    return NextResponse.json(result.items);
  };
}

export const GET = createPlaylistItemsGetHandler();
