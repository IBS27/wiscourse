// Minimal shapes for the Canvas REST responses we consume.
// Reference: https://developerdocs.instructure.com/services/canvas

export interface CanvasUser {
  id: number;
  name: string;
}

export interface CanvasTerm {
  id: number;
  name: string;
}

export interface CanvasCourse {
  id: number;
  name?: string;
  course_code?: string;
  start_at?: string | null;
  end_at?: string | null;
  is_favorite?: boolean;
  term?: CanvasTerm;
  access_restricted_by_date?: boolean;
}

export interface CanvasSubmission {
  id: number;
  assignment_id: number;
  submitted_at: string | null;
  workflow_state: string;
  score: number | null;
  grade: string | null;
  late?: boolean;
  missing?: boolean;
  posted_at: string | null;
}

export interface CanvasAssignment {
  id: number;
  course_id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types: string[];
  submission?: CanvasSubmission;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string | null;
  posted_at: string | null;
  html_url: string;
  context_code: string; // "course_12345"
}

export interface CanvasCalendarEvent {
  id: number;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  location_name: string | null;
  context_code: string;
}

export interface CanvasPlannerNote {
  id: number;
  title: string;
  details: string | null;
  todo_date: string | null;
  course_id: number | null;
}

export interface CanvasActivityStreamSummaryItem {
  type: string;
  count: number;
  unread_count: number;
}

export function toMillis(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : ms;
}
