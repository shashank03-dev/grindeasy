CREATE TABLE "slack_connections" (
	"agent_code" text PRIMARY KEY NOT NULL,
	"state_code" text NOT NULL,
	"webhook_url" text,
	"channel" text,
	"team_name" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "slack_connections_state_code_unique" UNIQUE("state_code")
);
--> statement-breakpoint
CREATE INDEX "slack_connections_state_code_idx" ON "slack_connections" USING btree ("state_code");