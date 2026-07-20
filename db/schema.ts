import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Auth.js official D1 adapter tables. Column names intentionally match the
// adapter's SQL, including camel-cased userId/sessionToken fields.
export const users = sqliteTable("users", {
  id: text("id").primaryKey().notNull(),
  name: text("name"),
  email: text("email"),
  emailVerified: text("emailVerified"),
  image: text("image"),
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
});

export const familyMembers = sqliteTable("family_members", {
  familyId: text("family_id").notNull().references(() => families.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "parent", "viewer"] }).notNull(),
  createdAt: text("created_at").notNull(),
}, table => [
  primaryKey({ columns: [table.familyId, table.userId] }),
  index("family_members_user_id_idx").on(table.userId),
  index("family_members_family_id_idx").on(table.familyId),
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
}, table => [
  primaryKey({ columns: [table.familyId, table.objectKey] }),
  index("media_objects_key_idx").on(table.objectKey),
]);

export const appMigrations = sqliteTable("app_migrations", {
  version: text("version").primaryKey().notNull(),
  appliedAt: text("applied_at").notNull(),
});

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
