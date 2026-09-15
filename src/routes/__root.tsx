import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/components/app/sidebar";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { QuickAddProvider } from "@/components/app/quick-add";
import { CommandPalette } from "@/components/search/command-palette";
import { useTimeZonePreference } from "@/lib/time-zone";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <TimeZoneSync />
      <QuickAddProvider>
        <div className="flex min-h-dvh">
          <Sidebar />
          <main className="flex min-h-dvh min-w-0 flex-1 flex-col pb-[72px] md:h-dvh md:overflow-y-auto md:pb-0">
            <Outlet />
          </main>
        </div>
        <BottomTabs />
        <CommandPalette />
      </QuickAddProvider>
    </>
  );
}

/** Keeps the display zone in step with the saved preference. Renders nothing. */
function TimeZoneSync() {
  useTimeZonePreference();
  return null;
}
