export enum InvitationStatus {
  Pending = "pending",
  Accepted = "accepted",
  Canceled = "canceled",
  Expired = "expired",
}

export enum OrgRole {
  Owner = "owner",
  Admin = "admin",
  Member = "member",
  Viewer = "viewer",
}

export enum ErrorSeverity {
  High = "high",
  Medium = "medium",
  Low = "low",
}

export enum OrgSubscriptionStatus {
  Active = "active",
  Pending = "pending",
  PaymentLapsed = "payment_lapsed",
  Suspended = "suspended",
}

export enum OrgEmailType {
  PaymentLapsed = "payment_lapsed",
  Suspended = "suspended",
}

export enum MembershipRevocationReason {
  Removed = "removed",
  Left = "left",
}
