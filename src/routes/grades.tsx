import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/page-header";

export const Route = createFileRoute("/grades")({
  component: GradesPage,
});

function GradesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Grades" subtitle="Coming soon" />
      <div className="px-5 py-10 text-center text-[13px] text-ink-3">
        Weighted grade tables and what-if scores arrive in a later milestone.
      </div>
    </div>
  );
}
