-- Migration 0013: Add page_number column to knowledge_chunks
-- page_number records the 1-based PDF page index where the section begins.
-- DEFAULT 0 back-fills existing rows non-destructively.
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS page_number INTEGER NOT NULL DEFAULT 0;
