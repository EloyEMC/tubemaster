import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createPlaylistManagementCore } from "@/lib/playlist-management";
import { DomainError } from "@/lib/video-metadata/contracts";
import { getVideoMetadataErrorStatus } from "@/app/api/video-metadata/error-status";

type RemoveFromPlaylistRouteDeps = {
  getSession: () => Promise<{ user?: { id?: string | null } } | null>;
  core: Pick<
    ReturnType<typeof createPlaylistManagementCore>,
    "removeVideosFromPlaylist"
  >;
};

export function createRemoveFromPlaylistPostHandler(
  deps: RemoveFromPlaylistRouteDeps = {
    getSession: () => getServerSession(authOptions),
    core: createPlaylistManagementCore(),
  },
) {
  return async function POST(request: Request) {
    const session = await deps.getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { confirmed, videoIds, playlistId, expectedChannelId } =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as {
            confirmed?: unknown;
            videoIds?: unknown;
            playlistId?: unknown;
            expectedChannelId?: unknown;
          })
        : {};
    if (confirmed !== true) {
      return NextResponse.json(
        { error: "Confirmation required" },
        { status: 400 },
      );
    }

    if (videoIds === undefined || playlistId === undefined) {
      return NextResponse.json(
        { error: "Missing videoIds or playlistId" },
        { status: 400 },
      );
    }

    if (
      !Array.isArray(videoIds) ||
      videoIds.length === 0 ||
      videoIds.some(
        (videoId) => typeof videoId !== "string" || videoId.trim().length === 0,
      )
    ) {
      return NextResponse.json({ error: "Invalid videoIds" }, { status: 400 });
    }

    if (typeof playlistId !== "string" || playlistId.trim().length === 0) {
      return NextResponse.json(
        { error: "Invalid playlistId" },
        { status: 400 },
      );
    }

    if (expectedChannelId === undefined) {
      return NextResponse.json(
        { error: "Missing expectedChannelId" },
        { status: 400 },
      );
    }

    if (
      typeof expectedChannelId !== "string" ||
      expectedChannelId.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Invalid expectedChannelId" },
        { status: 400 },
      );
    }

    try {
      const result = await deps.core.removeVideosFromPlaylist({
        credentialRef: { userId: session.user.id },
        videoIds,
        playlistId,
        expectedChannelId,
      });

      return NextResponse.json({ removed: result.removed });
    } catch (error) {
      if (error instanceof DomainError) {
        return NextResponse.json(
          {
            error: error.code,
            message: error.message,
            details: error.details,
          },
          { status: getVideoMetadataErrorStatus(error.code) },
        );
      }

      return NextResponse.json(
        { error: "internal_error", message: "Internal server error" },
        { status: 500 },
      );
    }
  };
}

export const POST = createRemoveFromPlaylistPostHandler();
