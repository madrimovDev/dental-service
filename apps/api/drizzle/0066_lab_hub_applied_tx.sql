-- FX-93: dedup kaliti (tenant_id, tx_id, seq). Mavjud qatorlar tx_id = 0 (Hub xid'i noma'lum).
ALTER TABLE "lab_hub_applied_events" ADD COLUMN "tx_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_hub_applied_events" DROP CONSTRAINT "lab_hub_applied_events_tenant_id_seq_pk";--> statement-breakpoint
ALTER TABLE "lab_hub_applied_events" ADD CONSTRAINT "lab_hub_applied_events_tenant_id_tx_id_seq_pk" PRIMARY KEY("tenant_id","tx_id","seq");
--> statement-breakpoint
-- FX-98: legacy (tx_id = 0) qatorlar chegarasi — joriy kursorning tx_id'si ("<tx>.<seq>" yoki "<epoch>:<tx>.<seq>").
-- Davr almashib tarix haqiqiy txId bilan qayta kelsa, (0, seq) qatori + txId <= chegara = allaqachon qo'llangan.
ALTER TABLE "lab_hub_state" ADD COLUMN "legacy_tx_ceiling" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "lab_hub_state" SET "legacy_tx_ceiling" = split_part(regexp_replace("cursor", '^.*:', ''), '.', 1)::bigint
 WHERE regexp_replace("cursor", '^.*:', '') ~ '^[0-9]+\.[0-9]+$';
