import { useEffect } from "react";
import { createRootRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "@/components/app/sidebar";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { QuickAddProvider } from "@/components/app/quick-add";
import { CommandPalette } from "@/components/search/command-palette";
import { useTimeZonePreference } from "@/lib/time-zone";
import { cn } from "@/lib/utils";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Chats own the full screen on mobile: the composer sits where the tabs would.
  const inAsk = useRouterState({ select: (s) => s.location.pathname.startsWith("/ask") });
  return (
    <>
      <TimeZoneSync />
      <AskShortcut />
      <QuickAddProvider>
        <div className="flex min-h-dvh">
          <Sidebar />
          <main className={cn("flex min-h-dvh min-w-0 flex-1 flex-col md:h-dvh md:overflow-y-auto md:pb-0", inAsk ? "h-dvh" : "pb-[72px]")}>
            <Outlet />
          </main>
        </div>
        {!inAsk && <BottomTabs />}
        <CommandPalette />
      </QuickAddProvider>
    </>
  );
}

/** ⌘J starts a new chat from anywhere, even while typing. */
function AskShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "j" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        void navigate({ to: "/ask" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
  return null;
}

/** Keeps the display zone in step with the saved preference. Renders nothing. */
function TimeZoneSync() {
  useTimeZonePreference();
  return null;
}
