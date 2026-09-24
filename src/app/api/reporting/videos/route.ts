import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { createVideoMetadataCore } from "@/lib/video-metadata";
import {
  EmptySelectionError,
  exportVideos,
  InvalidExportFormatError,
  parseExportRequest,
  selectVideos,
} from "@/lib/reporting/export";

type ReportingVideosRouteDeps = {
  getSession: () => Promise<{ user?: { id?: string | null } } | null>;
  core: Pick<ReturnType<typeof createVideoMetadataCore>, "listVideos">;
};

export function createReportingVideosGetHandler(
  deps: ReportingVideosRouteDeps = {
    getSession: () => getServerSession(authOptions),
    core: createVideoMetadataCore(),
  }
) {
  return async function GET(request: Request) {
    const session = await deps.getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const exportRequest = parseExportRequest(request);
      const listed = await deps.core.listVideos({
        credentialRef: { userId: session.user.id },
      });
      const selected = selectVideos(listed.videos, exportRequest.videoIds, exportRequest.title);
      const result = exportVideos(selected, exportRequest.format);

      return new Response(result.body, {
        headers: {
          "content-disposition": `attachment; filename="${result.filename}"`,
          "content-type": result.contentType,
        },
      });
    } catch (error) {
      if (error instanceof EmptySelectionError || error instanceof InvalidExportFormatError) {
        return NextResponse.json(
          { error: error.code, message: error.message },
          { status: 422 }
        );
      }

      throw error;
    }
  };
}

export const GET = createReportingVideosGetHandler();
