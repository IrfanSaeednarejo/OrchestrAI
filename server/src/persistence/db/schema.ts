// PLACEHOLDER SCHEMA — this table exists only to verify the migration
// pipeline works end-to-end. It will be removed once real domain schemas
// are defined in a later phase based on project requirements.

import { pgTable, serial, timestamp, text } from 'drizzle-orm/pg-core';

export const healthCheck = pgTable('health_check', {
  id: serial('id').primaryKey(),
  checkedAt: timestamp('checked_at').notNull().defaultNow(),
  note: text('note'),
});
