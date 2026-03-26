CREATE TABLE "agent_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_name" text NOT NULL,
	"event_type" text NOT NULL,
	"endpoint" text NOT NULL,
	"status_code" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_agent_events_created_at" ON "agent_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_events_agent_created" ON "agent_events" USING btree ("agent_name","created_at");