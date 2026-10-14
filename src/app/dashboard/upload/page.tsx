"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { DashboardUploadForm } from "@/components/dashboard-upload-form";

export default function UploadPage() {
  const { status } = useSession();
  if (status === "loading") return <p role="status">Loading…</p>;
  if (status !== "authenticated") redirect("/");
  return <main><DashboardUploadForm /></main>;
}
