CREATE TYPE "public"."execution_status" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."routing_decision_type" AS ENUM('INITIAL_ROUTE', 'RE_ROUTE', 'HANDOFF', 'ESCALATION', 'FALLBACK');--> statement-breakpoint
CREATE TABLE "agent_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"input_summary" text,
	"output_summary" text,
	"duration" integer,
	"status" "execution_status" NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"source_agent" text,
	"destination_agent" text NOT NULL,
	"intent" text,
	"decision_type" "routing_decision_type" NOT NULL,
	"reason" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_execution_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"duration" integer,
	"status" "execution_status" NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_executions" ADD CONSTRAINT "agent_executions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_history" ADD CONSTRAINT "routing_history_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_agent_execution_id_agent_executions_id_fk" FOREIGN KEY ("agent_execution_id") REFERENCES "public"."agent_executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_executions_conversation_id_idx" ON "agent_executions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "routing_history_conversation_id_idx" ON "routing_history" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "tool_executions_agent_execution_id_idx" ON "tool_executions" USING btree ("agent_execution_id");