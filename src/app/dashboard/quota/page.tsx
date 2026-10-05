"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  formatBucket,
  formatChannelId,
  isQuotaSummary,
  type QuotaSummary,
} from "./format";

type UsageState =
  | { kind: "loading" }
  | { kind: "ready"; summaries: QuotaSummary[] }
  | { kind: "unauthorized" }
  | { kind: "error" };

export default function QuotaPage() {
  const { status } = useSession();
  const [usage, setUsage] = useState<UsageState>({ kind: "loading" });

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/quota/usage", { signal: controller.signal });
        if (response.status === 401) {
          setUsage({ kind: "unauthorized" });
          return;
        }
        if (!response.ok) throw new Error("Quota request failed");
        const payload: unknown = await response.json();
        if (typeof payload !== "object" || payload === null ||
          !("summaries" in payload) || !Array.isArray(payload.summaries) ||
          !payload.summaries.every(isQuotaSummary)) {
          throw new Error("Invalid quota response");
        }
        setUsage({ kind: "ready", summaries: payload.summaries });
      } catch {
        if (!controller.signal.aborted) setUsage({ kind: "error" });
      }
    }
    void load();
    return () => controller.abort();
  }, [status]);

  const unauthorized = status === "unauthenticated" || usage.kind === "unauthorized";
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-zinc-200">← Dashboard</Link>
      <h1 className="mt-6 text-2xl font-bold">Quota usage</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Estimated YouTube API units recorded by TubeMaster. These estimates are not authoritative Google quota usage or remaining quota.
      </p>
      <div className="mt-8" aria-live="polite">
        {unauthorized ? (
          <p>Sign in to view your quota usage.</p>
        ) : status === "loading" || usage.kind === "loading" ? (
          <p>Loading quota usage...</p>
        ) : usage.kind === "error" ? (
          <p>Unable to load quota usage. Please try again later.</p>
        ) : usage.summaries.length === 0 ? (
          <p>No quota usage recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900 text-zinc-400"><tr>
                <th scope="col" className="p-3">Bucket date</th>
                <th scope="col" className="p-3">Operation</th>
                <th scope="col" className="p-3">Channel</th>
                <th scope="col" className="p-3 text-right">Count</th>
                <th scope="col" className="p-3 text-right">Estimated units</th>
              </tr></thead>
              <tbody>{usage.summaries.map((row, index) => (
                <tr key={`${row.bucketStart}-${row.operation}-${row.channelId ?? "unassigned"}-${index}`} className="border-t border-zinc-800">
                  <td className="p-3">{formatBucket(row.bucketStart)}</td>
                  <td className="p-3">{row.operation}</td>
                  <td className="p-3 font-mono text-xs text-zinc-400">{formatChannelId(row.channelId)}</td>
                  <td className="p-3 text-right">{row.operationCount.toLocaleString()}</td>
                  <td className="p-3 text-right">{row.estimatedUnits.toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
