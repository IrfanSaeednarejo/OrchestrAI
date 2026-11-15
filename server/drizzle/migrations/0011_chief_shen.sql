ALTER TABLE "llm_calls" DROP CONSTRAINT "llm_calls_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "retrieval_executions" DROP CONSTRAINT "retrieval_executions_conversation_id_conversations_id_fk";
--> statement-breakpoint
ALTER TABLE "retrieval_executions" DROP CONSTRAINT "retrieval_executions_agent_execution_id_agent_executions_id_fk";
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_executions" ADD CONSTRAINT "retrieval_executions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_executions" ADD CONSTRAINT "retrieval_executions_agent_execution_id_agent_executions_id_fk" FOREIGN KEY ("agent_execution_id") REFERENCES "public"."agent_executions"("id") ON DELETE cascade ON UPDATE no action;