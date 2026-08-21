import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { Sidebar } from "@/components/app/sidebar";
import { BottomTabs } from "@/components/app/bottom-tabs";
import { QuickAddProvider } from "@/components/app/quick-add";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading…</div>
      </AuthLoading>

      <Unauthenticated>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="space-y-2">
            <h1>
              <Logo className="text-4xl" />
            </h1>
            <p className="max-w-md text-ink-2">
              A fast, reliable interface for Canvas at UW–Madison. Your courses,
              assignments, calendar, and tasks in one place.
            </p>
          </div>
          <SignInButton mode="modal">
            <Button size="lg">Sign in</Button>
          </SignInButton>
        </div>
      </Unauthenticated>

      <Authenticated>
        <QuickAddProvider>
          <div className="flex min-h-dvh">
            <Sidebar />
            <main className="flex min-h-dvh min-w-0 flex-1 flex-col pb-[72px] md:h-dvh md:overflow-y-auto md:pb-0">
              <Outlet />
            </main>
          </div>
          <BottomTabs />
        </QuickAddProvider>
      </Authenticated>
    </>
  );
}
