const quotaDateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatQuotaBucketStart(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : quotaDateFormatter.format(date);
}
