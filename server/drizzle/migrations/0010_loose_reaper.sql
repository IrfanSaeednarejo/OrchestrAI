CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"node" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"duration_ms" integer NOT NULL,
	"attempts" integer NOT NULL,
	"status" "execution_status" NOT NULL,
	"error_kind" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retrieval_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"agent_execution_id" uuid,
	"domain" text NOT NULL,
	"topic" text,
	"embed_ms" integer NOT NULL,
	"search_ms" integer NOT NULL,
	"result_count" integer NOT NULL,
	"top_similarity" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routing_history" ADD COLUMN "routing_path" text;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_executions" ADD CONSTRAINT "retrieval_executions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_executions" ADD CONSTRAINT "retrieval_executions_agent_execution_id_agent_executions_id_fk" FOREIGN KEY ("agent_execution_id") REFERENCES "public"."agent_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_conversation_id_idx" ON "llm_calls" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "llm_calls_node_idx" ON "llm_calls" USING btree ("node");--> statement-breakpoint
CREATE INDEX "retrieval_executions_conversation_id_idx" ON "retrieval_executions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "retrieval_executions_agent_execution_id_idx" ON "retrieval_executions" USING btree ("agent_execution_id");