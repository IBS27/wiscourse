/* eslint-disable react-refresh/only-export-components -- standalone browser test entrypoint */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { AuthProvider } from "../../src/components/app/auth-provider";
import { QuickAddProvider } from "../../src/components/app/quick-add";
import { Composer } from "../../src/components/ask/composer";
import { useDraft } from "../../src/lib/drafts";
import { useQuickAdd } from "../../src/lib/quick-add-context";
import { change, useTestSession } from "./clerk";
import { createAuthServer } from "../helpers/auth-server";
import "./style.css";

const server = createAuthServer();
const createClient = (url: string) => new ConvexReactClient(url, {
  webSocketConstructor: server.WebSocket, logger: false, unsavedChangesWarning: false,
});
function Controls() {
  const session = useTestSession();
  return <aside className="flex flex-wrap items-center gap-2 border-b p-3 text-sm">
    <strong>Auth test harness. Simulated services.</strong>
    <button onClick={() => { change({ tokenMode: "hang" }); server.latest().rejectSession(); }}>Hang refresh</button>
    <button onClick={() => { change({ tokenMode: "normal" }); window.dispatchEvent(new Event("focus")); }}>Restore service</button>
    <button onClick={() => { change({ tokenMode: "configuration" }); server.latest().rejectSession(); }}>Reject tokens</button>
    <button onClick={() => change({ userId: session.userId === "test-A" ? "test-B" : "test-A", tokenMode: "normal" })}>Switch user</button>
    <button onClick={() => change({ failSignOut: !session.failSignOut })}>{session.failSignOut ? "Allow sign out" : "Fail sign out"}</button>
    <button onClick={() => change({ isLoaded: false, status: "error" })}>Fail Clerk</button>
    <button onClick={() => change({ isLoaded: true, status: "ready" })}>Restore Clerk</button>
  </aside>;
}
function Drafts() {
  const session = useTestSession();
  const quickAdd = useQuickAdd();
  const [notes, setNotes] = useDraft("notes", "");
  return <main className="mx-auto max-w-xl space-y-5 p-8">
    <h1 className="text-xl">Signed in as {session.userId}</h1>
    <Composer onSend={async () => {}} courseCanvasId={undefined} onCourseChange={() => {}} />
    <label className="block">Notes<textarea className="block w-full rounded border p-2" value={notes} onChange={event => setNotes(event.target.value)} /></label>
    <button onClick={() => quickAdd.open()}>Add task</button>
  </main>;
}
const root = createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
root.render(<StrictMode>
  <Controls />
  <AuthProvider url="https://test.convex.cloud" createClient={createClient}>
    <QuickAddProvider><Drafts /></QuickAddProvider>
  </AuthProvider>
</StrictMode>);
