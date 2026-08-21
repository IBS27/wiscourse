/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as assignments from "../assignments.js";
import type * as calendar from "../calendar.js";
import type * as canvas_client from "../canvas/client.js";
import type * as canvas_syncContent from "../canvas/syncContent.js";
import type * as canvas_syncCourseMeta from "../canvas/syncCourseMeta.js";
import type * as canvas_types from "../canvas/types.js";
import type * as courses from "../courses.js";
import type * as credentials from "../credentials.js";
import type * as crons from "../crons.js";
import type * as discussions from "../discussions.js";
import type * as files from "../files.js";
import type * as grades from "../grades.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_upsert from "../lib/upsert.js";
import type * as modules from "../modules.js";
import type * as overrides from "../overrides.js";
import type * as pages from "../pages.js";
import type * as quizzes from "../quizzes.js";
import type * as seenState from "../seenState.js";
import type * as storeContent from "../storeContent.js";
import type * as storeCourseMeta from "../storeCourseMeta.js";
import type * as sync from "../sync.js";
import type * as syncStore from "../syncStore.js";
import type * as tasks from "../tasks.js";
import type * as todos from "../todos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assignments: typeof assignments;
  calendar: typeof calendar;
  "canvas/client": typeof canvas_client;
  "canvas/syncContent": typeof canvas_syncContent;
  "canvas/syncCourseMeta": typeof canvas_syncCourseMeta;
  "canvas/types": typeof canvas_types;
  courses: typeof courses;
  credentials: typeof credentials;
  crons: typeof crons;
  discussions: typeof discussions;
  files: typeof files;
  grades: typeof grades;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/upsert": typeof lib_upsert;
  modules: typeof modules;
  overrides: typeof overrides;
  pages: typeof pages;
  quizzes: typeof quizzes;
  seenState: typeof seenState;
  storeContent: typeof storeContent;
  storeCourseMeta: typeof storeCourseMeta;
  sync: typeof sync;
  syncStore: typeof syncStore;
  tasks: typeof tasks;
  todos: typeof todos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  syncWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"syncWorkpool">;
};
