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
import type * as auth from "../auth.js";
import type * as autumn from "../autumn.js";
import type * as crons from "../crons.js";
import type * as deviceAuth from "../deviceAuth.js";
import type * as environment from "../environment.js";
import type * as folder from "../folder.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_middleware from "../lib/middleware.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_types from "../lib/types.js";
import type * as organization from "../organization.js";
import type * as project from "../project.js";
import type * as rateLimiter from "../rateLimiter.js";
import type * as secret from "../secret.js";
import type * as test_helpers_setup from "../test/helpers/setup.js";
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
  auth: typeof auth;
  autumn: typeof autumn;
  crons: typeof crons;
  deviceAuth: typeof deviceAuth;
  environment: typeof environment;
  folder: typeof folder;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/errors": typeof lib_errors;
  "lib/helpers": typeof lib_helpers;
  "lib/middleware": typeof lib_middleware;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/types": typeof lib_types;
  organization: typeof organization;
  project: typeof project;
  rateLimiter: typeof rateLimiter;
  secret: typeof secret;
  "test/helpers/setup": typeof test_helpers_setup;
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
  betterAuth: {
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                data: {
                  accessRestrictedEmailSent?: null | boolean;
                  createdAt: number;
                  email: string;
                  emailVerified: boolean;
                  encryptedPrivateKey?: null | string;
                  freeOrganizationUsed: boolean;
                  gracePeriodEmailSent?: null | boolean;
                  hasPro: boolean;
                  image?: null | string;
                  keysUpdatedAt?: null | number;
                  name: string;
                  needsEncryptionForPersonalProjectSecrets?: null | boolean;
                  planDowngradedAt?: null | number;
                  publicKey?: null | string;
                  salt?: null | string;
                  updatedAt: number;
                  userId?: null | string;
                };
                model: "user";
              }
            | {
                data: {
                  activeOrganizationId?: null | string;
                  createdAt: number;
                  expiresAt: number;
                  ipAddress?: null | string;
                  token: string;
                  updatedAt: number;
                  userAgent?: null | string;
                  userId: string;
                };
                model: "session";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId: string;
                  createdAt: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt: number;
                  userId: string;
                };
                model: "account";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  identifier: string;
                  updatedAt: number;
                  value: string;
                };
                model: "verification";
              }
            | {
                data: {
                  createdAt: number;
                  privateKey: string;
                  publicKey: string;
                };
                model: "jwks";
              }
            | {
                data: {
                  clientId?: null | string;
                  deviceCode: string;
                  expiresAt: number;
                  lastPolledAt?: null | number;
                  pollingInterval?: null | number;
                  scope?: null | string;
                  status: string;
                  userCode: string;
                  userId?: null | string;
                };
                model: "deviceCode";
              }
            | {
                data: {
                  createdAt: number;
                  currentKeyVersion: number;
                  isFreeWithProPlan: boolean;
                  logo?: null | string;
                  metadata?: null | string;
                  name: string;
                  ownerId: string;
                  paymentExpiresAt?: null | number;
                  paymentLapsedAt?: null | number;
                  paymentLapsedEmailSent?: null | boolean;
                  slug?: null | string;
                  subscriptionStatus: string;
                  suspendedAt?: null | number;
                  suspendedEmailSent?: null | boolean;
                };
                model: "organization";
              }
            | {
                data: {
                  createdAt: number;
                  grantedBy: string;
                  isPending: boolean;
                  keyVersion?: null | number;
                  organizationId: string;
                  revocationReason?: null | string;
                  revokedAt?: null | number;
                  revokedBy?: null | string;
                  role: string;
                  userId: string;
                  wrappedOrgKey?: null | string;
                };
                model: "member";
              }
            | {
                data: {
                  email: string;
                  expiresAt: number;
                  inviterId: string;
                  organizationId: string;
                  role: string;
                  status: string;
                };
                model: "invitation";
              };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "freeOrganizationUsed"
                    | "hasPro"
                    | "planDowngradedAt"
                    | "gracePeriodEmailSent"
                    | "accessRestrictedEmailSent"
                    | "publicKey"
                    | "encryptedPrivateKey"
                    | "salt"
                    | "keysUpdatedAt"
                    | "needsEncryptionForPersonalProjectSecrets"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "activeOrganizationId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "deviceCode";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "deviceCode"
                    | "userCode"
                    | "userId"
                    | "expiresAt"
                    | "status"
                    | "lastPolledAt"
                    | "pollingInterval"
                    | "clientId"
                    | "scope"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "slug"
                    | "logo"
                    | "createdAt"
                    | "metadata"
                    | "ownerId"
                    | "isFreeWithProPlan"
                    | "currentKeyVersion"
                    | "subscriptionStatus"
                    | "paymentExpiresAt"
                    | "paymentLapsedAt"
                    | "paymentLapsedEmailSent"
                    | "suspendedAt"
                    | "suspendedEmailSent"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "userId"
                    | "role"
                    | "createdAt"
                    | "wrappedOrgKey"
                    | "keyVersion"
                    | "grantedBy"
                    | "revokedAt"
                    | "revokedBy"
                    | "revocationReason"
                    | "isPending"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "inviterId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "freeOrganizationUsed"
                    | "hasPro"
                    | "planDowngradedAt"
                    | "gracePeriodEmailSent"
                    | "accessRestrictedEmailSent"
                    | "publicKey"
                    | "encryptedPrivateKey"
                    | "salt"
                    | "keysUpdatedAt"
                    | "needsEncryptionForPersonalProjectSecrets"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "activeOrganizationId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "deviceCode";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "deviceCode"
                    | "userCode"
                    | "userId"
                    | "expiresAt"
                    | "status"
                    | "lastPolledAt"
                    | "pollingInterval"
                    | "clientId"
                    | "scope"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "slug"
                    | "logo"
                    | "createdAt"
                    | "metadata"
                    | "ownerId"
                    | "isFreeWithProPlan"
                    | "currentKeyVersion"
                    | "subscriptionStatus"
                    | "paymentExpiresAt"
                    | "paymentLapsedAt"
                    | "paymentLapsedEmailSent"
                    | "suspendedAt"
                    | "suspendedEmailSent"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "userId"
                    | "role"
                    | "createdAt"
                    | "wrappedOrgKey"
                    | "keyVersion"
                    | "grantedBy"
                    | "revokedAt"
                    | "revokedBy"
                    | "revocationReason"
                    | "isPending"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "inviterId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
        },
        any
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          limit?: number;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "jwks"
            | "deviceCode"
            | "organization"
            | "member"
            | "invitation";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "jwks"
            | "deviceCode"
            | "organization"
            | "member"
            | "invitation";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  accessRestrictedEmailSent?: null | boolean;
                  createdAt?: number;
                  email?: string;
                  emailVerified?: boolean;
                  encryptedPrivateKey?: null | string;
                  freeOrganizationUsed?: boolean;
                  gracePeriodEmailSent?: null | boolean;
                  hasPro?: boolean;
                  image?: null | string;
                  keysUpdatedAt?: null | number;
                  name?: string;
                  needsEncryptionForPersonalProjectSecrets?: null | boolean;
                  planDowngradedAt?: null | number;
                  publicKey?: null | string;
                  salt?: null | string;
                  updatedAt?: number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "freeOrganizationUsed"
                    | "hasPro"
                    | "planDowngradedAt"
                    | "gracePeriodEmailSent"
                    | "accessRestrictedEmailSent"
                    | "publicKey"
                    | "encryptedPrivateKey"
                    | "salt"
                    | "keysUpdatedAt"
                    | "needsEncryptionForPersonalProjectSecrets"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  activeOrganizationId?: null | string;
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "activeOrganizationId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "deviceCode";
                update: {
                  clientId?: null | string;
                  deviceCode?: string;
                  expiresAt?: number;
                  lastPolledAt?: null | number;
                  pollingInterval?: null | number;
                  scope?: null | string;
                  status?: string;
                  userCode?: string;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "deviceCode"
                    | "userCode"
                    | "userId"
                    | "expiresAt"
                    | "status"
                    | "lastPolledAt"
                    | "pollingInterval"
                    | "clientId"
                    | "scope"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                update: {
                  createdAt?: number;
                  currentKeyVersion?: number;
                  isFreeWithProPlan?: boolean;
                  logo?: null | string;
                  metadata?: null | string;
                  name?: string;
                  ownerId?: string;
                  paymentExpiresAt?: null | number;
                  paymentLapsedAt?: null | number;
                  paymentLapsedEmailSent?: null | boolean;
                  slug?: null | string;
                  subscriptionStatus?: string;
                  suspendedAt?: null | number;
                  suspendedEmailSent?: null | boolean;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "slug"
                    | "logo"
                    | "createdAt"
                    | "metadata"
                    | "ownerId"
                    | "isFreeWithProPlan"
                    | "currentKeyVersion"
                    | "subscriptionStatus"
                    | "paymentExpiresAt"
                    | "paymentLapsedAt"
                    | "paymentLapsedEmailSent"
                    | "suspendedAt"
                    | "suspendedEmailSent"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                update: {
                  createdAt?: number;
                  grantedBy?: string;
                  isPending?: boolean;
                  keyVersion?: null | number;
                  organizationId?: string;
                  revocationReason?: null | string;
                  revokedAt?: null | number;
                  revokedBy?: null | string;
                  role?: string;
                  userId?: string;
                  wrappedOrgKey?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "userId"
                    | "role"
                    | "createdAt"
                    | "wrappedOrgKey"
                    | "keyVersion"
                    | "grantedBy"
                    | "revokedAt"
                    | "revokedBy"
                    | "revocationReason"
                    | "isPending"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                update: {
                  email?: string;
                  expiresAt?: number;
                  inviterId?: string;
                  organizationId?: string;
                  role?: string;
                  status?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "inviterId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  accessRestrictedEmailSent?: null | boolean;
                  createdAt?: number;
                  email?: string;
                  emailVerified?: boolean;
                  encryptedPrivateKey?: null | string;
                  freeOrganizationUsed?: boolean;
                  gracePeriodEmailSent?: null | boolean;
                  hasPro?: boolean;
                  image?: null | string;
                  keysUpdatedAt?: null | number;
                  name?: string;
                  needsEncryptionForPersonalProjectSecrets?: null | boolean;
                  planDowngradedAt?: null | number;
                  publicKey?: null | string;
                  salt?: null | string;
                  updatedAt?: number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "userId"
                    | "freeOrganizationUsed"
                    | "hasPro"
                    | "planDowngradedAt"
                    | "gracePeriodEmailSent"
                    | "accessRestrictedEmailSent"
                    | "publicKey"
                    | "encryptedPrivateKey"
                    | "salt"
                    | "keysUpdatedAt"
                    | "needsEncryptionForPersonalProjectSecrets"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  activeOrganizationId?: null | string;
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "activeOrganizationId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "publicKey" | "privateKey" | "createdAt" | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "deviceCode";
                update: {
                  clientId?: null | string;
                  deviceCode?: string;
                  expiresAt?: number;
                  lastPolledAt?: null | number;
                  pollingInterval?: null | number;
                  scope?: null | string;
                  status?: string;
                  userCode?: string;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "deviceCode"
                    | "userCode"
                    | "userId"
                    | "expiresAt"
                    | "status"
                    | "lastPolledAt"
                    | "pollingInterval"
                    | "clientId"
                    | "scope"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "organization";
                update: {
                  createdAt?: number;
                  currentKeyVersion?: number;
                  isFreeWithProPlan?: boolean;
                  logo?: null | string;
                  metadata?: null | string;
                  name?: string;
                  ownerId?: string;
                  paymentExpiresAt?: null | number;
                  paymentLapsedAt?: null | number;
                  paymentLapsedEmailSent?: null | boolean;
                  slug?: null | string;
                  subscriptionStatus?: string;
                  suspendedAt?: null | number;
                  suspendedEmailSent?: null | boolean;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "slug"
                    | "logo"
                    | "createdAt"
                    | "metadata"
                    | "ownerId"
                    | "isFreeWithProPlan"
                    | "currentKeyVersion"
                    | "subscriptionStatus"
                    | "paymentExpiresAt"
                    | "paymentLapsedAt"
                    | "paymentLapsedEmailSent"
                    | "suspendedAt"
                    | "suspendedEmailSent"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "member";
                update: {
                  createdAt?: number;
                  grantedBy?: string;
                  isPending?: boolean;
                  keyVersion?: null | number;
                  organizationId?: string;
                  revocationReason?: null | string;
                  revokedAt?: null | number;
                  revokedBy?: null | string;
                  role?: string;
                  userId?: string;
                  wrappedOrgKey?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "userId"
                    | "role"
                    | "createdAt"
                    | "wrappedOrgKey"
                    | "keyVersion"
                    | "grantedBy"
                    | "revokedAt"
                    | "revokedBy"
                    | "revocationReason"
                    | "isPending"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "invitation";
                update: {
                  email?: string;
                  expiresAt?: number;
                  inviterId?: string;
                  organizationId?: string;
                  role?: string;
                  status?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "organizationId"
                    | "email"
                    | "role"
                    | "status"
                    | "expiresAt"
                    | "inviterId"
                    | "id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
        },
        any
      >;
    };
    deviceAuth: {
      approveDeviceCode: FunctionReference<
        "mutation",
        "internal",
        { userId: string; user_code: string },
        { success: boolean }
      >;
      denyDeviceCode: FunctionReference<
        "mutation",
        "internal",
        { user_code: string },
        { success: boolean }
      >;
      getDeviceCodeInfo: FunctionReference<
        "query",
        "internal",
        { user_code: string },
        null | {
          clientId?: string;
          scope?: string;
          status: string;
          userCode: string;
        }
      >;
      pollDeviceToken: FunctionReference<
        "mutation",
        "internal",
        { device_code: string },
        { expires_in: number; session_token: string; token_type: string }
      >;
      requestDeviceCode: FunctionReference<
        "mutation",
        "internal",
        { clientId?: string; scope?: string },
        {
          device_code: string;
          expires_in: number;
          interval: number;
          user_code: string;
          verification_uri: string;
          verification_uri_complete: string;
        }
      >;
    };
    invitation: {
      acceptOrCancelInvitation: FunctionReference<
        "mutation",
        "internal",
        {
          accepting: boolean;
          invitationId: string;
          inviteeEmail: string;
          inviteeId: string;
        },
        { expired: boolean; success: boolean }
      >;
      inviteMember: FunctionReference<
        "mutation",
        "internal",
        {
          email: string;
          inviterId: string;
          inviterRole: "owner" | "admin" | "member" | "viewer";
          organizationId: string;
          role: "admin" | "member" | "viewer";
          wrappedOrgKey: string;
        },
        { success: boolean }
      >;
    };
    member: {
      getMemberRole: FunctionReference<
        "query",
        "internal",
        { organizationId: string; userId: string },
        {
          role: null | "owner" | "admin" | "member" | "viewer";
          success: boolean;
        }
      >;
      getOrganizationMembers: FunctionReference<
        "query",
        "internal",
        { orgId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          grantedBy: string;
          isPending: boolean;
          keyVersion?: null | number;
          organizationId: string;
          revocationReason?: null | string;
          revokedAt?: null | number;
          revokedBy?: null | string;
          role: string;
          userId: string;
          wrappedOrgKey?: null | string;
        }>
      >;
      isOrganizationMember: FunctionReference<
        "query",
        "internal",
        { organizationId: string; userId: string },
        {
          isOrganizationMember: boolean;
          role?: "owner" | "admin" | "member" | "viewer";
          success: boolean;
        }
      >;
      leaveOrganization: FunctionReference<
        "mutation",
        "internal",
        { organizationId: string; userId: string },
        { success: boolean }
      >;
      removeMember: FunctionReference<
        "mutation",
        "internal",
        { fromId: string; organizationId: string; toId: string },
        { success: boolean }
      >;
      setMemberKey: FunctionReference<
        "mutation",
        "internal",
        { memberId: string; newKeyVersion: number; wrappedOrgKey: string },
        { success: boolean }
      >;
      updateMemberRole: FunctionReference<
        "mutation",
        "internal",
        {
          newRole: "admin" | "viewer" | "member";
          orgId: string;
          updateeId: string;
          updaterId: string;
        },
        { success: boolean }
      >;
    };
    organization: {
      activateOrganization: FunctionReference<
        "mutation",
        "internal",
        { organizationId: string },
        { success: boolean }
      >;
      createOrganization: FunctionReference<
        "mutation",
        "internal",
        {
          isFreeWithProPlan: boolean;
          name: string;
          ownerId: string;
          wrappedOrgKey: string;
        },
        {
          organizationId: string;
          paymentExpiresAt?: number;
          slug: string;
          subscriptionStatus: "active" | "pending";
          success: boolean;
        }
      >;
      deleteOrganization: FunctionReference<
        "mutation",
        "internal",
        { callerId: string; organizationId: string },
        { success: boolean }
      >;
      loadOrganizationById: FunctionReference<
        "query",
        "internal",
        { organizationId: string },
        null | {
          _creationTime: number;
          _id: string;
          createdAt: number;
          currentKeyVersion: number;
          isFreeWithProPlan: boolean;
          logo?: null | string;
          metadata?: null | string;
          name: string;
          ownerId: string;
          paymentExpiresAt?: null | number;
          paymentLapsedAt?: null | number;
          paymentLapsedEmailSent?: null | boolean;
          slug?: null | string;
          subscriptionStatus: string;
          suspendedAt?: null | number;
          suspendedEmailSent?: null | boolean;
        }
      >;
      loadOrganizationsByUserId: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          memberships: null | Array<{
            _creationTime: number;
            _id: string;
            createdAt: number;
            grantedBy: string;
            isPending: boolean;
            keyVersion?: null | number;
            organizationId: string;
            revocationReason?: null | string;
            revokedAt?: null | number;
            revokedBy?: null | string;
            role: string;
            userId: string;
            wrappedOrgKey?: null | string;
          }>;
          organizations: null | Array<{
            _creationTime: number;
            _id: string;
            createdAt: number;
            currentKeyVersion: number;
            isFreeWithProPlan: boolean;
            logo?: null | string;
            metadata?: null | string;
            name: string;
            ownerId: string;
            paymentExpiresAt?: null | number;
            paymentLapsedAt?: null | number;
            paymentLapsedEmailSent?: null | boolean;
            slug?: null | string;
            subscriptionStatus: string;
            suspendedAt?: null | number;
            suspendedEmailSent?: null | boolean;
          }>;
          success: boolean;
          totalOrganizations: number;
        }
      >;
      markOrganizationPaymentLapsed: FunctionReference<
        "mutation",
        "internal",
        { organizationId: string; paymentLapsedAt: number },
        { success: boolean }
      >;
      rotateKeys: FunctionReference<
        "mutation",
        "internal",
        {
          memberIds: Array<string>;
          newKeyVersion: number;
          orgId: string;
          wrappedOrgKeys: Array<string>;
        },
        { membersRewrapped: number; success: boolean }
      >;
      suspendOrganization: FunctionReference<
        "mutation",
        "internal",
        { organizationId: string },
        { success: boolean }
      >;
      wipeOrganization: FunctionReference<
        "mutation",
        "internal",
        { organizationId: string },
        { success: boolean }
      >;
    };
    user: {
      clearNeedsEncryptionForPersonalProjectSecrets: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        any
      >;
      downgradeToFree: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        {
          success: boolean;
          user: {
            _creationTime: number;
            _id: string;
            accessRestrictedEmailSent?: null | boolean;
            createdAt: number;
            email: string;
            emailVerified: boolean;
            encryptedPrivateKey?: null | string;
            freeOrganizationUsed: boolean;
            gracePeriodEmailSent?: null | boolean;
            hasPro: boolean;
            image?: null | string;
            keysUpdatedAt?: null | number;
            name: string;
            needsEncryptionForPersonalProjectSecrets?: null | boolean;
            planDowngradedAt?: null | number;
            publicKey?: null | string;
            salt?: null | string;
            updatedAt: number;
            userId?: null | string;
          };
        }
      >;
      loadUserById: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          _creationTime: number;
          _id: string;
          accessRestrictedEmailSent?: null | boolean;
          createdAt: number;
          email: string;
          emailVerified: boolean;
          encryptedPrivateKey?: null | string;
          freeOrganizationUsed: boolean;
          gracePeriodEmailSent?: null | boolean;
          hasPro: boolean;
          image?: null | string;
          keysUpdatedAt?: null | number;
          name: string;
          needsEncryptionForPersonalProjectSecrets?: null | boolean;
          planDowngradedAt?: null | number;
          publicKey?: null | string;
          salt?: null | string;
          updatedAt: number;
          userId?: null | string;
        }
      >;
      setKeysAndSalt: FunctionReference<
        "mutation",
        "internal",
        {
          encryptedPrivateKey: string;
          needsEncryptionForPersonalProjectSecrets?: null | boolean;
          publicKey: string;
          salt: string;
          userId: string;
        },
        { success: boolean }
      >;
      upgradeToPro: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        {
          success: boolean;
          user: {
            _creationTime: number;
            _id: string;
            accessRestrictedEmailSent?: null | boolean;
            createdAt: number;
            email: string;
            emailVerified: boolean;
            encryptedPrivateKey?: null | string;
            freeOrganizationUsed: boolean;
            gracePeriodEmailSent?: null | boolean;
            hasPro: boolean;
            image?: null | string;
            keysUpdatedAt?: null | number;
            name: string;
            needsEncryptionForPersonalProjectSecrets?: null | boolean;
            planDowngradedAt?: null | number;
            publicKey?: null | string;
            salt?: null | string;
            updatedAt: number;
            userId?: null | string;
          };
        }
      >;
      useFreeOrg: FunctionReference<
        "mutation",
        "internal",
        { userId: string },
        { success: boolean }
      >;
    };
  };
  autumn: {};
  rateLimiter: {
    lib: {
      checkRateLimit: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      clearAll: FunctionReference<
        "mutation",
        "internal",
        { before?: number },
        null
      >;
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
      getValue: FunctionReference<
        "query",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          key?: string;
          name: string;
          sampleShards?: number;
        },
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          shard: number;
          ts: number;
          value: number;
        }
      >;
      rateLimit: FunctionReference<
        "mutation",
        "internal",
        {
          config:
            | {
                capacity?: number;
                kind: "token bucket";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: null;
              }
            | {
                capacity?: number;
                kind: "fixed window";
                maxReserved?: number;
                period: number;
                rate: number;
                shards?: number;
                start?: number;
              };
          count?: number;
          key?: string;
          name: string;
          reserve?: boolean;
          throws?: boolean;
        },
        { ok: true; retryAfter?: number } | { ok: false; retryAfter: number }
      >;
      resetRateLimit: FunctionReference<
        "mutation",
        "internal",
        { key?: string; name: string },
        null
      >;
    };
    time: {
      getServerTime: FunctionReference<"mutation", "internal", {}, number>;
    };
  };
};
