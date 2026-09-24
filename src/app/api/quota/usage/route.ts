import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { summarizeQuotaUsage } from "@/lib/quota/repository";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summaries = await summarizeQuotaUsage({
      scopeType: "user",
      scopeId: userId,
    });

    return NextResponse.json({ summaries });
  } catch {
    return NextResponse.json(
      { error: "Unable to load quota usage" },
      { status: 500 },
    );
  }
}
