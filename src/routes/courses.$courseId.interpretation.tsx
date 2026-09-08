import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { CourseMap } from "../../convex/lib/courseMap";

export const Route = createFileRoute("/courses/$courseId/interpretation")({
  component: CourseInterpretation,
});

function Evidence({
  items,
  links,
}: {
  items: CourseMap["sections"][number]["evidence"];
  links: Map<string, { title: string; href: string }>;
}) {
  return (
    <details className="mt-3 text-xs text-ink-3">
      <summary className="cursor-pointer">Source evidence</summary>
      {items.map((item, i) => (
        <blockquote key={i} className="my-2 border-l-2 border-line pl-3">
          <p className="whitespace-pre-wrap">“{item.quote}”</p>
          <a className="underline" href={links.get(item.sourceId)?.href}>
            {links.get(item.sourceId)?.title ?? item.sourceId}
          </a>
        </blockquote>
      ))}
    </details>
  );
}

function CourseInterpretation() {
  const { courseId } = Route.useParams();
  const courseCanvasId = Number(courseId);
  const data = useQuery(api.courseInterpretations.get, { courseCanvasId });
  const request = useMutation(api.courseInterpretations.request);
  const disable = useMutation(api.courseInterpretations.disable);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (data === undefined)
    return <p className="p-6 text-sm text-ink-3">Loading course map…</p>;
  const state = data.state;
  const map = state?.map;
  const busy = state?.status === "queued" || state?.status === "running";
  const links = new Map((state?.resources ?? []).map((r) => [r.id, r]));
  const stale = Boolean(map && state?.sourceRevision !== state?.resultRevision);
  const run = async (stop = false) => {
    setPending(true);
    setError(undefined);
    try {
      await (stop ? disable : request)({ courseCanvasId });
    } catch {
      setError("Could not update interpretation. Wait a minute and try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Review course interpretation</h1>
          <p className="mt-2 text-sm text-ink-3">
            AI groups the instructor’s material and shows the evidence for its
            interpretation. Validated interpretations organize your course Overview. Check the original sources when reviewing flagged details.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50"
              disabled={!data.configured || busy || pending}
              onClick={() => void run()}
            >
              {busy
                ? "Interpreting course…"
                : map
                  ? "Refresh interpretation"
                  : "Interpret course"}
            </button>
            {state?.enabled && (
              <button
                className="text-sm text-ink-3 underline disabled:opacity-50"
                disabled={pending}
                onClick={() => void run(true)}
              >
                Stop automatic refresh
              </button>
            )}
          </div>
          {!data.configured && (
            <p className="mt-3 text-sm text-ink-3">
              AI interpretation isn’t configured yet.
            </p>
          )}
          {state?.enabled && (
            <p className="mt-3 text-xs text-ink-3">
              Refreshes after a full sync when course material changes.
            </p>
          )}
          <p role="status" className="mt-3 text-sm text-ink-3">
            {busy
              ? "Reading course material and checking source evidence…"
              : stale
                ? "Course material changed. The previous map is shown below."
                : state?.status === "failed"
                  ? state.error
                  : ""}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm">
              {error}
            </p>
          )}
          {state?.validationIssues?.length ? (
            <details className="mt-3 text-sm">
              <summary>Validation issues</summary>
              <ul className="list-disc pl-5">
                {state.validationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
        {map && (
          <>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-3">
                {map.organization}
              </p>
              <p className="mt-2 text-sm">{map.summary}</p>
            </div>
            {map.conflicts.length > 0 && (
              <section className="rounded-lg border border-line p-4">
                <h2 className="font-semibold">Needs attention</h2>
                {map.conflicts.map((c, i) => (
                  <div key={i} className="mt-3 text-sm">
                    <p>{c.message}</p>
                    <Evidence items={c.evidence} links={links} />
                  </div>
                ))}
              </section>
            )}
            {map.essentials.length > 0 && (
              <section>
                <h2 className="font-semibold">Essentials</h2>
                {map.essentials.map((e, i) => (
                  <div key={i} className="mt-3 text-sm">
                    <a
                      className="underline"
                      href={links.get(e.resourceId)?.href}
                    >
                      {e.label}
                    </a>
                    <Evidence items={e.evidence} links={links} />
                  </div>
                ))}
              </section>
            )}
            {map.sections.map((section) => (
              <section
                key={section.id}
                className="rounded-lg border border-line p-4"
              >
                <h2 className="font-semibold">{section.title}</h2>
                {section.teachingDates && (
                  <p className="mt-1 text-xs text-ink-3">
                    Teaching dates: {section.teachingDates.start} –{" "}
                    {section.teachingDates.end}
                  </p>
                )}
                <ul className="mt-3 space-y-2 text-sm">
                  {section.resourceIds.map((id, i) => (
                    <li key={`${id}-${i}`}>
                      <a
                        className="underline underline-offset-2"
                        href={links.get(id)?.href}
                      >
                        {links.get(id)?.title ?? id}
                      </a>
                    </li>
                  ))}
                </ul>
                <Evidence items={section.evidence} links={links} />
              </section>
            ))}
            {map.unresolvedResourceIds.length > 0 && (
              <details className="text-sm">
                <summary>
                  Unresolved resources ({map.unresolvedResourceIds.length})
                </summary>
                <ul className="mt-3 space-y-2">
                  {map.unresolvedResourceIds.map((id, i) => (
                    <li key={`${id}-${i}`}>
                      <a className="underline" href={links.get(id)?.href}>
                        {links.get(id)?.title ?? id}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-xs text-ink-3">
              Last run: {state?.model} · {state?.inputTokens ?? 0} input tokens
              · {state?.outputTokens ?? 0} output tokens ·{" "}
              {state?.toolCalls ?? 0} tool calls
            </p>
          </>
        )}
      </div>
    </div>
  );
}
