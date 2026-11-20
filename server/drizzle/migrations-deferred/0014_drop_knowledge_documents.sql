-- Migration 0014: Drop legacy knowledge_documents table
-- STATUS: AUTHORED — DO NOT APPLY until Step 7 of MIGRATION.md deprecation checklist is complete.
-- DESTRUCTIVE: only after 7 days of production stability
-- Rollback: restore from backup; do not attempt to reverse
-- Pre-requisites:
--   1. All specialists operating on PDF pipeline for >= 1 full week without incident.
--   2. knowledge_documents query count = 0 (verify: SELECT * FROM pg_stat_user_tables WHERE relname='knowledge_documents').
--   3. Backup taken: pg_dump -t knowledge_documents orchestrai_prod > kb_docs_backup_$(date +%Y%m%d).sql

DROP TABLE IF EXISTS knowledge_documents CASCADE;
