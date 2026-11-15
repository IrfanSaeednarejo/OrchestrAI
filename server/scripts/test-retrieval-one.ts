import 'dotenv/config';
import { retrieveKnowledge } from '../src/knowledge/retrieval.js';

async function testOne() {
  console.log('Testing 1 real retrieval query...');
  const res = await retrieveKnowledge({
    query: 'How do I return an item within 30 days?',
    domains: ['orders'],
    topK: 3,
  });
  console.log('Success:', res.success);
  if (res.success) {
    console.log('Hits returned:', res.data.length);
    console.log('First hit topic:', res.data[0]?.topic, 'similarity:', res.data[0]?.similarity);
  } else {
    console.error('Error:', res.error);
  }
  process.exit(0);
}

testOne().catch(err => {
  console.error(err);
  process.exit(1);
});

