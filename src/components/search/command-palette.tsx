import { useCallback, useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Palette } from "./palette";
import { useIsMobile } from "@/lib/hooks";
import { onOpenSearch } from "@/lib/search-context";
import { cn, isTyping } from "@/lib/utils";

/** ⌘K, mounted once in the root route. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  // The index is worth keeping subscribed once opened, but not before.
  const [armed, setArmed] = useState(false);
  const [scope, setScope] = useState<number | undefined>(undefined);
  const mobile = useIsMobile();

  const params = useParams({ strict: false });
  const routeCourseId = Number(params.courseId);

  const index = useQuery(api.search.index, armed ? {} : "skip");
  const recents = useQuery(api.seenState.recent, armed ? { limit: 24 } : "skip");

  const openWith = useCallback((courseCanvasId?: number) => {
    setScope(courseCanvasId);
    setArmed(true);
    setOpen(true);
  }, []);

  useEffect(() => onOpenSearch((s) => openWith(s.courseId)), [openWith]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      // ⌘K works while typing too — it is the way out of any input.
      if (key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        if (open) setOpen(false);
        else openWith(undefined);
        return;
      }

      // "/" is the course-page shortcut, pre-scoped to the course you are on.
      if (
        key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        Number.isFinite(routeCourseId) &&
        !isTyping(event.target)
      ) {
        event.preventDefault();
        openWith(routeCourseId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openWith, routeCourseId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          mobile
            ? "top-0 left-0 h-dvh w-full max-w-none translate-x-0 rounded-none border-0"
            : scope === undefined
              ? "max-w-[620px]"
              : "max-w-[700px]",
        )}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search courses, assignments, pages, files and announcements, or run a quick action.
        </DialogDescription>
        {/* Radix only renders content while open, so each opening starts on a
            fresh palette with an empty query. */}
        <Palette
          mobile={mobile}
          scope={scope}
          index={index}
          recents={recents}
          onScope={setScope}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
