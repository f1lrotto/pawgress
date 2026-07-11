/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activityTypes from "../activityTypes.js";
import type * as agenda from "../agenda.js";
import type * as auth from "../auth.js";
import type * as bodyMetrics from "../bodyMetrics.js";
import type * as dogs from "../dogs.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as insights from "../insights.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_events from "../lib/events.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_insights from "../lib/insights.js";
import type * as lib_mealRoutines from "../lib/mealRoutines.js";
import type * as lib_rest from "../lib/rest.js";
import type * as onboarding from "../onboarding.js";
import type * as preferences from "../preferences.js";
import type * as routines from "../routines.js";
import type * as sharing from "../sharing.js";
import type * as timeline from "../timeline.js";
import type * as training from "../training.js";
import type * as users from "../users.js";
import type * as walks from "../walks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activityTypes: typeof activityTypes;
  agenda: typeof agenda;
  auth: typeof auth;
  bodyMetrics: typeof bodyMetrics;
  dogs: typeof dogs;
  events: typeof events;
  http: typeof http;
  insights: typeof insights;
  "lib/auth": typeof lib_auth;
  "lib/events": typeof lib_events;
  "lib/functions": typeof lib_functions;
  "lib/insights": typeof lib_insights;
  "lib/mealRoutines": typeof lib_mealRoutines;
  "lib/rest": typeof lib_rest;
  onboarding: typeof onboarding;
  preferences: typeof preferences;
  routines: typeof routines;
  sharing: typeof sharing;
  timeline: typeof timeline;
  training: typeof training;
  users: typeof users;
  walks: typeof walks;
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

export declare const components: {};
