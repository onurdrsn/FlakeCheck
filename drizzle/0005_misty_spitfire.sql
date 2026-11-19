CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text,
	"actor_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_idempotency" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"run_id" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_tracker_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"channel" text NOT NULL,
	"event_type" text NOT NULL,
	"dedup_key" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"user_id" text,
	"channel" text NOT NULL,
	"target" text NOT NULL,
	"signing_secret" text,
	"events" jsonb DEFAULT '["PROVEN_FLAKE_DETECTED","AUTO_QUARANTINED","AUTO_GRADUATED"]'::jsonb NOT NULL,
	"digest_frequency" text DEFAULT 'realtime' NOT NULL,
	"dedup_window_minutes" integer DEFAULT 60 NOT NULL,
	"rate_limit_per_hour" integer DEFAULT 20 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"display_name" text,
	"team" text DEFAULT 'core' NOT NULL,
	"public_badge" boolean DEFAULT false NOT NULL,
	"retention_days" integer DEFAULT 90 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarantine_history" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"test_id" text NOT NULL,
	"action" text NOT NULL,
	"mode" text DEFAULT 'manual' NOT NULL,
	"actor" text NOT NULL,
	"owner" text,
	"reason" text,
	"flakiness_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarantine_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"flakiness_score_threshold" integer DEFAULT 60 NOT NULL,
	"min_flip_count" integer DEFAULT 2 NOT NULL,
	"min_sample_size" integer DEFAULT 5 NOT NULL,
	"auto_graduate_passes" integer DEFAULT 10 NOT NULL,
	"non_blocking_mode" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracked_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"test_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_issue_id" text NOT NULL,
	"external_issue_url" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "flakiness_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "flip_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "confidence_low_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "confidence_high_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "sample_size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "root_cause" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "classifications" ADD COLUMN "remediation" text;--> statement-breakpoint
ALTER TABLE "project_tokens" ADD COLUMN "name" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "project_tokens" ADD COLUMN "scopes" jsonb DEFAULT '["ingest","read","quarantine"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_tokens" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_tokens" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repository_access" ADD COLUMN "role" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "quarantine_owner" text;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "quarantine_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine_history" ADD CONSTRAINT "quarantine_history_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_issues" ADD CONSTRAINT "tracked_issues_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_repo_idx" ON "audit_logs" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ingest_idempotency_repo_idx" ON "ingest_idempotency" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "ingest_idempotency_created_idx" ON "ingest_idempotency" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_tracker_repo_provider_idx" ON "issue_tracker_configs" USING btree ("repo","provider");--> statement-breakpoint
CREATE INDEX "notification_deliveries_repo_idx" ON "notification_deliveries" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "notification_deliveries_dedup_idx" ON "notification_deliveries" USING btree ("dedup_key","created_at");--> statement-breakpoint
CREATE INDEX "notification_prefs_repo_idx" ON "notification_preferences" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "notification_prefs_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_user_idx" ON "organization_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_repo_idx" ON "projects" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "projects_org_idx" ON "projects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "quarantine_history_repo_idx" ON "quarantine_history" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "quarantine_history_test_idx" ON "quarantine_history" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "quarantine_history_created_idx" ON "quarantine_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quarantine_policies_repo_idx" ON "quarantine_policies" USING btree ("repo");--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_issues_test_provider_idx" ON "tracked_issues" USING btree ("test_id","provider");--> statement-breakpoint
CREATE INDEX "tracked_issues_repo_idx" ON "tracked_issues" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "classification_score_idx" ON "classifications" USING btree ("flakiness_score");--> statement-breakpoint
CREATE INDEX "classification_root_cause_idx" ON "classifications" USING btree ("root_cause");