/*
 * This script creates LangGraph's internal tables (checkpoints, checkpoint_writes, 
 * checkpoint_blobs, etc.) in our Postgres database.
 * 
 * These tables are owned and managed by LangGraph. Application code must never 
 * query them directly.
 * 
 * This script should be run once per environment before any graph using this 
 * checkpointer is invoked. Running it again if the tables already exist is safe 
 * (it is idempotent), but it is intentionally not run automatically on every app boot.
 */

import 'dotenv/config';
import { checkpointer } from './client.js';

async function setup() {
  console.log('--- Setting up LangGraph Postgres Checkpointer ---');
  try {
    await checkpointer.setup();
    console.log('Successfully created LangGraph checkpoint tables.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to setup LangGraph checkpointer:', error);
    process.exit(1);
  }
}

setup();
