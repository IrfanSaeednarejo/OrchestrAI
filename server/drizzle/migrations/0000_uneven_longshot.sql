CREATE TABLE "health_check" (
	"id" serial PRIMARY KEY NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL,
	"note" text
);
