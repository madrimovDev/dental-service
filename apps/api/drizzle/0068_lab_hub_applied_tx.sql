-- FX-93: dedup kaliti (tenant_id, tx_id, seq). Mavjud qatorlar tx_id = 0 (Hub xid'i noma'lum).
ALTER TABLE "lab_hub_applied_events" ADD COLUMN "tx_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_hub_applied_events" DROP CONSTRAINT "lab_hub_applied_events_tenant_id_seq_pk";--> statement-breakpoint
ALTER TABLE "lab_hub_applied_events" ADD CONSTRAINT "lab_hub_applied_events_tenant_id_tx_id_seq_pk" PRIMARY KEY("tenant_id","tx_id","seq");
