ALTER TABLE "api_tokens" ADD COLUMN "github_id" text;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "github_username" text;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "github_avatar_url" text;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_github_id_unique" UNIQUE("github_id");