import 'dotenv/config';
import { db } from '../src/persistence/db/client.js';
import { users } from '../src/persistence/db/schema.js';

async function main() {
  const allUsers = await db.select().from(users).limit(5);
  console.log('Users found:', allUsers.length);
  if (allUsers[0]) {
    console.log('First user ID:', allUsers[0].id);
  }
  process.exit(0);
}
main().catch(console.error);

