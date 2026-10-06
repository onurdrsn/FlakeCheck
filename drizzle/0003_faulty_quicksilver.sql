CREATE TABLE "project_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"repo" text NOT NULL,
	"token_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_tokens" ADD CONSTRAINT "project_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_tokens_repo_digest_idx" ON "project_tokens" USING btree ("repo","token_digest");--> statement-breakpoint
CREATE INDEX "project_tokens_repo_idx" ON "project_tokens" USING btree ("repo");--> statement-breakpoint
CREATE INDEX "project_tokens_creator_idx" ON "project_tokens" USING btree ("created_by");