import { memo, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { EXTERNAL_LINK, INTERNAL_LINK, PROSE } from "@/lib/prose";
import { cn } from "@/lib/utils";

function Anchor({ href, children }: { href?: string; children?: React.ReactNode }) {
  const navigate = useNavigate();
  const to = href ?? "";
  // Tool results hand the model wiscourse paths; those stay in the app.
  if (to.startsWith("/") && !to.startsWith("//")) {
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      void navigate({ to });
    };
    return (
      <a href={to} onClick={onClick} className={INTERNAL_LINK}>
        {children}
      </a>
    );
  }
  if (/^https:\/\//i.test(to)) {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" className={EXTERNAL_LINK}>
        {children}
      </a>
    );
  }
  return <>{children}</>;
}

const components: Components = {
  a: ({ href, children }) => <Anchor href={href}>{children}</Anchor>,
  table: ({ children }) => (
    <div data-table-wrap>
      <table>{children}</table>
    </div>
  ),
  // The model shouldn't send images; if it does, show nothing it could fetch.
  img: () => null,
};

/** Assistant prose. Raw HTML in the text is never rendered. */
export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn(PROSE, "text-[14px] leading-[1.6] [&_p]:mb-[10px] [&_ul]:mb-[10px] [&_ol]:mb-[10px]", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
});
