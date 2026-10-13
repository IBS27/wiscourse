import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** Shown in place of a route whose render failed, so one error never blanks the app. */
export function RouteError({ reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p role="alert" className="text-ink-3">Something went wrong showing this page.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}
