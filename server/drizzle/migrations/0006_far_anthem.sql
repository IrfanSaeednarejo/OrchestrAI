CREATE TYPE "public"."knowledge_domain" AS ENUM('orders', 'payments', 'account');--> statement-breakpoint
CREATE TABLE "knowledge_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain" "knowledge_domain" NOT NULL,
	"document_type" text NOT NULL,
	"topic" text NOT NULL,
	"version" text NOT NULL,
	"effective_date" timestamp NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "knowledge_documents_domain_idx" ON "knowledge_documents" USING btree ("domain");