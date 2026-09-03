// Minimal shapes for the Canvas REST responses we consume.
// Reference: https://developerdocs.instructure.com/services/canvas

export interface CanvasUser {
  id: number;
  name: string;
  email?: string | null;
  enrollments?: Array<{ type?: string }>;
}

export interface CanvasTerm {
  id: number;
  name: string;
  // Null on administrative terms ("Ongoing", "Supplemental"); set on
  // academic ones — the only reliable way to tell the two apart.
  start_at?: string | null;
  end_at?: string | null;
}

export interface CanvasEnrollment {
  type: string; // student | teacher | ta | observer | designer
  computed_current_score?: number | null;
  computed_current_grade?: string | null;
  computed_final_score?: number | null;
  computed_final_grade?: string | null;
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
  // include[]=syllabus_body,course_image,tabs,total_scores
  default_view?: "feed" | "wiki" | "modules" | "assignments" | "syllabus";
  syllabus_body?: string | null;
  image_download_url?: string | null;
  hide_final_grades?: boolean;
  apply_assignment_group_weights?: boolean;
  enrollments?: CanvasEnrollment[];
  tabs?: CanvasTab[]; // include[]=tabs (not always honored on the list endpoint)
}

export interface CanvasTab {
  id: string; // home | modules | pages | files | assignments | ...
  label: string;
  position: number;
  hidden?: boolean;
  visibility: string; // public | members | admins | none
  type: string; // internal | external
}

export interface CanvasAssignmentGroup {
  id: number;
  name: string;
  position: number;
  group_weight: number;
  rules?: {
    drop_lowest?: number;
    drop_highest?: number;
    never_drop?: number[];
  };
}

export interface CanvasGradingPeriod {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  weight?: number | null;
}

export interface CanvasQuiz {
  id: number;
  title: string;
  description: string | null;
  quiz_type: string;
  due_at: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  points_possible: number | null;
  time_limit: number | null;
  allowed_attempts: number;
  question_count?: number;
  assignment_id?: number | null;
  html_url: string;
  locked_for_user?: boolean;
}

export interface CanvasDiscussionTopic {
  id: number;
  title: string;
  message: string | null;
  is_announcement?: boolean;
  posted_at: string | null;
  last_reply_at: string | null;
  assignment_id?: number | null;
  assignment?: { due_at: string | null } | null;
  user_name?: string | null;
  author?: { display_name?: string | null } | null;
  unread_count?: number;
  read_state?: string;
  locked?: boolean;
  pinned?: boolean;
  html_url: string;
  context_code?: string; // present on /announcements
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at: string | null;
  state?: "locked" | "unlocked" | "started" | "completed";
  prerequisite_module_ids: number[];
  require_sequential_progress: boolean;
  published?: boolean;
  items_count: number;
  items?: CanvasModuleItem[]; // include[]=items; omitted for huge modules
}

export interface CanvasModuleItem {
  id: number;
  module_id: number;
  position: number;
  indent: number;
  type:
    | "Assignment"
    | "Page"
    | "File"
    | "Discussion"
    | "Quiz"
    | "ExternalUrl"
    | "ExternalTool"
    | "SubHeader";
  title: string;
  content_id?: number;
  page_url?: string;
  external_url?: string;
  html_url?: string;
  published?: boolean;
  completion_requirement?: {
    type: string;
    min_score?: number;
    completed?: boolean;
  };
}

export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  body?: string | null; // only on GET /pages/:url or include[]=body
  front_page: boolean;
  published: boolean;
  updated_at: string | null;
  html_url: string;
  locked_for_user?: boolean;
}

export interface CanvasFolder {
  id: number;
  parent_folder_id: number | null;
  name: string;
  full_name: string;
  position: number | null;
  files_count: number;
  folders_count: number;
  locked_for_user?: boolean;
}

export interface CanvasFile {
  id: number;
  folder_id: number | null;
  display_name: string;
  filename: string;
  "content-type": string;
  size: number;
  url: string;
  thumbnail_url?: string | null;
  updated_at: string | null;
  modified_at: string | null;
  locked_for_user?: boolean;
  hidden?: boolean;
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
  submission_comments?: CanvasSubmissionComment[];
}

export interface CanvasSubmissionComment {
  author_id?: number;
  author_name: string;
  comment: string;
  created_at: string;
}

export interface CanvasScoreStatistics {
  min: number;
  max: number;
  mean: number;
  median?: number | null;
  lower_q?: number | null;
  upper_q?: number | null;
}

export interface CanvasAssignment {
  created_at: string;
  updated_at: string;
  id: number;
  course_id: number;
  name: string;
  description?: string | null;
  due_at: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  points_possible: number | null;
  grading_type?: string;
  assignment_group_id?: number;
  position?: number;
  html_url: string;
  submission_types: string[];
  quiz_id?: number;
  discussion_topic?: { id: number } | null;
  locked_for_user?: boolean;
  omit_from_final_grade?: boolean;
  submission?: CanvasSubmission;
  score_statistics?: CanvasScoreStatistics;
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
