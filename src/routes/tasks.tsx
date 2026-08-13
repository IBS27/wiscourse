import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/tasks")({
  component: Tasks,
});

function Tasks() {
  const tasks = useQuery(api.tasks.list);
  const addTask = useMutation(api.tasks.add);
  const toggleTask = useMutation(api.tasks.toggle);
  const [title, setTitle] = useState("");

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    setTitle("");
    await addTask({ title: trimmed });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
        />
        <Button type="submit" disabled={title.trim().length === 0}>
          Add
        </Button>
      </form>

      {tasks === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks yet. Add one above — synced Canvas to-dos will also show
          here.
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task._id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <Checkbox
                checked={task.completedAt !== undefined}
                onCheckedChange={() => toggleTask({ id: task._id })}
              />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate font-medium",
                    task.completedAt !== undefined &&
                      "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </p>
                {task.dueAt !== undefined && (
                  <p className="text-sm text-muted-foreground">
                    Due {formatDate(task.dueAt)}
                  </p>
                )}
              </div>
              {task.source === "canvas" && (
                <span className="text-xs text-muted-foreground">Canvas</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
