import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  branch: text('branch').notNull(),
  commitSha: text('commit_sha').notNull(),
  ciWorkflow: text('ci_workflow').notNull(),
  envFingerprint: text('env_fingerprint').notNull(),
  setupDurationMs: integer('setup_duration_ms').default(0).notNull(),
  durationMs: integer('duration_ms').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('runs_created_at_idx').on(table.createdAt),
  index('runs_commit_env_idx').on(table.commitSha, table.envFingerprint),
]);

export const tests = pgTable('tests', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  filePath: text('file_path').notNull(),
  suiteName: text('suite_name').notNull(),
  testName: text('test_name').notNull(),
  isQuarantined: boolean('is_quarantined').default(false).notNull(),
  quarantinedAt: timestamp('quarantined_at', { withTimezone: true }),
  quarantineReason: text('quarantine_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('tests_repo_idx').on(table.repo),
  index('tests_quarantine_idx').on(table.isQuarantined),
]);

export const testAttempts = pgTable('test_attempts', {
  id: text('id').primaryKey(),
  runId: text('run_id').references(() => runs.id, { onDelete: 'cascade' }).notNull(),
  testId: text('test_id').references(() => tests.id, { onDelete: 'cascade' }).notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  status: text('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  failureSignature: text('failure_signature'),
  rawError: text('raw_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('attempt_unique_idx').on(table.runId, table.testId, table.attemptNumber),
  index('attempt_run_test_idx').on(table.runId, table.testId),
  index('attempt_test_idx').on(table.testId),
  index('attempt_signature_idx').on(table.failureSignature),
]);

export const classifications = pgTable('classifications', {
  id: text('id').primaryKey(),
  testId: text('test_id').references(() => tests.id, { onDelete: 'cascade' }).notNull(),
  runId: text('run_id').references(() => runs.id, { onDelete: 'cascade' }).notNull(),
  category: text('category').notNull(),
  confidence: integer('confidence').notNull(),
  evidence: jsonb('evidence').notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('classification_test_run_idx').on(table.testId, table.runId),
  index('classification_category_idx').on(table.category),
]);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  locale: text('locale').default('en').notNull(),
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
]);

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: text('token_hash').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
  index('sessions_user_idx').on(table.userId),
  index('sessions_expiry_idx').on(table.expiresAt),
]);

export const authCodes = pgTable('auth_codes', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  codeSalt: text('code_salt').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  failedAttempts: integer('failed_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('auth_codes_email_idx').on(table.email),
  index('auth_codes_expiry_idx').on(table.expiresAt),
  index('auth_codes_lock_idx').on(table.lockedUntil),
  uniqueIndex('auth_codes_active_email_idx').on(table.email, table.usedAt),
]);

export const oauthAccounts = pgTable('oauth_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  accessToken: text('access_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('oauth_provider_account_idx').on(table.provider, table.providerAccountId),
  index('oauth_user_idx').on(table.userId),
]);

export const webhookConfigs = pgTable('webhook_configs', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  provider: text('provider').notNull(),
  url: text('url').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('webhook_repo_idx').on(table.repo),
  uniqueIndex('webhook_repo_provider_idx').on(table.repo, table.provider),
]);

export const projectTokens = pgTable('project_tokens', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  tokenDigest: text('token_digest').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('project_tokens_repo_digest_idx').on(table.repo, table.tokenDigest),
  index('project_tokens_repo_idx').on(table.repo),
  index('project_tokens_creator_idx').on(table.createdBy),
]);

export const repositoryAccess = pgTable('repository_access', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  repo: text('repo').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('repository_access_user_repo_idx').on(table.userId, table.repo),
  index('repository_access_repo_idx').on(table.repo),
]);
