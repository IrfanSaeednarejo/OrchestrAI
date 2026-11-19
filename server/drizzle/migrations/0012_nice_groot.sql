CREATE TYPE "public"."knowledge_doc_status" AS ENUM('active', 'superseded', 'draft', 'archived');--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"domain" "knowledge_domain" NOT NULL,
	"topic" text NOT NULL,
	"section_path" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(768),
	"search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("section_path", '') || ' ' || "content")) STORED,
	"status" "knowledge_doc_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_doc_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" text NOT NULL,
	"domain" "knowledge_domain" NOT NULL,
	"topic" text NOT NULL,
	"document_type" text NOT NULL,
	"version" text NOT NULL,
	"effective_date" timestamp with time zone NOT NULL,
	"file_hash" text NOT NULL,
	"status" "knowledge_doc_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_version_id_knowledge_doc_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."knowledge_doc_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_embedding_hnsw" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_search_vector_gin" ON "knowledge_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "idx_knowledge_chunks_scope_section" ON "knowledge_chunks" USING btree ("domain","topic","status","section_path");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_doc_versions_doc_id_version_idx" ON "knowledge_doc_versions" USING btree ("doc_id","version");--> statement-breakpoint
CREATE INDEX "knowledge_doc_versions_domain_topic_status_idx" ON "knowledge_doc_versions" USING btree ("domain","topic","status");