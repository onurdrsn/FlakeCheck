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
  quarantineOwner: text('quarantine_owner'),
  quarantineMode: text('quarantine_mode').default('manual').notNull(),
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
  flakinessScore: integer('flakiness_score').default(0).notNull(),
  flipRateBps: integer('flip_rate_bps').default(0).notNull(),
  confidenceLowBps: integer('confidence_low_bps').default(0).notNull(),
  confidenceHighBps: integer('confidence_high_bps').default(0).notNull(),
  sampleSize: integer('sample_size').default(0).notNull(),
  rootCause: text('root_cause').default('unknown').notNull(),
  remediation: text('remediation'),
  evidence: jsonb('evidence').notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('classification_test_run_idx').on(table.testId, table.runId),
  index('classification_category_idx').on(table.category),
  index('classification_score_idx').on(table.flakinessScore),
  index('classification_root_cause_idx').on(table.rootCause),
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
  name: text('name').default('default').notNull(),
  tokenDigest: text('token_digest').notNull(),
  scopes: jsonb('scopes').$type<string[]>().default(['ingest', 'read', 'quarantine']).notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
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
  role: text('role').default('owner').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('repository_access_user_repo_idx').on(table.userId, table.repo),
  index('repository_access_repo_idx').on(table.repo),
]);

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('organizations_slug_idx').on(table.slug),
]);

export const organizationMembers = pgTable('organization_members', {
  id: text('id').primaryKey(),
  orgId: text('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').default('member').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('org_members_org_user_idx').on(table.orgId, table.userId),
  index('org_members_user_idx').on(table.userId),
]);

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  orgId: text('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  repo: text('repo').notNull(),
  displayName: text('display_name'),
  team: text('team').default('core').notNull(),
  publicBadge: boolean('public_badge').default(false).notNull(),
  retentionDays: integer('retention_days').default(90).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('projects_repo_idx').on(table.repo),
  index('projects_org_idx').on(table.orgId),
]);

export const quarantinePolicies = pgTable('quarantine_policies', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  flakinessScoreThreshold: integer('flakiness_score_threshold').default(60).notNull(),
  minFlipCount: integer('min_flip_count').default(2).notNull(),
  minSampleSize: integer('min_sample_size').default(5).notNull(),
  autoGraduatePasses: integer('auto_graduate_passes').default(10).notNull(),
  nonBlockingMode: boolean('non_blocking_mode').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('quarantine_policies_repo_idx').on(table.repo),
]);

export const quarantineHistory = pgTable('quarantine_history', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  testId: text('test_id').references(() => tests.id, { onDelete: 'cascade' }).notNull(),
  action: text('action').notNull(),
  mode: text('mode').default('manual').notNull(),
  actor: text('actor').notNull(),
  owner: text('owner'),
  reason: text('reason'),
  flakinessScore: integer('flakiness_score'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('quarantine_history_repo_idx').on(table.repo),
  index('quarantine_history_test_idx').on(table.testId),
  index('quarantine_history_created_idx').on(table.createdAt),
]);

export const notificationPreferences = pgTable('notification_preferences', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),
  target: text('target').notNull(),
  signingSecret: text('signing_secret'),
  events: jsonb('events').$type<string[]>().default(['PROVEN_FLAKE_DETECTED', 'AUTO_QUARANTINED', 'AUTO_GRADUATED']).notNull(),
  digestFrequency: text('digest_frequency').default('realtime').notNull(),
  dedupWindowMinutes: integer('dedup_window_minutes').default(60).notNull(),
  rateLimitPerHour: integer('rate_limit_per_hour').default(20).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notification_prefs_repo_idx').on(table.repo),
  index('notification_prefs_user_idx').on(table.userId),
]);

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  channel: text('channel').notNull(),
  eventType: text('event_type').notNull(),
  dedupKey: text('dedup_key').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notification_deliveries_repo_idx').on(table.repo),
  index('notification_deliveries_dedup_idx').on(table.dedupKey, table.createdAt),
]);

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  orgId: text('org_id').references(() => organizations.id, { onDelete: 'set null' }),
  repo: text('repo'),
  actorId: text('actor_id').notNull(),
  actorType: text('actor_type').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  metadata: jsonb('metadata').default({}).notNull(),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_logs_repo_idx').on(table.repo),
  index('audit_logs_actor_idx').on(table.actorId),
  index('audit_logs_created_idx').on(table.createdAt),
]);

export const issueTrackerConfigs = pgTable('issue_tracker_configs', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  provider: text('provider').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('issue_tracker_repo_provider_idx').on(table.repo, table.provider),
]);

export const trackedIssues = pgTable('tracked_issues', {
  id: text('id').primaryKey(),
  repo: text('repo').notNull(),
  testId: text('test_id').references(() => tests.id, { onDelete: 'cascade' }).notNull(),
  provider: text('provider').notNull(),
  externalIssueId: text('external_issue_id').notNull(),
  externalIssueUrl: text('external_issue_url').notNull(),
  status: text('status').default('open').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('tracked_issues_test_provider_idx').on(table.testId, table.provider),
  index('tracked_issues_repo_idx').on(table.repo),
]);

export const ingestIdempotency = pgTable('ingest_idempotency', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  repo: text('repo').notNull(),
  runId: text('run_id').notNull(),
  response: jsonb('response').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ingest_idempotency_repo_idx').on(table.repo),
  index('ingest_idempotency_created_idx').on(table.createdAt),
]);
