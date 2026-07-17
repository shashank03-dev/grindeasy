CREATE TABLE "daily_combos" (
	"user_id" integer NOT NULL,
	"day" text NOT NULL,
	"combos" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_combos_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "daily_tool_totals" (
	"user_id" integer NOT NULL,
	"day" text NOT NULL,
	"tool_id" text NOT NULL,
	"active_ms" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_tool_totals_user_id_day_tool_id_pk" PRIMARY KEY("user_id","day","tool_id")
);
--> statement-breakpoint
ALTER TABLE "daily_combos" ADD CONSTRAINT "daily_combos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_tool_totals" ADD CONSTRAINT "daily_tool_totals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_combos_day_idx" ON "daily_combos" USING btree ("day");--> statement-breakpoint
CREATE INDEX "daily_tool_totals_day_idx" ON "daily_tool_totals" USING btree ("day");