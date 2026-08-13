import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { SignInButton, UserButton } from "@clerk/clerk-react";
import {
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createRootRoute({
  component: RootLayout,
});

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/courses", label: "Courses", icon: GraduationCap },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function RootLayout() {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Loading…
        </div>
      </AuthLoading>

      <Unauthenticated>
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">wiscourse</h1>
            <p className="max-w-md text-muted-foreground">
              A fast, reliable interface for Canvas at UW–Madison. Your
              courses, assignments, calendar, and tasks in one place.
            </p>
          </div>
          <SignInButton mode="modal">
            <Button size="lg">Sign in</Button>
          </SignInButton>
        </div>
      </Unauthenticated>

      <Authenticated>
        <div className="flex min-h-screen">
          <aside className="flex w-60 flex-col border-r bg-sidebar">
            <div className="px-5 py-5">
              <Link to="/" className="text-xl font-bold tracking-tight">
                wiscourse
              </Link>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-3">
              {navItems.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  activeProps={{
                    className: "bg-accent text-accent-foreground",
                  }}
                  activeOptions={{ exact: to === "/" }}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              ))}
            </nav>
            <div className="border-t px-5 py-4">
              <UserButton />
            </div>
          </aside>
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl p-8">
              <Outlet />
            </div>
          </main>
        </div>
      </Authenticated>
    </>
  );
}
