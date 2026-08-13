import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatRelative } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const status = useQuery(api.credentials.status);
  const upcoming = useQuery(api.assignments.upcoming);
  const tasks = useQuery(api.tasks.list);

  const openTasks = tasks?.filter((task) => task.completedAt === undefined);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {status !== undefined && status !== null && !status.connected && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Canvas</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Connect your Canvas account to sync courses, assignments, and
              deadlines.
            </p>
            <Button asChild>
              <Link to="/settings">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Due soon</h2>
          {openTasks !== undefined && (
            <Link
              to="/tasks"
              className="text-sm text-muted-foreground hover:underline"
            >
              {openTasks.length} open task{openTasks.length === 1 ? "" : "s"}
            </Link>
          )}
        </div>

        {upcoming === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing due. Enjoy the quiet.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((assignment) => (
              <li key={assignment._id}>
                <a
                  href={assignment.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{assignment.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {assignment.courseName}
                      {assignment.dueAt !== undefined &&
                        ` · ${formatDateTime(assignment.dueAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {assignment.submission?.submittedAt !== undefined ? (
                      <Badge variant="secondary">Submitted</Badge>
                    ) : assignment.dueAt !== undefined ? (
                      <Badge variant="outline">
                        {formatRelative(assignment.dueAt)}
                      </Badge>
                    ) : null}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
