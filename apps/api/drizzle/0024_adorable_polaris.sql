DROP INDEX "cashier_tx_parent_unique";--> statement-breakpoint
CREATE INDEX "cashier_tx_parent_idx" ON "cashier_transactions" USING btree ("parent_transaction_id");