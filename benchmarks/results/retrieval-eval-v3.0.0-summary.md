# OrchestrAI: Retrieval Evaluation Report (v3.0.0)

**Execution Date:** 2026-11-27  
**Corpus:** 516 active chunks across 42 policy/FAQ documents in PostgreSQL (`knowledge_chunks`)  
**Evaluator Dataset:** `eval/knowledge-golden-dataset.v3.json` (263 active: 249 answerable + 14 negatives; 39 excluded)  
**Embedding Model:** `gemini-embedding-001` (768-dim, taskType `RETRIEVAL_QUERY`)  
**Cache Location:** `scripts/.embed-cache/`  

---

## 1. Execution Telemetry & Cache Performance

| Metric | Scoped Mode | Unscoped Mode | Total |
|---|---|---|---|
| Total Queries Evaluated | 263 | 263 | 526 |
| Answerable Queries ($n$) | 249 | 249 | 249 distinct |
| Negative Queries ($n$) | 14 | 14 | 14 distinct |
| Cache Hits | 263 | 263 | 526 |
| Cache Misses | 0 | 0 | 0 |
| Total Gemini API Calls | 0 | 0 | 0 |
| Cache-Hit Rate | 100.0% | 100.0% | 100.0% |
| Wall-Clock Time | 134.60s | 261.16s | 395.76s |

---

## 2. Confidence Intervals (Wilson 95% Score Interval)

Formula:
$$\hat{p} = \frac{x}{n}$$
$$\text{CI}_{95\%} = \frac{\hat{p} + \frac{z^2}{2n} \pm z \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}} \quad (z = 1.959964, z^2 = 3.8416)$$

### Overall hit@3 Confidence Intervals:
- **Scoped Mode ($n=249$):**
  - Numerator: $\hat{p} + \frac{z^2}{2n} = 0.8471 ± 0.0463$
  - Denominator: $1 + \frac{z^2}{n} = 1.0154$
  - Point Estimate: $\hat{p} = 83.94\%$ (209/249)
  - **Wilson 95% CI:** **83.9% [78.9%, 88.0%]**
- **Unscoped Mode ($n=249$):**
  - Numerator: $\hat{p} + \frac{z^2}{2n} = 0.6583 ± 0.0597$
  - Denominator: $1 + \frac{z^2}{n} = 1.0154$
  - Point Estimate: $\hat{p} = 65.06\%$ (162/249)
  - **Wilson 95% CI:** **65.1% [59.0%, 70.7%]**

*(Note: Confidence intervals are computed for buckets with $n \ge 30$; buckets with $n < 30$ report raw counts and note $n < 30$ per methodology guidelines).*

---

## 3. Scoped Retrieval Evaluation (Domain + Topic Filter)

| Category / Bucket | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | search_ms (p50) | Wilson 95% CI (hit@3) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Overall (All Active Answerable)** | **249** | **86** | **34.5%** | **209** | **83.9%** | **0.839** | **0.562** | **475.5ms** | **451.9ms** | **83.9% [78.9%, 88.0%]** |
| Difficulty: keyword | 79 | 30 | 38.0% | 62 | 78.5% | 0.785 | 0.559 | 485.1ms | 449.5ms | 78.5% [68.2%, 86.1%] |
| Difficulty: paraphrase | 122 | 40 | 32.8% | 108 | 88.5% | 0.885 | 0.571 | 465.4ms | 452.6ms | 88.5% [81.7%, 93.0%] |
| Difficulty: hard | 48 | 16 | 33.3% | 39 | 81.3% | 0.813 | 0.542 | 485.2ms | 452.1ms | 81.3% [68.1%, 89.8%] |
| Variant: paraphrase | 154 | 50 | 32.5% | 125 | 81.2% | 0.812 | 0.540 | 482.2ms | 453.4ms | 81.2% [74.3%, 86.6%] |
| Variant: messy | 95 | 36 | 37.9% | 84 | 88.4% | 0.884 | 0.597 | 464.6ms | 450.7ms | 88.4% [80.4%, 93.4%] |

### Scoped Performance by Document:

| Document ID | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | Wilson 95% CI |
|---|---|---|---|---|---|---|---|---|---|
| `faq-account-data-deletion-001` | 20 | 4 | 20.0% | 15 | 75.0% | 0.750 | 0.425 | 433.6ms | n < 30 |
| `faq-account-notifications-001` | 21 | 10 | 47.6% | 18 | 85.7% | 0.857 | 0.651 | 344.5ms | n < 30 |
| `faq-account-security-001` | 22 | 5 | 22.7% | 19 | 86.4% | 0.864 | 0.523 | 483.5ms | n < 30 |
| `faq-orders-exchanges-001` | 19 | 9 | 47.4% | 15 | 79.0% | 0.789 | 0.597 | 545.9ms | n < 30 |
| `faq-orders-shipping-001` | 23 | 4 | 17.4% | 18 | 78.3% | 0.783 | 0.442 | 428.3ms | n < 30 |
| `faq-payments-methods-001` | 23 | 12 | 52.2% | 23 | 100.0% | 1.000 | 0.732 | 582.6ms | n < 30 |
| `faq-payments-terms-001` | 21 | 6 | 28.6% | 14 | 66.7% | 0.667 | 0.468 | 496.0ms | n < 30 |
| `pol-account-privacy-001` | 19 | 5 | 26.3% | 16 | 84.2% | 0.842 | 0.535 | 445.9ms | n < 30 |
| `pol-orders-cancellation-001` | 19 | 6 | 31.6% | 16 | 84.2% | 0.842 | 0.561 | 558.3ms | n < 30 |
| `pol-orders-returns-001` | 22 | 8 | 36.4% | 18 | 81.8% | 0.818 | 0.538 | 420.8ms | n < 30 |
| `pol-payments-disputes-001` | 17 | 7 | 41.2% | 15 | 88.2% | 0.882 | 0.598 | 446.1ms | n < 30 |
| `pol-payments-refunds-001` | 23 | 10 | 43.5% | 22 | 95.7% | 0.957 | 0.659 | 516.9ms | n < 30 |

---

## 4. Unscoped Retrieval Evaluation (Full 66-Chunk Corpus)

| Category / Bucket | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | search_ms (p50) | Wilson 95% CI (hit@3) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Overall (All Active Answerable)** | **249** | **72** | **28.9%** | **162** | **65.1%** | **0.651** | **0.445** | **987.3ms** | **921.6ms** | **65.1% [59.0%, 70.7%]** |
| Difficulty: keyword | 79 | 24 | 30.4% | 54 | 68.3% | 0.683 | 0.464 | 984.0ms | 920.7ms | 68.4% [57.5%, 77.6%] |
| Difficulty: paraphrase | 122 | 34 | 27.9% | 82 | 67.2% | 0.672 | 0.451 | 990.3ms | 922.6ms | 67.2% [58.5%, 74.9%] |
| Difficulty: hard | 48 | 14 | 29.2% | 26 | 54.2% | 0.542 | 0.399 | 985.2ms | 923.7ms | 54.2% [40.3%, 67.4%] |
| Variant: paraphrase | 154 | 40 | 26.0% | 99 | 64.3% | 0.643 | 0.423 | 984.0ms | 920.2ms | 64.3% [56.5%, 71.4%] |
| Variant: messy | 95 | 32 | 33.7% | 63 | 66.3% | 0.663 | 0.481 | 992.6ms | 923.7ms | 66.3% [56.3%, 75.0%] |

### Unscoped Performance by Document:

| Document ID | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | Wilson 95% CI |
|---|---|---|---|---|---|---|---|---|---|
| `faq-account-data-deletion-001` | 20 | 3 | 15.0% | 12 | 60.0% | 0.600 | 0.342 | 989.2ms | n < 30 |
| `faq-account-notifications-001` | 21 | 9 | 42.9% | 17 | 81.0% | 0.809 | 0.587 | 944.0ms | n < 30 |
| `faq-account-security-001` | 22 | 5 | 22.7% | 19 | 86.4% | 0.864 | 0.508 | 1032.6ms | n < 30 |
| `faq-orders-exchanges-001` | 19 | 9 | 47.4% | 15 | 79.0% | 0.789 | 0.597 | 1045.5ms | n < 30 |
| `faq-orders-shipping-001` | 23 | 4 | 17.4% | 13 | 56.5% | 0.565 | 0.355 | 1012.2ms | n < 30 |
| `faq-payments-methods-001` | 23 | 10 | 43.5% | 13 | 56.5% | 0.565 | 0.493 | 920.4ms | n < 30 |
| `faq-payments-terms-001` | 21 | 4 | 19.1% | 10 | 47.6% | 0.476 | 0.333 | 987.6ms | n < 30 |
| `pol-account-privacy-001` | 19 | 5 | 26.3% | 12 | 63.2% | 0.632 | 0.439 | 933.6ms | n < 30 |
| `pol-orders-cancellation-001` | 19 | 4 | 21.1% | 14 | 73.7% | 0.737 | 0.430 | 1002.6ms | n < 30 |
| `pol-orders-returns-001` | 22 | 5 | 22.7% | 12 | 54.5% | 0.545 | 0.371 | 1106.3ms | n < 30 |
| `pol-payments-disputes-001` | 17 | 7 | 41.2% | 12 | 70.6% | 0.706 | 0.520 | 940.8ms | n < 30 |
| `pol-payments-refunds-001` | 23 | 7 | 30.4% | 13 | 56.5% | 0.565 | 0.399 | 928.0ms | n < 30 |

---

## 5. Negative Queries & Abstention Analysis (14 Unanswerable Queries)

Negative queries evaluate topics not present in any policy document (e.g. cryptocurrency payments, drone delivery, wedding registry).

### Score Threshold Rules & Results:

| Metric / Threshold Rule | Scoped Mode | Unscoped Mode |
|---|---|---|
| Total Unanswerable Queries ($n$) | 14 | 14 |
| Positive Queries Top-1 RRF P90 Cutoff | 0.031319 | 0.028986 |
| Positive Queries Top-1 RRF P10 Cutoff | 0.016393 | 0.016393 |
| **Rule A (Rank-based P90: score not in top decile of positives)** | | |
| - Abstention Count | 14 / 14 | 14 / 14 |
| - Abstention Rate | 100.0% | 100.0% |
| - False Positive Rate ($1 - \text{Abstention}$) | 0.0% | 0.0% |
| **Rule B (Rank-based P10: score below bottom decile of positives)** | | |
| - Abstention Count | 0 / 14 | 0 / 14 |
| - Abstention Rate | 0.0% | 0.0% |
| - False Positive Rate ($1 - \text{Abstention}$) | 100.0% | 100.0% |
| **Rule C (Cosine Threshold: similarity < 0.50)** | | |
| - Abstention Count | 0 / 14 | 0 / 14 |
| - Abstention Rate | 0.0% | 0.0% |
| - False Positive Rate ($1 - \text{Abstention}$) | 100.0% | 100.0% |

---

## 6. Scoped vs Unscoped Comparison Summary

| Metric | Scoped Retrieval | Unscoped Retrieval | Delta (Scoped − Unscoped) |
|---|---|---|---|
| **hit@1** | 34.5% (86/249) | 28.9% (72/249) | 5.6% |
| **hit@3** | 83.9% (209/249) | 65.1% (162/249) | 18.9% |
| **recall@3** | 0.839 | 0.651 | 0.189 |
| **MRR** | 0.562 | 0.445 | 0.116 |
| **search_ms (mean)** | 475.5ms | 987.3ms | -511.9ms |
| **search_ms (p50)** | 451.9ms | 921.6ms | -469.6ms |
