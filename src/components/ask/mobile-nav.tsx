import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, MessagesSquare } from "lucide-react";
import { ThreadList } from "./thread-list";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Mobile header controls: back to Home, and the chat list in a sheet. */
export function AskMobileNav({ activeId }: { activeId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Link to="/" aria-label="Back to Home" className="grid size-8 place-items-center rounded-lg text-ink-2 md:hidden">
        <ChevronLeft className="size-[18px]" />
      </Link>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chats"
        className="order-last grid size-8 place-items-center rounded-lg text-ink-2 md:hidden"
      >
        <MessagesSquare className="size-[17px]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-0 left-0 flex h-dvh w-full max-w-none translate-x-0 flex-col rounded-none border-0">
          <DialogTitle className="sr-only">Chats</DialogTitle>
          <ThreadList activeId={activeId} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
