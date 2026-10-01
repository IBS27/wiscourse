/* eslint-disable react-refresh/only-export-components -- standalone preview entrypoint */
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import { useQuery, refresh } from "./convex-react";
import { TodoDetail } from "@/components/todo/todo-detail";
import { DraftContext, DraftStore } from "@/lib/drafts";
import type { Control } from "./backend";
import type { Fault, LoggedRequest, Operation } from "../helpers/mock-canvas";
import "./style.css";

const ASSIGNMENTS = [
  [8101, "Text only"],
  [8102, "URL only"],
  [8103, "Files (pdf, docx)"],
  [8104, "Text, URL or files"],
  [8105, "Already submitted"],
  [8106, "Past due"],
  [8107, "Closed"],
  [8108, "Canvas-only type"],
] as const;

type Scenario = { label: string; detail: string; faults: Array<{ operation: Operation; fault: Fault; times?: number }>; lag?: number };
const SCENARIOS: Scenario[] = [
  { label: "Canvas accepts", detail: "Check, send, confirmed.", faults: [] },
  { label: "Rate limited twice", detail: "403 Rate Limit Exceeded on the send, twice; retries at 30 s, then 2 min.", faults: [{ operation: "post", fault: "rateLimit", times: 2 }] },
  { label: "Canvas down", detail: "503 on every check: four tries, then failed (nothing was sent).", faults: [{ operation: "check", fault: "serverError", times: 4 }] },
  { label: "Reply lost, Canvas saved it", detail: "Canvas records the attempt but the reply never comes. The next try checks and finds it; no second send.", faults: [{ operation: "post", fault: "acceptThenTimeout" }] },
  { label: "Send lost, Canvas never saw it", detail: "The send times out without reaching Canvas. Three checks find nothing; it ends 'Not confirmed yet' and never resends on its own. 'Send again…' asks first.", faults: [{ operation: "post", fault: "timeout" }] },
  { label: "Reply lost, Canvas slow to show it", detail: "Canvas saves it but hides it from the next 4 checks: three automatic checks, then 'Not confirmed yet'. 'Check Canvas again' twice finds it; one Canvas attempt.", faults: [{ operation: "post", fault: "acceptThenTimeout" }], lag: 4 },
  { label: "Ambiguous, Canvas unreachable", detail: "Reply lost after Canvas saved it, then three failed checks: ends 'Not confirmed yet'. Use 'Check Canvas again'.", faults: [{ operation: "check", fault: "ok" }, { operation: "post", fault: "acceptThenTimeout" }, { operation: "check", fault: "serverError", times: 3 }] },
  { label: "Canvas refuses", detail: "400 on the send: failed at once, no retry.", faults: [{ operation: "post", fault: "reject" }] },
  { label: "Token revoked", detail: "401 on the first check: credential marked invalid, failed with reconnect, no retry.", faults: [{ operation: "check", fault: "unauthenticated" }] },
  { label: "Worker dies mid-send", detail: "Canvas saves it and the delivery job hangs. Press 'Expire lease' (the 11-minute watchdog) to recover with a check.", faults: [{ operation: "post", fault: "acceptThenStall" }] },
  { label: "Upload fails once", detail: "503 from the upload host on the first file; the retry uploads again.", faults: [{ operation: "upload", fault: "serverError" }] },
];

async function control(command: Control) {
  await fetch("/__mock/control", { method: "POST", body: JSON.stringify(command) });
  void refresh();
}

type MockState = {
  credential: string;
  pendingFaults: string[];
  log: LoggedRequest[];
  attempts: Array<{ canvasId: number; name: string; attempts: Array<{ attempt: number; type: string; at: string }> }>;
  outbox: Array<{ id: string; assignmentCanvasId: number; status: string; step?: string; attempt: number; attemptsLeft: number; nextAttemptAt?: number; mayHavePosted: boolean; checkOnly: boolean; errorKind?: string; dismissed: boolean }>;
};

function useMockState() {
  const [state, setState] = useState<MockState | null>(null);
  useEffect(() => {
    const load = () => void fetch("/__mock/state").then((r) => r.json() as Promise<MockState>).then(setState);
    load();
    const timer = setInterval(load, 700);
    return () => clearInterval(timer);
  }, []);
  return state;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line p-3">
      <h2 className="eyebrow mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Controls() {
  const state = useMockState();
  const [delay, setDelay] = useState(0);
  const button = "rounded-md border border-line-2 bg-surface px-2 py-1 text-left text-[12px] hover:bg-hover";
  return (
    <aside className="h-screen w-[360px] shrink-0 overflow-y-auto border-r border-line bg-sunken text-[12px]" aria-label="Mock controls">
      <div className="border-b border-line p-3">
        <strong className="text-[13px]">Submission preview: mock only</strong>
        <p className="mt-1 text-ink-3">Real UI and Convex functions, a fake Canvas at canvas.mock.invalid. No account, token or real Canvas is involved.</p>
      </div>
      <Section title="Next Canvas behaviour">
        <div className="flex flex-col gap-1">
          {SCENARIOS.map((s) => (
            <button key={s.label} className={button} title={s.detail} onClick={() => void control({ action: "clearFaults" })
              .then(() => control({ action: "visibilityLag", checks: s.lag ?? 0 }))
              .then(() => control({ action: "fault", faults: s.faults }))}>
              <span className="font-medium">{s.label}</span>
              <span className="block text-ink-3">{s.detail}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 text-ink-3">Queued faults: {state?.pendingFaults.join(", ") || "none"}</div>
      </Section>
      <Section title="Controls">
        <div className="flex flex-wrap gap-1">
          <button className={button} onClick={() => void control({ action: "expireLease" })}>Expire lease (watchdog)</button>
          <button className={button} onClick={() => void control({ action: "releaseStalls" })}>Release stalled request</button>
          <button className={button} onClick={() => { const ms = delay ? 0 : 2500; setDelay(ms); void control({ action: "delay", ms }); }}>{delay ? "Normal speed" : "Slow Canvas (2.5 s/request)"}</button>
          <button className={button} onClick={() => void control({ action: "credential", state: "missing" })}>Disconnect Canvas</button>
          <button className={button} onClick={() => void control({ action: "credential", state: "invalid" })}>Invalidate token</button>
          <button className={button} onClick={() => void control({ action: "credential", state: "active" })}>Reconnect Canvas</button>
          <button className={button} onClick={() => void control({ action: "reset" })}>Reset everything</button>
        </div>
        <div className="mt-2 text-ink-3">Credential: {state?.credential ?? "…"}</div>
      </Section>
      <Section title="Canvas attempts (ground truth)">
        <ul className="flex flex-col gap-1" data-testid="canvas-attempts">
          {state?.attempts.map((a) => (
            <li key={a.canvasId}>
              <span className="font-medium">{a.name}</span>: {a.attempts.length === 0 ? "none" : a.attempts.map((x) => `#${x.attempt} ${x.type}`).join(", ")}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Outbox rows">
        <ul className="flex flex-col gap-1 font-mono text-[11px]">
          {state?.outbox.map((r) => (
            <li key={r.id}>
              {r.assignmentCanvasId} {r.status}{r.step ? `/${r.step}` : ""} try {r.attempt} left {r.attemptsLeft}
              {r.mayHavePosted ? " mayHavePosted" : ""}{r.checkOnly ? " checkOnly" : ""}{r.errorKind ? ` ${r.errorKind}` : ""}
              {r.nextAttemptAt ? ` next ${new Date(r.nextAttemptAt).toLocaleTimeString()}` : ""}{r.dismissed ? " dismissed" : ""}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Canvas request log">
        <ol className="flex flex-col gap-[2px] font-mono text-[11px]">
          {state?.log.slice().reverse().map((r, i) => (
            <li key={i}>
              {new Date(r.at).toLocaleTimeString()} {r.method} {r.operation} {String(r.status)}{r.fault ? ` (${r.fault})` : ""}{r.authorized ? "" : " no-token"}
            </li>
          ))}
        </ol>
      </Section>
    </aside>
  );
}

function Page() {
  const [selected, setSelected] = useState<number>(8101);
  const item = useQuery(api.todos.get, { ref: { kind: "assignment", canvasId: selected } });
  return (
    <div className="flex min-h-screen bg-page text-ink">
      <Controls />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <nav className="flex flex-wrap gap-1 border-b border-line bg-surface p-3" aria-label="Fixture assignments">
          {ASSIGNMENTS.map(([id, label]) => (
            <button
              key={id}
              aria-pressed={id === selected}
              onClick={() => setSelected(id)}
              className={`rounded-md px-2 py-1 text-[12.5px] ${id === selected ? "bg-today text-today-fg" : "bg-chip text-ink-2"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="px-6">{item ? <TodoDetail key={selected} item={item} /> : <div className="p-6 text-ink-3">Loading…</div>}</div>
      </main>
    </div>
  );
}

const drafts = new DraftStore();
const rootRoute = createRootRoute({
  component: () => (
    <DraftContext.Provider value={drafts}>
      <Page />
    </DraftContext.Provider>
  ),
  notFoundComponent: () => null,
});
const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: ["/"] }) });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
