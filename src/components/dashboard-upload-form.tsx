"use client";

import { useEffect, useRef, useState } from "react";

export type UploadFields = { stagingFile: string; title: string; description: string; expectedChannelId: string };
type UploadReply = { status?: string; error?: string; outcome?: string; operationId?: string; videoId?: string; channelId?: string };
export const emptyUploadFields: UploadFields = { stagingFile: "", title: "", description: "", expectedChannelId: "" };

export function validateUpload(fields: UploadFields): Partial<Record<keyof UploadFields, string>> {
  const errors: Partial<Record<keyof UploadFields, string>> = {};
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(fields.stagingFile) || !/\.(mp4|mov|webm|mkv)$/i.test(fields.stagingFile)) errors.stagingFile = "Choose and stage a supported video (mp4, mov, webm or mkv).";
  if (!fields.title.trim() || fields.title.trim().length > 100) errors.title = "Enter a title of 1–100 characters.";
  if (fields.description.length > 5000) errors.description = "Description must be at most 5000 characters.";
  if (!fields.expectedChannelId.trim()) errors.expectedChannelId = "An active channel is required.";
  return errors;
}

export function uploadPayload(fields: UploadFields, dryRun: boolean) {
  return { stagingFile: fields.stagingFile, title: fields.title.trim(), description: fields.description, expectedChannelId: fields.expectedChannelId, dryRun, confirmed: !dryRun };
}

export function uploadMessage(reply: UploadReply, dryRun: boolean): string {
  if (reply.outcome === "unknown") return `Upload outcome is uncertain${reply.operationId ? ` (operation ID: ${reply.operationId})` : ""}. Check your YouTube channel before attempting another upload. Do not retry automatically.`;
  if (reply.error) return reply.error === "WRITE_CHANNEL_MISMATCH" ? "Channel changed. Preview again with the active channel before uploading." : reply.error === "unauthorized" ? "Session expired. Sign in again before uploading." : reply.error === "validation_failed" ? "Request rejected. Check the selected video and fields, then preview again." : `Upload could not be completed (${reply.error}). Check your channel before retrying if the request may have reached YouTube.`;
  if (dryRun && reply.status === "validated") return `Preview validated for channel ${reply.channelId ?? "selected"}. No video was uploaded. Confirm below to upload privately.`;
  if (!dryRun && reply.status === "uploaded") return `Private upload complete. Video ID: ${reply.videoId ?? "unavailable"}. Operation ID: ${reply.operationId ?? "unavailable"}.`;
  return "Unexpected response. Check your YouTube channel before attempting another upload; do not retry automatically.";
}

export function stagingFailureMessage(status: number): string {
  if (status === 401) return "Session expired. Sign in again before staging.";
  if (status === 400) return "Video could not be staged. Check its extension and size, then try again.";
  return "Video staging is unavailable. Try again later.";
}

export function DashboardUploadForm() {
  const [fields, setFields] = useState<UploadFields>(emptyUploadFields);
  const [channel, setChannel] = useState<{ id: string; title: string } | null>(null);
  const [channelStatus, setChannelStatus] = useState("Loading active channel…");
  const [errors, setErrors] = useState<Partial<Record<keyof UploadFields, string>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const inFlight = useRef(false);
  const fieldRefs = useRef<Partial<Record<keyof UploadFields, HTMLInputElement | HTMLTextAreaElement | null>>>({});

  useEffect(() => {
    let live = true;
    void fetch("/api/youtube/channel-info").then(async (res) => {
      if (!res.ok) throw new Error("channel unavailable");
      return res.json() as Promise<{ channel: { id: string; title: string } | null }>;
    }).then((data) => {
      if (!live) return;
      if (!data.channel?.id) { setChannelStatus("No active channel found. Switch channel to continue."); return; }
      setChannel(data.channel);
      setFields((current) => ({ ...current, expectedChannelId: data.channel!.id }));
      setChannelStatus("");
    }).catch(() => { if (live) setChannelStatus("Unable to load active channel. Refresh or switch channel to continue."); });
    return () => { live = false; };
  }, []);

  function update(key: keyof UploadFields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setMessage("");
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function selectFile(file: File | null) {
    if (inFlight.current) return;
    setSelectedFile(file);
    setStagedFile(null);
    setFields((current) => ({ ...current, stagingFile: "" }));
    setPreview(null);
    setMessage(file ? `Selected ${file.name}. Stage and preview to continue.` : "Choose a video to continue.");
    setErrors((current) => ({ ...current, stagingFile: undefined }));
  }

  async function submit(dryRun: boolean) {
    if (inFlight.current || finished || (!dryRun && !preview)) return;
    const nextErrors = validateUpload(fields);
    if (dryRun && selectedFile && !stagedFile) delete nextErrors.stagingFile;
    if (!selectedFile) nextErrors.stagingFile = "Choose a video file first.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage("Correct the highlighted fields before continuing.");
      const firstInvalid = (["stagingFile", "title", "description", "expectedChannelId"] as const).find((key) => nextErrors[key]);
      if (firstInvalid) fieldRefs.current[firstInvalid]?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setMessage(dryRun ? "Validating preview…" : "Uploading privately…");
    try {
      let submitted = fields;
      if (dryRun && selectedFile && stagedFile !== selectedFile) {
        setMessage(`Staging ${selectedFile.name}…`);
        const form = new FormData();
        form.set("file", selectedFile);
        const stageResponse = await fetch("/api/youtube/upload/stage", { method: "POST", body: form });
        if (!stageResponse.ok) {
          setMessage(stagingFailureMessage(stageResponse.status));
          return;
        }
        const staged = await stageResponse.json() as { stagingFile?: string };
        if (!staged.stagingFile || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}\.(mp4|mov|webm|mkv)$/i.test(staged.stagingFile)) {
          setMessage("Invalid staging response. Select the video again.");
          return;
        }
        submitted = { ...fields, stagingFile: staged.stagingFile };
        setFields(submitted);
        setStagedFile(selectedFile);
        setMessage("Video staged. Validating preview…");
      }
      const response = await fetch("/api/youtube/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(uploadPayload(submitted, dryRun)) });
      const reply = await response.json() as UploadReply;
      setMessage(uploadMessage(reply, dryRun));
      if (response.ok && dryRun && reply.status === "validated" && reply.channelId === submitted.expectedChannelId) setPreview(JSON.stringify(submitted));
      else setPreview(null);
      if (response.ok && !dryRun && reply.status === "uploaded") setFinished(true);
    } catch {
      setPreview(null);
      setMessage("Request outcome is uncertain. Check your YouTube channel before trying again; do not retry automatically. If you received an operation ID, keep it for support.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  const inputClass = "w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  return (
    <section className="space-y-5">
      <div><h1 className="text-2xl font-bold">Upload a private Short</h1><p className="mt-2 text-sm text-zinc-400">Only private uploads are supported. This does not schedule or publish videos publicly. Choose a video from your device. It is staged securely before preview; no video is uploaded to YouTube until you confirm.</p></div>
      <p className="text-sm">Active channel: <strong role="status" aria-live="polite">{channel ? `${channel.title} (${channel.id})` : channelStatus}</strong></p>
      <form onSubmit={(event) => { event.preventDefault(); void submit(true); }} className="space-y-4" noValidate>
        {(["stagingFile", "title", "description", "expectedChannelId"] as const).map((key) => (
          <div key={key} className="space-y-1">
            <label htmlFor={`upload-${key}`} className="block text-sm font-medium">{{ stagingFile: "Video file", title: "Title", description: "Description", expectedChannelId: "Expected channel ID" }[key]}</label>
            {key === "stagingFile" ? <input id={`upload-${key}`} type="file" accept=".mp4,.mov,.webm,.mkv" ref={(node) => { fieldRefs.current[key] = node; }} onChange={(event) => selectFile(event.target.files?.[0] ?? null)} disabled={busy || finished} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} className={inputClass} /> : key === "description" ? <textarea id={`upload-${key}`} ref={(node) => { fieldRefs.current[key] = node; }} value={fields[key]} onChange={(event) => update(key, event.target.value)} maxLength={5001} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} className={inputClass} rows={4} /> : <input id={`upload-${key}`} ref={(node) => { fieldRefs.current[key] = node; }} value={fields[key]} onChange={(event) => update(key, event.target.value)} readOnly={key === "expectedChannelId"} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `error-${key}` : undefined} className={inputClass} />}
            {key === "stagingFile" && selectedFile && <p className="text-sm text-zinc-300">Selected: {selectedFile.name}{stagedFile === selectedFile ? " — staged" : " — awaiting staging"}</p>}
            {errors[key] && <p id={`error-${key}`} className="text-sm text-red-300">{errors[key]}</p>}
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={busy || !channel || finished} className="rounded-lg border border-zinc-600 px-4 py-2 font-medium hover:bg-zinc-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Preview (dry run)</button>
          <button type="button" disabled={busy || !preview || preview !== JSON.stringify(fields) || finished} onClick={() => void submit(false)} className="rounded-lg bg-white px-4 py-2 font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Confirm private upload</button>
        </div>
      </form>
      <p role="status" aria-live="polite" className="text-sm text-zinc-300">{message}</p>
    </section>
  );
}
