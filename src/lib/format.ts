const dateFormat = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(ms: number): string {
  return dateFormat.format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return `${dateFormat.format(new Date(ms))} at ${timeFormat.format(new Date(ms))}`;
}

/** "940 KB", "1.2 MB", "3 KB" — the sizes the design shows. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
