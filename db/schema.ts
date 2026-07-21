import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Auth.js official D1 adapter tables. Column names intentionally match the
// adapter's SQL, including camel-cased userId/sessionToken fields.
export const users = sqliteTable("users", {
  id: text("id").primaryKey().notNull(),
  name: text("name"),
  email: text("email"),
  emailVerified: text("emailVerified"),
  image: text("image"),
  createdAt: text("created_at"),
  lastLoginAt: text("last_login_at"),
  loginCount: integer("login_count").notNull().default(0),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  disabledAt: text("disabled_at"),
  disabledByUserId: text("disabled_by_user_id"),
  disabledReason: text("disabled_reason"),
}, table => [uniqueIndex("users_email_unique").on(table.email)]);

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId").notNull(),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
  oauthTokenSecret: text("oauth_token_secret"),
  oauthToken: text("oauth_token"),
}, table => [
  uniqueIndex("accounts_provider_account_unique").on(table.provider, table.providerAccountId),
  index("accounts_user_id_idx").on(table.userId),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").notNull(),
  sessionToken: text("sessionToken").primaryKey().notNull(),
  userId: text("userId").notNull(),
  expires: text("expires").notNull(),
}, table => [
  index("sessions_user_id_idx").on(table.userId),
  index("sessions_expires_idx").on(table.expires),
]);

export const verificationTokens = sqliteTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").primaryKey().notNull(),
  expires: text("expires").notNull(),
});

export const families = sqliteTable("families", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  legacyState: integer("legacy_state").notNull().default(0),
  claimedByUserId: text("claimed_by_user_id"),
  claimedAt: text("claimed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  createdByUserId: text("created_by_user_id"),
  lastActivityAt: text("last_activity_at"),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  isTest: integer("is_test", { mode: "boolean" }).notNull().default(false),
  disabledAt: text("disabled_at"),
  disabledByUserId: text("disabled_by_user_id"),
  disabledReason: text("disabled_reason"),
});

export const familyMembers = sqliteTable("family_members", {
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "parent", "child"] }).notNull(),
  childId: text("child_id"),
  childAccountMode: text("child_account_mode", { enum: ["personal", "shared"] }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
}, table => [
  primaryKey({ columns: [table.familyId, table.userId] }),
  uniqueIndex("family_members_user_unique").on(table.userId),
  uniqueIndex("family_members_child_binding_unique").on(table.familyId, table.childId)
    .where(sql`${table.role} = 'child' AND ${table.childId} IS NOT NULL AND ${table.status} = 'active'`),
  index("family_members_family_id_idx").on(table.familyId),
]);

export const familyInvitations = sqliteTable("family_invitations", {
  id: text("id").primaryKey().notNull(),
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  role: text("role", { enum: ["parent", "child"] }).notNull(),
  childId: text("child_id"),
  childAccountMode: text("child_account_mode", { enum: ["personal", "shared"] }),
  childPermissionsJson: text("child_permissions_json"),
  status: text("status", { enum: ["pending", "accepted", "expired", "cancelled"] }).notNull().default("pending"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  acceptedAt: text("accepted_at"),
  acceptedByUserId: text("accepted_by_user_id").references(() => users.id),
  cancelledAt: text("cancelled_at"),
}, table => [
  uniqueIndex("family_invitations_token_hash_unique").on(table.tokenHash),
  index("family_invitations_family_status_idx").on(table.familyId, table.status, table.expiresAt),
  index("family_invitations_child_idx").on(table.familyId, table.childId),
  uniqueIndex("family_invitations_pending_child_unique").on(table.familyId, table.childId)
    .where(sql`${table.role} = 'child' AND ${table.status} = 'pending' AND ${table.childId} IS NOT NULL`),
]);

export const memberChildPermissions = sqliteTable("member_child_permissions", {
  familyId: text("family_id").notNull(),
  userId: text("user_id").notNull(),
  childId: text("child_id").notNull(),
  canView: integer("can_view", { mode: "boolean" }).notNull().default(false),
  canOperate: integer("can_operate", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [
  primaryKey({ columns: [table.familyId, table.userId, table.childId] }),
  index("member_child_permissions_user_idx").on(table.userId),
  index("member_child_permissions_child_idx").on(table.familyId, table.childId),
]);

export const familyState = sqliteTable("family_state", {
  familyId: text("family_id").primaryKey().notNull().references(() => families.id, { onDelete: "cascade" }),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const mediaObjects = sqliteTable("media_objects", {
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  kind: text("kind", { enum: ["avatars", "rewards"] }).notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  contentType: text("content_type"),
}, table => [
  primaryKey({ columns: [table.familyId, table.objectKey] }),
  index("media_objects_key_idx").on(table.objectKey),
]);

// Family deletion audits intentionally do not reference users or families.
// They must survive after the family is permanently removed.
export const familyDeletionAudit = sqliteTable("family_deletion_audit", {
  id: text("id").primaryKey().notNull(),
  action: text("action", { enum: ["delete_family"] }).notNull(),
  actorUserId: text("actor_user_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  familyId: text("family_id").notNull(),
  familyName: text("family_name").notNull(),
  deletedAt: text("deleted_at").notNull(),
  summaryJson: text("summary_json").notNull(),
  r2CleanupStatus: text("r2_cleanup_status", { enum: ["pending", "complete", "partial"] }).notNull().default("pending"),
  r2FailedKeysJson: text("r2_failed_keys_json"),
  cleanupUpdatedAt: text("cleanup_updated_at"),
}, table => [
  index("family_deletion_audit_family_idx").on(table.familyId, table.deletedAt),
  index("family_deletion_audit_actor_idx").on(table.actorUserId, table.deletedAt),
]);

export const appMigrations = sqliteTable("app_migrations", {
  version: text("version").primaryKey().notNull(),
  appliedAt: text("applied_at").notNull(),
});

export const userDailyActivity = sqliteTable("user_daily_activity", {
  activityDate: text("activity_date").notNull(),
  userId: text("user_id").notNull(),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  requestCount: integer("request_count").notNull().default(1),
}, table => [
  primaryKey({ columns: [table.activityDate, table.userId] }),
  index("user_daily_activity_user_idx").on(table.userId, table.activityDate),
]);

export const featureUsageEvents = sqliteTable("feature_usage_events", {
  id: text("id").primaryKey().notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  dayKey: text("day_key").notNull(),
  familyId: text("family_id"),
  userId: text("user_id"),
  amount: integer("amount"),
  quantity: integer("quantity").notNull().default(1),
  source: text("source"),
  dedupeKey: text("dedupe_key"),
  metadataJson: text("metadata_json"),
}, table => [
  index("feature_usage_events_day_type_idx").on(table.dayKey, table.eventType),
  index("feature_usage_events_family_day_idx").on(table.familyId, table.dayKey),
  uniqueIndex("feature_usage_events_dedupe_unique").on(table.dedupeKey),
]);

export const systemErrorLogs = sqliteTable("system_error_logs", {
  id: text("id").primaryKey().notNull(),
  category: text("category").notNull(),
  errorCode: text("error_code"),
  message: text("message").notNull(),
  route: text("route"),
  method: text("method"),
  statusCode: integer("status_code"),
  familyId: text("family_id"),
  userId: text("user_id"),
  requestId: text("request_id"),
  metadataJson: text("metadata_json"),
  occurredAt: text("occurred_at").notNull(),
  resolvedAt: text("resolved_at"),
}, table => [
  index("system_error_logs_time_idx").on(table.occurredAt),
  index("system_error_logs_category_idx").on(table.category, table.occurredAt),
]);

export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: text("id").primaryKey().notNull(),
  adminUserId: text("admin_user_id").notNull(),
  actionType: text("action_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeData: text("before_data"),
  afterData: text("after_data"),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  requestId: text("request_id"),
  resultStatus: text("result_status").notNull().default("success"),
}, table => [
  index("admin_audit_logs_created_idx").on(table.createdAt),
  index("admin_audit_logs_target_idx").on(table.targetType, table.targetId),
]);

export const supportAccessGrants = sqliteTable("support_access_grants", {
  id: text("id").primaryKey().notNull(),
  familyId: text("family_id").notNull(),
  grantedByUserId: text("granted_by_user_id").notNull(),
  grantedToAdminUserId: text("granted_to_admin_user_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
}, table => [
  index("support_access_grants_family_idx").on(table.familyId, table.expiresAt),
]);

export const resourceMetricSnapshots = sqliteTable("resource_metric_snapshots", {
  id: text("id").primaryKey().notNull(),
  capturedAt: text("captured_at").notNull(),
  dayKey: text("day_key").notNull(),
  metricName: text("metric_name").notNull(),
  metricValue: integer("metric_value").notNull(),
  source: text("source").notNull().default("application"),
  metadataJson: text("metadata_json"),
}, table => [
  index("resource_metric_snapshots_day_idx").on(table.dayKey, table.metricName),
]);

// Preserved only for rollback and legacy-data copy. New application requests
// never read or write this table after migration 0002.
export const appState = sqliteTable("app_state", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// These early prototype tables were never used by the current API. They remain
// declared so a future cleanup migration can make an explicit decision.
export const children = sqliteTable("children", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  familyId: text("family_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
export const starEntries = sqliteTable("star_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id").notNull(),
  amount: integer("amount").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  note: text("note"),
  imageKey: text("image_key"),
  author: text("author").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
export const rewards = sqliteTable("rewards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  familyId: text("family_id").notNull(),
  name: text("name").notNull(),
  cost: integer("cost").notNull(),
  emoji: text("emoji").notNull(),
});
export const redemptions = sqliteTable("redemptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id").notNull(),
  rewardId: integer("reward_id").notNull(),
  cost: integer("cost").notNull(),
  approvedBy: text("approved_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
