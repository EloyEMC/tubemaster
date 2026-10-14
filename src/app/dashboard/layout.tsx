"use client";

import { useSession } from "next-auth/react";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  // The quota page retains its own unauthorized state; never expose the shell to visitors.
  if (status !== "authenticated") return <>{children}</>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <DashboardHeader />
      <div className="grid gap-6 pt-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
        <aside className="min-w-0 md:border-r md:border-zinc-800 md:pr-5">
          <DashboardSidebar />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
