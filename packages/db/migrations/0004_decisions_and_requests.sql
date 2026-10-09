CREATE TYPE "public"."request_status" AS ENUM('draft', 'sent', 'acknowledged', 'done', 'declined');--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'accountant';--> statement-breakpoint
CREATE TABLE "accountant_access" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"run_id" uuid,
	"audience" text NOT NULL,
	"kind" text NOT NULL,
	"family" text,
	"summary" text NOT NULL,
	"figures" jsonb,
	"status" "request_status" DEFAULT 'sent' NOT NULL,
	"accountant_note" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"employee_id" uuid,
	"audience" text NOT NULL,
	"family" text,
	"kind" text NOT NULL,
	"question" text NOT NULL,
	"answer" jsonb NOT NULL,
	"rule_pack" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"title" text NOT NULL,
	"watched" jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"change_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accountant_access" ADD CONSTRAINT "accountant_access_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_access" ADD CONSTRAINT "accountant_access_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "action_request_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "action_request_created_by_app_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_request" ADD CONSTRAINT "action_request_run_id_decision_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."decision_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_run" ADD CONSTRAINT "decision_run_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_run" ADD CONSTRAINT "decision_run_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_run" ADD CONSTRAINT "decision_run_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_decision" ADD CONSTRAINT "saved_decision_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_decision" ADD CONSTRAINT "saved_decision_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_decision" ADD CONSTRAINT "saved_decision_run_id_decision_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."decision_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accountant_access_key" ON "accountant_access" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "action_request_company_idx" ON "action_request" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "decision_run_user_idx" ON "decision_run" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "decision_run_topics_idx" ON "decision_run" USING btree ("company_id","audience","family","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_decision_run_key" ON "saved_decision" USING btree ("run_id");