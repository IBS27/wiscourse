import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";
import { setTheme, useTheme, type Theme } from "@/lib/theme";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const status = useQuery(api.credentials.status);
  const connect = useAction(api.credentials.connect);
  const requestSync = useMutation(api.sync.requestSync);
  const disconnect = useMutation(api.credentials.disconnect);

  const [token, setToken] = useState("");
  const [instance, setInstance] = useState("canvas.wisc.edu");
  const [busy, setBusy] = useState(false);
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
      <PageHeader title="Settings" />
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemePicker />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canvas connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : status === null || !status.connected ? (
            <form onSubmit={handleConnect} className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Paste your own Canvas access token. UW–Madison students
                request one at kb.wisc.edu (search "Canvas access token").
                Connect only a token that belongs to you — the Canvas API
                policy does not allow the use of another person's token.
              </p>
              <div className="space-y-2">
                <Input
                  value={instance}
                  onChange={(event) => setInstance(event.target.value)}
                  placeholder="canvas.wisc.edu"
                  aria-label="Canvas instance"
                />
                <Input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="Canvas access token"
                  aria-label="Canvas access token"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy || token.trim().length === 0}>
                {busy ? "Verifying…" : "Connect"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{status.canvasUserName}</p>
                  <p className="text-sm text-muted-foreground">
                    {status.instance}
                  </p>
                </div>
                <Badge
                  variant={
                    status.credentialStatus === "active"
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {status.credentialStatus === "active"
                    ? "Connected"
                    : "Token invalid"}
                </Badge>
              </div>

              {status.credentialStatus !== "active" && (
                <p className="text-sm text-destructive">
                  Canvas rejected the stored token (UW-issued tokens expire
                  after at most 120 days). Disconnect and connect a new one.
                </p>
              )}

              <Separator />

              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Sync status:{" "}
                  <span className="font-medium text-foreground">
                    {status.sync?.status ?? "unknown"}
                  </span>
                </p>
                {status.sync?.lastFullSyncAt !== undefined && (
                  <p>
                    Last full sync:{" "}
                    {formatDateTime(status.sync.lastFullSyncAt)}
                  </p>
                )}
                {status.sync?.lastDeltaSyncAt !== undefined && (
                  <p>
                    Last delta sync:{" "}
                    {formatDateTime(status.sync.lastDeltaSyncAt)}
                  </p>
                )}
                {status.sync?.lastError && (
                  <p className="text-destructive">{status.sync.lastError}</p>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={() => requestSync()}>Sync now</Button>
                <Button variant="outline" onClick={() => disconnect()}>
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <a href="/privacy.html" className="block text-sm text-ink-3 underline underline-offset-4">
        Privacy policy
      </a>
      </div>
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
    <div className="flex h-8 w-fit items-center rounded-lg bg-chip p-[2px]">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setTheme(o.id)}
          className={
            "h-full rounded-[6px] px-3 text-xs font-medium text-ink-2" +
            (theme === o.id ? " bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
