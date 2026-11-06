// src/api/server.ts
// Phase 16 Step 4: HTTP server entrypoint with graceful shutdown.

import 'dotenv/config';
import { app } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

const server = app.listen(PORT, () => {
  console.log(`[OrchestrAI] Server listening on :${PORT}`);
});

function shutdown(): void {
  console.log('[OrchestrAI] Shutting down gracefully...');
  server.close(() => {
    console.log('[OrchestrAI] HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

