ALTER TABLE "replies" ADD COLUMN "moderation_status" text;--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "moderation_status" text;--> statement-breakpoint
UPDATE "replies" SET "moderation_status" = 'approved' WHERE "moderation_status" IS NULL;--> statement-breakpoint
UPDATE "threads" SET "moderation_status" = 'approved' WHERE "moderation_status" IS NULL;--> statement-breakpoint
ALTER TABLE "replies" ALTER COLUMN "moderation_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "moderation_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "replies" ALTER COLUMN "moderation_status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "threads" ALTER COLUMN "moderation_status" SET NOT NULL;