import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  project: ["create", "read", "update", "delete"],
  environment: ["create", "read", "update", "delete"],
  folder: ["create", "read", "update", "delete"],
  secret: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const viewer = ac.newRole({
  organization: [],
  invitation: [],
  member: [],
  project: ["read"],
  environment: ["read"],
  folder: ["read"],
  secret: ["read"],
});

export const member = ac.newRole({
  organization: [],
  invitation: [],
  member: [],
  project: ["read"],
  environment: ["read"],
  folder: ["create", "read", "update", "delete"],
  secret: ["create", "read", "update", "delete"],
});

export const admin = ac.newRole({
  organization: ["update"],
  invitation: ["create", "cancel"],
  member: ["create"],
  project: ["create", "read", "update", "delete"],
  environment: ["create", "read", "update", "delete"],
  folder: ["create", "read", "update", "delete"],
  secret: ["create", "read", "update", "delete"],
});

export const owner = ac.newRole({
  organization: ["update", "delete"],
  invitation: ["create", "cancel"],
  member: ["create", "update", "delete"],
  project: ["create", "read", "update", "delete"],
  environment: ["create", "read", "update", "delete"],
  folder: ["create", "read", "update", "delete"],
  secret: ["create", "read", "update", "delete"],
});

export enum OrgRole {
  Owner = "owner",
  Admin = "admin",
  Member = "member",
  Viewer = "viewer",
}
