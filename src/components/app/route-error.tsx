import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown in place of a route whose render failed, so one error never blanks the app. */
export function RouteError({ reset }: ErrorComponentProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center p-8 text-center md:min-h-0 md:pb-[12vh]">
      <span className="grid size-10 place-items-center rounded-xl border border-line bg-sunken text-ink-3" aria-hidden>
        <TriangleAlert className="size-[18px]" />
      </span>
      <h1 className="mt-4 text-[15px] font-semibold tracking-[-0.01em]">This page didn&rsquo;t load</h1>
      <p role="alert" className="mt-1 max-w-[340px] text-[13px] leading-[1.5] text-ink-3">
        Something went wrong showing this page. Your data is safe; try again, or head back home.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={reset}>Try again</Button>
        <Button size="sm" variant="outline" asChild>
          <Link to="/">Back to Home</Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    </div>
  );
}
