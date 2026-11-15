DROP INDEX "refunds_payment_id_idx";--> statement-breakpoint
DROP INDEX "returns_order_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_payment_id_idx" ON "refunds" USING btree ("payment_id") WHERE "refunds"."status" != 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "returns_order_id_idx" ON "returns" USING btree ("order_id");