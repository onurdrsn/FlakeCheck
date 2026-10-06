ALTER TABLE "auth_codes" ADD COLUMN "failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "auth_codes_lock_idx" ON "auth_codes" USING btree ("locked_until");