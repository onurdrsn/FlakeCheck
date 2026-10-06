CREATE TABLE "repository_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repo" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_access" ADD CONSTRAINT "repository_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repository_access_user_repo_idx" ON "repository_access" USING btree ("user_id","repo");--> statement-breakpoint
CREATE INDEX "repository_access_repo_idx" ON "repository_access" USING btree ("repo");