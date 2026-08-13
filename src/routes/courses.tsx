import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Star } from "lucide-react";
import { api } from "../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/courses")({
  component: Courses,
});

function Courses() {
  const courses = useQuery(api.courses.list);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Courses</h1>

      {courses === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : courses.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No courses yet. Connect Canvas in Settings, then run a sync.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((course) => (
            <Card key={course._id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span className="min-w-0 truncate">{course.name}</span>
                  {course.isFavorite && (
                    <Star className="size-4 shrink-0 fill-current text-yellow-500" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {course.courseCode}
                  {course.term && ` · ${course.term}`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
