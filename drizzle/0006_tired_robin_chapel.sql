CREATE TABLE "cron_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"period_key" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"cursor" text,
	"processed_count" integer DEFAULT 0 NOT NULL,
	"affected_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cron_runs_job_period_dry_idx" ON "cron_runs" USING btree ("job_type","period_key","dry_run");--> statement-breakpoint
CREATE INDEX "cron_runs_status_idx" ON "cron_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cron_runs_started_idx" ON "cron_runs" USING btree ("started_at");