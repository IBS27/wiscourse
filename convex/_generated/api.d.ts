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
import type * as canvas_types from "../canvas/types.js";
import type * as courses from "../courses.js";
import type * as credentials from "../credentials.js";
import type * as crons from "../crons.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as sync from "../sync.js";
import type * as syncStore from "../syncStore.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  assignments: typeof assignments;
  calendar: typeof calendar;
  "canvas/client": typeof canvas_client;
  "canvas/types": typeof canvas_types;
  courses: typeof courses;
  credentials: typeof credentials;
  crons: typeof crons;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  sync: typeof sync;
  syncStore: typeof syncStore;
  tasks: typeof tasks;
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
