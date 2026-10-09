ALTER TABLE "policy_document" ADD COLUMN "instructions_found" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_fact" ADD COLUMN "quote" text;