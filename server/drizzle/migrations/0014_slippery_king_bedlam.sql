ALTER TABLE "knowledge_chunks" ADD COLUMN "chunk_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "knowledge_chunks" SET "chunk_key" = LPAD(("chunk_index" + 1)::text, 2, '0') WHERE "chunk_key" = '';--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ALTER COLUMN "chunk_key" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_chunks_version_chunk_key_active_unique" ON "knowledge_chunks" USING btree ("version_id","chunk_key") WHERE status = 'active';