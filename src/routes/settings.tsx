import { useDraft } from "@/lib/drafts";
import { useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, READING_FRAME, READING_WIDTH } from "@/components/app/page-header";
import { setTheme, useTheme, type Theme } from "@/lib/theme";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/app/bits";
import { Check, RefreshCw } from "lucide-react";
import { formatSince } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { SubscribeSections } from "@/components/calendar/subscribe";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const status = useQuery(api.credentials.status);
  const connect = useAction(api.credentials.connect);
  const requestSync = useMutation(api.sync.requestSync);
  const disconnect = useMutation(api.credentials.disconnect);

  const [token, setToken] = useDraft("canvas:token", "");
  const [instance, setInstance] = useDraft("canvas:instance", "canvas.wisc.edu");
  const [busy, setBusy] = useDraft("canvas:connecting", false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await connect({ token, instance });
      setToken("");
    } catch (err) {
      setError(
        err instanceof Error
          ? "Canvas rejected the token. Check the value and try again."
          : String(err),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Header and body share one left-aligned reading column, so their edges line up. */}
      <PageHeader
        title="Settings"
        subtitle="Appearance, calendar feed and your Canvas connection"
        contentClassName={READING_WIDTH}
      />
      <div className={cn(READING_FRAME, "flex w-full flex-col gap-8 px-4 pt-6 pb-16 md:gap-10 md:px-6 md:pt-8")}>
        <SettingsSection title="Appearance" description="How wiscourse looks in this browser.">
          <Card>
            <Row label="Theme" description="System follows your device's light or dark setting.">
              <ThemePicker />
            </Row>
          </Card>
        </SettingsSection>

        <SettingsSection
          title="Calendar"
          description="Subscribe to your classes, due dates and plans from any calendar app."
        >
          <Card>
            {/* The same sheet the calendar's Subscribe button opens. */}
            <SubscribeSections />
          </Card>
        </SettingsSection>

        <SettingsSection
          title="Canvas"
          description="wiscourse syncs your courses from Canvas with your own access token."
        >
          <Card>
            {status === undefined ? (
              <div className="px-4 md:px-5 py-4 text-[13px] text-ink-3">Loading…</div>
            ) : status === null || !status.connected ? (
              <form onSubmit={handleConnect}>
                <div className="border-b border-line px-4 md:px-5 py-4 text-[13px] leading-[1.55] text-ink-2">
                  Paste your own Canvas access token. UW–Madison students request one at kb.wisc.edu (search
                  "Canvas access token"). Connect only a token that belongs to you — the Canvas API policy does
                  not allow the use of another person's token.
                </div>
                <Row label="Canvas instance" htmlFor="canvas-instance">
                  <Input
                    id="canvas-instance"
                    value={instance}
                    onChange={(event) => setInstance(event.target.value)}
                    placeholder="canvas.wisc.edu"
                    aria-label="Canvas instance"
                    className={FIELD}
                  />
                </Row>
                <Row label="Access token" htmlFor="canvas-token">
                  <Input
                    id="canvas-token"
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="Canvas access token"
                    aria-label="Canvas access token"
                    className={FIELD}
                  />
                </Row>
                <div className="flex items-center gap-3 bg-sunken px-4 md:px-5 py-3">
                  {error && <p className="text-[12.5px] text-red">{error}</p>}
                  <Button type="submit" size="sm" className="ml-auto text-[13px]" disabled={busy || token.trim().length === 0}>
                    {busy ? "Verifying…" : "Connect"}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-line px-4 md:px-5 py-4 last:border-b-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-chip text-[12.5px] font-semibold text-ink-2">
                    {initials(status.canvasUserName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">{status.canvasUserName ?? "Canvas account"}</div>
                    <div className="truncate text-[12.5px] text-ink-3">{status.instance}</div>
                  </div>
                  {status.credentialStatus === "active" ? (
                    <Pill>
                      <Check />
                      Connected
                    </Pill>
                  ) : (
                    <Pill tone="red">Token invalid</Pill>
                  )}
                </div>

                {status.credentialStatus !== "active" && (
                  <div className="border-b border-line bg-red-bg px-4 md:px-5 py-3 text-[12.5px] leading-[1.5] text-red">
                    Canvas rejected the stored token (UW-issued tokens expire after at most 90 days). Disconnect
                    and connect a new one.
                  </div>
                )}

                <Row label="Sync" description={<SyncDetail sync={status.sync} />}>
                  <Button size="sm" variant="outline" className="text-[13px]" onClick={() => requestSync()}>
                    <RefreshCw className={cn("size-[13px]", status.sync?.status === "syncing" && "animate-spin")} />
                    Sync now
                  </Button>
                </Row>

                <Row label="Disconnect" description="Removes your stored token and stops syncing.">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[13px] text-ink-2 hover:bg-red-bg hover:text-red"
                    onClick={() => disconnect()}
                  >
                    Disconnect
                  </Button>
                </Row>
              </>
            )}
          </Card>
        </SettingsSection>

        <a
          href="/privacy.html"
          className="w-fit rounded text-[12.5px] text-ink-3 underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink-3"
        >
          Privacy policy
        </a>
      </div>
    </div>
  );
}

const FIELD = "h-8 w-full text-[13px] shadow-none md:w-[280px]";

type SyncInfo = NonNullable<Extract<NonNullable<ReturnType<typeof useQuery<typeof api.credentials.status>>>, { connected: true }>["sync"]>;

function SyncDetail({ sync }: { sync: SyncInfo | null }) {
  const now = useNow();
  if (sync === null) return <>Waiting for the first sync.</>;
  const last = Math.max(sync.lastDeltaSyncAt ?? 0, sync.lastFullSyncAt ?? 0);
  return (
    <>
      <span className={cn(sync.status === "error" && "text-red")}>
        {sync.status === "syncing"
          ? "Syncing now…"
          : sync.status === "error"
            ? "Last sync failed."
            : last > 0
              ? `Last synced ${formatSince(last, now)}.`
              : "Waiting for the first sync."}
      </span>
      {sync.lastFullSyncAt !== undefined && <> Full sync {formatDateTime(sync.lastFullSyncAt)}.</>}
      {sync.status === "error" && sync.lastError && <span className="mt-1 block text-red">{sync.lastError}</span>}
    </>
  );
}

function initials(name: string | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[15px] font-semibold tracking-[-0.012em] text-ink">{title}</h2>
      <p className="mt-1 mb-3 text-[13px] text-ink-3">{description}</p>
      {children}
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,17,20,0.04)]">
      {children}
    </div>
  );
}

/** One setting: label and description on the left, its control on the right. */
function Row({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: ReactNode;
  /** Set for text fields: they drop below the label on narrow screens. */
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 border-b border-line px-4 py-4 last:border-b-0 md:gap-6 md:px-5",
        htmlFor !== undefined && "max-md:flex-col max-md:items-stretch max-md:gap-2",
      )}
    >
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[13.5px] font-medium text-ink">
          {label}
        </label>
        {description && <div className="mt-[2px] text-[12.5px] leading-[1.5] text-ink-3">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ThemePicker() {
  const theme = useTheme();
  const options: { id: Theme; label: string }[] = [
    { id: "system", label: "System" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];
  return (
    <div role="group" aria-label="Theme" className="flex h-8 w-fit items-center rounded-lg bg-chip p-[2px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setTheme(o.id)}
          aria-pressed={theme === o.id}
          className={cn(
            "h-full rounded-[6px] px-3 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-line-2 focus-visible:outline-none",
            theme === o.id && "bg-surface text-ink shadow-[0_1px_2px_rgba(16,17,20,0.06),inset_0_0_0_1px_var(--line)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
