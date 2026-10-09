/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actionLog from "../actionLog.js";
import type * as apiKey from "../apiKey.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as crons from "../crons.js";
import type * as deviceAuth from "../deviceAuth.js";
import type * as emails from "../emails.js";
import type * as environment from "../environment.js";
import type * as folder from "../folder.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_autumn from "../lib/autumn.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_data from "../lib/data.js";
import type * as lib_emails_access_restricted from "../lib/emails/access_restricted.js";
import type * as lib_emails_account_deleted from "../lib/emails/account_deleted.js";
import type * as lib_emails_collaborator_added from "../lib/emails/collaborator_added.js";
import type * as lib_emails_grace_period_started from "../lib/emails/grace_period_started.js";
import type * as lib_emails_index from "../lib/emails/index.js";
import type * as lib_emails_plan_upgraded from "../lib/emails/plan_upgraded.js";
import type * as lib_emails_welcome from "../lib/emails/welcome.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_logger from "../lib/logger.js";
import type * as lib_middleware from "../lib/middleware.js";
import type * as lib_oidc from "../lib/oidc.js";
import type * as lib_plans from "../lib/plans.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_site from "../lib/site.js";
import type * as lib_svix from "../lib/svix.js";
import type * as lib_types from "../lib/types.js";
import type * as project from "../project.js";
import type * as projectShare from "../projectShare.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as resend from "../resend.js";
import type * as secret from "../secret.js";
import type * as serviceAccount from "../serviceAccount.js";
import type * as user from "../user.js";
import type * as userKey from "../userKey.js";
import type * as webhook from "../webhook.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actionLog: typeof actionLog;
  apiKey: typeof apiKey;
  auth: typeof auth;
  billing: typeof billing;
  crons: typeof crons;
  deviceAuth: typeof deviceAuth;
  emails: typeof emails;
  environment: typeof environment;
  folder: typeof folder;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/autumn": typeof lib_autumn;
  "lib/crypto": typeof lib_crypto;
  "lib/data": typeof lib_data;
  "lib/emails/access_restricted": typeof lib_emails_access_restricted;
  "lib/emails/account_deleted": typeof lib_emails_account_deleted;
  "lib/emails/collaborator_added": typeof lib_emails_collaborator_added;
  "lib/emails/grace_period_started": typeof lib_emails_grace_period_started;
  "lib/emails/index": typeof lib_emails_index;
  "lib/emails/plan_upgraded": typeof lib_emails_plan_upgraded;
  "lib/emails/welcome": typeof lib_emails_welcome;
  "lib/errors": typeof lib_errors;
  "lib/helpers": typeof lib_helpers;
  "lib/logger": typeof lib_logger;
  "lib/middleware": typeof lib_middleware;
  "lib/oidc": typeof lib_oidc;
  "lib/plans": typeof lib_plans;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/site": typeof lib_site;
  "lib/svix": typeof lib_svix;
  "lib/types": typeof lib_types;
  project: typeof project;
  projectShare: typeof projectShare;
  rateLimiter: typeof rateLimiter;
  resend: typeof resend;
  secret: typeof secret;
  serviceAccount: typeof serviceAccount;
  user: typeof user;
  userKey: typeof userKey;
  webhook: typeof webhook;
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
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
