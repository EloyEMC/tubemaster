import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createPlaylistManagementCore } from "@/lib/playlist-management";
import { DomainError } from "@/lib/video-metadata/contracts";
import { getVideoMetadataErrorStatus } from "@/app/api/video-metadata/error-status";

type CreatePlaylistRouteDeps = {
  getSession: () => Promise<{ user?: { id?: string | null } } | null>;
  core: Pick<ReturnType<typeof createPlaylistManagementCore>, "createPlaylist">;
};

export function createCreatePlaylistPostHandler(
  deps: CreatePlaylistRouteDeps = {
    getSession: () => getServerSession(authOptions),
    core: createPlaylistManagementCore(),
  },
) {
  return async function POST(request: Request) {
    const session = await deps.getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { confirmed, title, description, privacyStatus, expectedChannelId } =
      await request.json();
    if (confirmed !== true) {
      return NextResponse.json(
        { error: "Confirmation required" },
        { status: 400 },
      );
    }

    const trimmedExpectedChannelId =
      typeof expectedChannelId === "string" ? expectedChannelId.trim() : "";
    if (!trimmedExpectedChannelId) {
      return NextResponse.json(
        { error: "Expected channel ID is required" },
        { status: 400 },
      );
    }

    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    try {
      const result = await deps.core.createPlaylist({
        credentialRef: { userId: session.user.id },
        title: title.trim(),
        description,
        privacyStatus,
        expectedChannelId,
      });

      return NextResponse.json(result.playlist, { status: 201 });
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

export const POST = createCreatePlaylistPostHandler();
