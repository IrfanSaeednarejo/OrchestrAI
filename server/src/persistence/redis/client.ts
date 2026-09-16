import { createClient } from 'redis';
import { config } from '../../shared/config.js';

export const redisClient = createClient({
  url: config.redis.url,
});

let isConnected = false;

export async function connectRedis() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
  }
}
