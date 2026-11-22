# OrchestrAI: Retrieval Evaluation Report (v2)

**Execution Date:** 2026-11-22  
**Corpus:** 66 active chunks across 12 policy/FAQ documents in PostgreSQL (`knowledge_chunks`)  
**Evaluator Dataset:** `eval/knowledge-golden-dataset.v2.json` (263 active: 249 answerable + 14 negatives; 39 excluded)  
**Embedding Model:** `gemini-embedding-001` (768-dim, taskType `RETRIEVAL_QUERY`)  
**Cache Location:** `scripts/.embed-cache/`  

---

## 1. Execution Telemetry & Cache Performance

| Metric | Scoped Mode | Unscoped Mode | Total |
|---|---|---|---|
| Total Queries Evaluated | 263 | 263 | 526 |
| Answerable Queries ($n$) | 249 | 249 | 249 distinct |
| Negative Queries ($n$) | 14 | 14 | 14 distinct |
| Cache Hits | 0 | 263 | 263 |
| Cache Misses | 263 | 0 | 263 |
| Total Gemini API Calls | 263 | 0 | 263 |
| Cache-Hit Rate | 0.0% | 100.0% | 50.0% |
| Wall-Clock Time | 480.36s | 364.05s | 844.41s |

---

## 2. Confidence Intervals (Wilson 95% Score Interval)

Formula:
$$\hat{p} = \frac{x}{n}$$
$$\text{CI}_{95\%} = \frac{\hat{p} + \frac{z^2}{2n} \pm z \sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}} \quad (z = 1.959964, z^2 = 3.8416)$$

### Overall hit@3 Confidence Intervals:
- **Scoped Mode ($n=249$):**
  - Numerator: $\hat{p} + \frac{z^2}{2n} = 1.0077 ± 0.0077$
  - Denominator: $1 + \frac{z^2}{n} = 1.0154$
  - Point Estimate: $\hat{p} = 100.00\%$ (249/249)
  - **Wilson 95% CI:** **100.0% [98.5%, 100.0%]**
- **Unscoped Mode ($n=249$):**
  - Numerator: $\hat{p} + \frac{z^2}{2n} = 0.9635 ± 0.0267$
  - Denominator: $1 + \frac{z^2}{n} = 1.0154$
  - Point Estimate: $\hat{p} = 95.58\%$ (238/249)
  - **Wilson 95% CI:** **95.6% [92.3%, 97.5%]**

*(Note: Confidence intervals are computed for buckets with $n \ge 30$; buckets with $n < 30$ report raw counts and note $n < 30$ per methodology guidelines).*

---

## 3. Scoped Retrieval Evaluation (Domain + Topic Filter)

| Category / Bucket | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | search_ms (p50) | Wilson 95% CI (hit@3) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Overall (All Active Answerable)** | **249** | **211** | **84.7%** | **249** | **100.0%** | **1.000** | **0.921** | **1156.3ms** | **931.2ms** | **100.0% [98.5%, 100.0%]** |
| Difficulty: keyword | 79 | 62 | 78.5% | 79 | 100.0% | 1.000 | 0.890 | 1245.3ms | 970.9ms | 100.0% [95.4%, 100.0%] |
| Difficulty: paraphrase | 122 | 108 | 88.5% | 122 | 100.0% | 1.000 | 0.940 | 1138.1ms | 931.2ms | 100.0% [96.9%, 100.0%] |
| Difficulty: hard | 48 | 41 | 85.4% | 48 | 100.0% | 1.000 | 0.924 | 1056.0ms | 912.1ms | 100.0% [92.6%, 100.0%] |
| Variant: paraphrase | 154 | 128 | 83.1% | 154 | 100.0% | 1.000 | 0.912 | 1164.5ms | 935.5ms | 100.0% [97.6%, 100.0%] |
| Variant: messy | 95 | 83 | 87.4% | 95 | 100.0% | 1.000 | 0.935 | 1142.9ms | 929.9ms | 100.0% [96.1%, 100.0%] |

### Scoped Performance by Document:

| Document ID | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | Wilson 95% CI |
|---|---|---|---|---|---|---|---|---|---|
| `faq-account-data-deletion-001` | 20 | 14 | 70.0% | 20 | 100.0% | 1.000 | 0.842 | 1372.9ms | n < 30 |
| `faq-account-notifications-001` | 21 | 17 | 81.0% | 21 | 100.0% | 1.000 | 0.897 | 1273.5ms | n < 30 |
| `faq-account-security-001` | 22 | 19 | 86.4% | 22 | 100.0% | 1.000 | 0.932 | 1044.7ms | n < 30 |
| `faq-orders-exchanges-001` | 19 | 13 | 68.4% | 19 | 100.0% | 1.000 | 0.833 | 983.8ms | n < 30 |
| `faq-orders-shipping-001` | 23 | 19 | 82.6% | 23 | 100.0% | 1.000 | 0.913 | 952.0ms | n < 30 |
| `faq-payments-methods-001` | 23 | 23 | 100.0% | 23 | 100.0% | 1.000 | 1.000 | 1247.9ms | n < 30 |
| `faq-payments-terms-001` | 21 | 18 | 85.7% | 21 | 100.0% | 1.000 | 0.929 | 959.7ms | n < 30 |
| `pol-account-privacy-001` | 19 | 18 | 94.7% | 19 | 100.0% | 1.000 | 0.965 | 1187.3ms | n < 30 |
| `pol-orders-cancellation-001` | 19 | 13 | 68.4% | 19 | 100.0% | 1.000 | 0.842 | 989.8ms | n < 30 |
| `pol-orders-returns-001` | 22 | 22 | 100.0% | 22 | 100.0% | 1.000 | 1.000 | 1617.8ms | n < 30 |
| `pol-payments-disputes-001` | 17 | 12 | 70.6% | 17 | 100.0% | 1.000 | 0.853 | 1266.1ms | n < 30 |
| `pol-payments-refunds-001` | 23 | 23 | 100.0% | 23 | 100.0% | 1.000 | 1.000 | 991.3ms | n < 30 |

---

## 4. Unscoped Retrieval Evaluation (Full 66-Chunk Corpus)

| Category / Bucket | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | search_ms (p50) | Wilson 95% CI (hit@3) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Overall (All Active Answerable)** | **249** | **179** | **71.9%** | **238** | **95.6%** | **0.956** | **0.833** | **1404.3ms** | **1114.8ms** | **95.6% [92.3%, 97.5%]** |
| Difficulty: keyword | 79 | 53 | 67.1% | 77 | 97.5% | 0.975 | 0.819 | 1427.2ms | 1071.7ms | 97.5% [91.2%, 99.3%] |
| Difficulty: paraphrase | 122 | 94 | 77.0% | 116 | 95.1% | 0.951 | 0.857 | 1371.0ms | 1118.9ms | 95.1% [89.7%, 97.7%] |
| Difficulty: hard | 48 | 32 | 66.7% | 45 | 93.8% | 0.938 | 0.795 | 1451.2ms | 1129.5ms | 93.8% [83.2%, 97.9%] |
| Variant: paraphrase | 154 | 106 | 68.8% | 148 | 96.1% | 0.961 | 0.819 | 1441.6ms | 1114.7ms | 96.1% [91.8%, 98.2%] |
| Variant: messy | 95 | 73 | 76.8% | 90 | 94.7% | 0.947 | 0.854 | 1343.9ms | 1119.6ms | 94.7% [88.3%, 97.7%] |

### Unscoped Performance by Document:

| Document ID | $n$ | hit@1 | hit@1 (%) | hit@3 | hit@3 (%) | recall@3 | MRR | search_ms (mean) | Wilson 95% CI |
|---|---|---|---|---|---|---|---|---|---|
| `faq-account-data-deletion-001` | 20 | 14 | 70.0% | 19 | 95.0% | 0.950 | 0.825 | 1123.9ms | n < 30 |
| `faq-account-notifications-001` | 21 | 16 | 76.2% | 19 | 90.5% | 0.905 | 0.825 | 966.9ms | n < 30 |
| `faq-account-security-001` | 22 | 17 | 77.3% | 22 | 100.0% | 1.000 | 0.886 | 1800.8ms | n < 30 |
| `faq-orders-exchanges-001` | 19 | 13 | 68.4% | 18 | 94.7% | 0.947 | 0.816 | 1198.4ms | n < 30 |
| `faq-orders-shipping-001` | 23 | 19 | 82.6% | 23 | 100.0% | 1.000 | 0.906 | 1291.6ms | n < 30 |
| `faq-payments-methods-001` | 23 | 18 | 78.3% | 22 | 95.7% | 0.957 | 0.870 | 1937.8ms | n < 30 |
| `faq-payments-terms-001` | 21 | 14 | 66.7% | 20 | 95.2% | 0.952 | 0.809 | 1408.7ms | n < 30 |
| `pol-account-privacy-001` | 19 | 14 | 73.7% | 18 | 94.7% | 0.947 | 0.842 | 1105.5ms | n < 30 |
| `pol-orders-cancellation-001` | 19 | 12 | 63.2% | 18 | 94.7% | 0.947 | 0.772 | 1376.4ms | n < 30 |
| `pol-orders-returns-001` | 22 | 14 | 63.6% | 20 | 90.9% | 0.909 | 0.765 | 1035.7ms | n < 30 |
| `pol-payments-disputes-001` | 17 | 11 | 64.7% | 16 | 94.1% | 0.941 | 0.784 | 1501.7ms | n < 30 |
| `pol-payments-refunds-001` | 23 | 17 | 73.9% | 23 | 100.0% | 1.000 | 0.862 | 1963.9ms | n < 30 |

---

## 5. Negative Queries & Abstention Analysis (14 Unanswerable Queries)

Negative queries evaluate topics not present in any policy document (e.g. cryptocurrency payments, drone delivery, wedding registry).

### Score Threshold Rules & Results:

| Metric / Threshold Rule | Scoped Mode | Unscoped Mode |
|---|---|---|
| Total Unanswerable Queries ($n$) | 14 | 14 |
| Positive Queries Top-1 RRF P90 Cutoff | 0.016393 | 0.016393 |
| Positive Queries Top-1 RRF P10 Cutoff | 0.016393 | 0.016393 |
| **Rule A (Rank-based P90: score not in top decile of positives)** | | |
| - Abstention Count | 0 / 14 | 0 / 14 |
| - Abstention Rate | 0.0% | 0.0% |
| - False Positive Rate ($1 - \text{Abstention}$) | 100.0% | 100.0% |
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
| **hit@1** | 84.7% (211/249) | 71.9% (179/249) | 12.9% |
| **hit@3** | 100.0% (249/249) | 95.6% (238/249) | 4.4% |
| **recall@3** | 1.000 | 0.956 | 0.044 |
| **MRR** | 0.921 | 0.833 | 0.088 |
| **search_ms (mean)** | 1156.3ms | 1404.3ms | -248.0ms |
| **search_ms (p50)** | 931.2ms | 1114.8ms | -183.7ms |
