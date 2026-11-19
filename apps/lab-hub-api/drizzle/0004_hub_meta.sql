CREATE TABLE "hub_meta" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"epoch" uuid NOT NULL,
	"system_identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone
);
