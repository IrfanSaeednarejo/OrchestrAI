# Production Smoke Retrieval Verification

This document contains manual smoke retrieval probes to be executed by an operator immediately following production knowledge ingestion (`NODE_ENV=production npm run knowledge:ingest -- --dir ../docs/knowledge-base`).

All commands are run from the `server/` directory against the production database and Gemini API.

---

## Positive Probes (6 Scopes)

Each probe queries a legitimate `{ domain, topic }` scope and verifies that the top-1 hit matches the expected canonical section.

### Probe 1: Returns Scope (`orders` / `returns`)
```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'How many days do I have to return an item after delivery?',
  domains: ['orders'],
  topics: ['returns']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 0);
console.log('Top Section:', r.success && r.data[0] ? r.data[0].sectionPath : 'NONE');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 3` (or $\ge 1$)
- **Expected Top Section:** `Return Eligibility`
- **Pass Criteria:** Top-1 section matches `Return Eligibility`.

---

### Probe 2: Defective Items Scope (`orders` / `returns`)
```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'What are the rules and exceptions for damaged or defective items?',
  domains: ['orders'],
  topics: ['returns']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 0);
console.log('Top Section:', r.success && r.data[0] ? r.data[0].sectionPath : 'NONE');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 3` (or $\ge 1$)
- **Expected Top Section:** `Return Eligibility`
- **Pass Criteria:** Top-1 section matches `Return Eligibility`.

---

### Probe 3: Shipping Scope (`orders` / `shipping`)
```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'What does shipment status in transit or delivered mean?',
  domains: ['orders'],
  topics: ['shipping']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 0);
console.log('Top Section:', r.success && r.data[0] ? r.data[0].sectionPath : 'NONE');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 3` (or $\ge 1$)
- **Expected Top Section:** `What do the different shipment statuses mean?`
- **Pass Criteria:** Top-1 section matches `What do the different shipment statuses mean?`.

---

### Probe 4: Refunds Scope (`payments` / `refunds`)
```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'When will a refund show up on my credit card statement?',
  domains: ['payments'],
  topics: ['refunds']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 0);
console.log('Top Section:', r.success && r.data[0] ? r.data[0].sectionPath : 'NONE');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 3` (or $\ge 1$)
- **Expected Top Section:** `When Refunds Are Issued`
- **Pass Criteria:** Top-1 section matches `When Refunds Are Issued`.

---

### Probe 5: Payments Scope (`payments` / `payments`)
```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'What does payment status settled or failed mean?',
  domains: ['payments'],
  topics: ['payments']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 0);
console.log('Top Section:', r.success && r.data[0] ? r.data[0].sectionPath : 'NONE');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 3` (or $\ge 1$)
- **Expected Top Section:** `What do the different payment statuses mean?`
- **Pass Criteria:** Top-1 section matches `What do the different payment statuses mean?`.

---

### Probe 6: Account Security Scope (`account` / `account_security`)
```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'How does two-factor authentication and OTP verification work for login security?',
  domains: ['account'],
  topics: ['account_security']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 0);
console.log('Top Section:', r.success && r.data[0] ? r.data[0].sectionPath : 'NONE');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 3` (or $\ge 1$)
- **Expected Top Section:** `How does the verification code process work?`
- **Pass Criteria:** Top-1 section matches `How does the verification code process work?`.
- **Note:** The golden dataset's `targetSectionPath` for `eval-q-06` is `"What is email verification and why is it required?"` (stale — see MIGRATION.md "Eval quality gap"). Actual production top-1 is the more specific OTP section above. Smoke asserts actual; eval harness asserts any-in-top-K until golden dataset v1.0.1 corrects the target.

---

## Negative Probes (2 Guardrails)

> [!NOTE]
> **Legacy fallback state check before running negative probes.** When the new pipeline returns 0 hits for a scope, `retrieval.ts` falls back to `searchKnowledgeByEmbedding` against `knowledge_documents`. As of 2026-11-20, `knowledge_documents` contains 5 rows covering scopes `(orders, returns)`, `(payments, refunds)`, `(orders, shipping)`, `(payments, payments)`, `(account, account_security)`. Neither negative probe's scope — `(payments, returns)` and `(orders, pet_policy_nonexistent)` — has a legacy row, so the fallback also returns 0. **If legacy rows are ever added for either scope, negative-probe expectations become invalid and must be re-derived.**

### Negative Probe 1: Cross-Domain Isolation Guard
Queries a returns-specific topic under the `payments` domain. Since returns documentation belongs strictly to `orders`, this must return 0 hits.

```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'How many days do I have to return an item after delivery?',
  domains: ['payments'],
  topics: ['returns']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 'error');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 0`
- **Pass Criteria:** Returns 0 hits. No chunks from `orders` leak into `payments`.

---

### Negative Probe 2: Out-of-Scope / Nonexistent Topic Guard
Queries a nonexistent topic with no associated documentation. Retrieval must succeed cleanly with an empty array rather than throwing an exception.

```bash
node --input-type=module -e "
import 'dotenv/config';
import { retrieveKnowledge } from './src/knowledge/retrieval.js';
const r = await retrieveKnowledge({
  query: 'What is the pet policy for in-store visits with emotional support animals?',
  domains: ['orders'],
  topics: ['pet_policy_nonexistent']
});
console.log('Success:', r.success);
console.log('Hit count:', r.success ? r.data.length : 'error');
"
```
- **Expected Status:** `Success: true`
- **Expected Hit Count:** `Hit count: 0`
- **Pass Criteria:** `Success: true` and `Hit count: 0`. No unhandled exception or repository error.
