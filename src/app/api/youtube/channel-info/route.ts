import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createDurableQuotaAccountantFactory,
  type QuotaAccountant,
} from "@/lib/quota/accountant";
import { getAuthenticatedYoutube } from "@/lib/youtube";

type ChannelInfoRouteDeps = {
  getSession: () => Promise<{ user?: { id?: string | null } } | null>;
  getYoutube: typeof getAuthenticatedYoutube;
  createAccountant: (credentials: { credentialRef: { userId: string } }) => QuotaAccountant;
  operationIdFactory: () => string;
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

export function createChannelInfoGetHandler(
  deps: ChannelInfoRouteDeps = {
    getSession: () => getServerSession(authOptions),
    getYoutube: getAuthenticatedYoutube,
    createAccountant: createDurableQuotaAccountantFactory(),
    operationIdFactory: randomUUID,
  },
) {
  return async function GET() {
    const session = await deps.getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const youtube = await deps.getYoutube(session.user.id);
    const operationId = deps.operationIdFactory();
    const accountant = deps.createAccountant({
      credentialRef: { userId: session.user.id },
    });
    accountQuota(accountant, operationId);
    const res = await youtube.channels.list({
      part: ["snippet", "statistics"],
      mine: true,
    });

    const channel = res.data.items?.[0];
    if (!channel) {
      return NextResponse.json({ channel: null });
    }

    return NextResponse.json({
      channel: {
        id: channel.id,
        title: channel.snippet?.title,
        thumbnail: channel.snippet?.thumbnails?.default?.url,
        videoCount: channel.statistics?.videoCount,
      },
    });
  };
}

export const GET = createChannelInfoGetHandler();
