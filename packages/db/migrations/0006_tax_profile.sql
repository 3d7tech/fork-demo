CREATE TABLE "tax_profile" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"tax_region" text,
	"student_loans" text,
	"variable_pay" numeric(12, 2),
	"other_income" numeric(12, 2),
	"child_benefit_children" integer,
	"higher_earner" boolean,
	"other_pension_savings" numeric(12, 2),
	"flexibly_accessed" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pay_record" ADD COLUMN "tax_code" text;--> statement-breakpoint
ALTER TABLE "pay_record" ADD COLUMN "student_loans" text;--> statement-breakpoint
ALTER TABLE "tax_profile" ADD CONSTRAINT "tax_profile_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profile" ADD CONSTRAINT "tax_profile_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;