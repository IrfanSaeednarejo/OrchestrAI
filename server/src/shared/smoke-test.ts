import 'dotenv/config';
import { config } from './config.js';
import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createClient } from 'redis';

const StateAnnotation = Annotation.Root({
  count: Annotation<number>(),
});

function incrementNode(state: typeof StateAnnotation.State) {
  return { count: state.count + 1 };
}

async function runLangGraph() {
  const graph = new StateGraph(StateAnnotation)
    .addNode('increment', incrementNode)
    .addEdge(START, 'increment')
    .addEdge('increment', END);

  const app = graph.compile();
  const result = await app.invoke({ count: 0 });
  console.log(`[LangGraph] result:`, result);
}

function runDrizzle() {
  const pool = new Pool({
    connectionString: config.postgres.connectionString,
  });
  const db = drizzle(pool);
  if (db) {
    console.log('[Drizzle] pool and db instance constructed successfully');
  }
}

async function runRedis() {
  const client = createClient({
    url: config.redis.url,
    socket: { reconnectStrategy: false }
  });

  client.on('error', (err) => {
    // We log it but do not throw immediately, let connect() throw if it fails
    console.error('Redis Client Error:', err.message);
  });

  await client.connect();
  const pong = await client.ping();
  console.log(`[Redis] ping response: ${pong}`);
  await client.disconnect();
}

async function main() {
  try {
    await runLangGraph();
    runDrizzle();
    await runRedis();
    process.exit(0);
  } catch (error) {
    console.error('Smoke test failed:', error);
    process.exit(1);
  }
}

main();
