import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { pgPool } from '../db/client.js';

// Construct the PostgresSaver using the existing connection pool.
export const checkpointer = new PostgresSaver(pgPool);
