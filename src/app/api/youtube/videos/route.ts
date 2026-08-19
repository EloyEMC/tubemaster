import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createDurableQuotaAccountantFactory,
  type QuotaAccountant,
} from "@/lib/quota/accountant";
import { getAuthenticatedYoutube } from "@/lib/youtube";
import { createVideoMetadataCore } from "@/lib/video-metadata";

const videoMetadataCore = createVideoMetadataCore();

type VideosRouteDeps = {
  getSession: () => Promise<{ user?: { id?: string | null } } | null>;
  getYoutube: typeof getAuthenticatedYoutube;
  createAccountant: (credentials: { credentialRef: { userId: string } }) => QuotaAccountant;
  operationIdFactory: () => string;
  listVideos: typeof videoMetadataCore.listVideos;
};

function accountQuota(
  accountant: QuotaAccountant,
  operationId: string,
): void {
  try {
    accountant.record({ operationId, operation: "channels.list" });
  } catch {
    // Quota accounting must never change the operation result.
  }
}

export function parseRequestUrl(request: Request): URL | null {
  try {
    return new URL(request.url);
  } catch {
    return null;
  }
}

export function createVideosGetHandler(
  deps: VideosRouteDeps = {
    getSession: () => getServerSession(authOptions),
    getYoutube: getAuthenticatedYoutube,
    createAccountant: createDurableQuotaAccountantFactory(),
    operationIdFactory: randomUUID,
    listVideos: videoMetadataCore.listVideos,
  },
) {
  return async function GET(request: Request) {
    const session = await deps.getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = parseRequestUrl(request);
    if (!url) {
      return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
    }

    const { searchParams } = url;
    if (searchParams.get("debug") === "1") {
      const youtube = await deps.getYoutube(session.user.id);
      const operationId = deps.operationIdFactory();
      const accountant = deps.createAccountant({
        credentialRef: { userId: session.user.id },
      });
      accountQuota(accountant, operationId);
      const channels = await youtube.channels.list({
        part: ["snippet", "contentDetails", "statistics"],
        mine: true,
      });
      return NextResponse.json({
        channels: channels.data.items?.map((c) => ({
          id: c.id,
          title: c.snippet?.title,
          videoCount: c.statistics?.videoCount,
          uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads,
        })),
      });
    }

    const listed = await deps.listVideos({
      credentialRef: { userId: session.user.id },
    });

    return NextResponse.json(listed.videos);
  };
}

export const GET = createVideosGetHandler();
