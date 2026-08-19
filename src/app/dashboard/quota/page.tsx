"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type QuotaSummary = {
  bucketStart: string;
  operation: string;
  operationCount: number;
  estimatedUnits: number;
};

type QuotaResponse = {
  summaries?: QuotaSummary[];
  error?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");

function formatBucketStart(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function QuotaPage() {
  const [summaries, setSummaries] = useState<QuotaSummary[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unauthorized"
  >("loading");

  useEffect(() => {
    let active = true;

    async function loadQuota() {
      try {
        const response = await fetch("/api/quota/usage");
        if (!active) return;

        if (response.status === 401) {
          setStatus("unauthorized");
          return;
        }
        if (!response.ok) {
          setStatus("error");
          return;
        }

        const data = (await response.json()) as QuotaResponse;
        setSummaries(data.summaries ?? []);
        setStatus("ready");
      } catch {
        if (active) setStatus("error");
      }
    }

    void loadQuota();
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(
    () =>
      summaries.reduce(
        (result, summary) => ({
          estimatedUnits: result.estimatedUnits + summary.estimatedUnits,
          operationCount: result.operationCount + summary.operationCount,
        }),
        { estimatedUnits: 0, operationCount: 0 },
      ),
    [summaries],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quota usage</h1>
          <p className="text-sm text-zinc-400">
            Track your estimated YouTube API usage.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
        >
          Dashboard
        </Link>
      </div>

      {status === "loading" && (
        <p className="text-zinc-500">Loading quota usage...</p>
      )}

      {status === "unauthorized" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="font-semibold">Sign in required</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in to view your quota usage.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-6">
          <h2 className="font-semibold text-red-200">
            Unable to load quota usage
          </h2>
          <p className="mt-2 text-sm text-red-300">Please try again later.</p>
        </div>
      )}

      {status === "ready" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-sm text-zinc-400">Total estimated units</p>
              <p className="mt-2 text-3xl font-bold">
                {numberFormatter.format(totals.estimatedUnits)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <p className="text-sm text-zinc-400">Operation count</p>
              <p className="mt-2 text-3xl font-bold">
                {numberFormatter.format(totals.operationCount)}
              </p>
            </div>
          </div>

          {summaries.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-zinc-400">
              No quota usage has been recorded yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Day</th>
                    <th className="px-4 py-3 font-medium">Operation</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Operations
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Estimated units
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {summaries.map((summary) => (
                    <tr key={`${summary.bucketStart}-${summary.operation}`}>
                      <td className="px-4 py-3 text-zinc-300">
                        {formatBucketStart(summary.bucketStart)}
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {summary.operation}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-400">
                        {numberFormatter.format(summary.operationCount)}
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {numberFormatter.format(summary.estimatedUnits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-zinc-500">
            Estimates are based on recorded operations and may differ from
            Google&apos;s final quota accounting.
          </p>
        </div>
      )}
    </div>
  );
}
