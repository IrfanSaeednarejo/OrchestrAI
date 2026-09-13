import "dotenv/config";
import { config } from "./shared/config.js";

console.log("OrchestrAI foundation initialized");
console.log(`Environment: ${config.env}`);
console.log(`Postgres target: ${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`);
console.log(`Redis target: ${config.redis.host}:${config.redis.port}`);
