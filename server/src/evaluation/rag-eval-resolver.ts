/**
 * server/src/evaluation/rag-eval-resolver.ts
 * Evaluation dataset validator and chunk resolver.
 * Enforces bidirectional staleness guards across document versions.
 */

import semver from 'semver';
import { eq, and } from 'drizzle-orm';
import { db } from '../persistence/db/client.js';
import { knowledgeDocVersions, knowledgeChunks, KnowledgeDomain } from '../persistence/db/schema.js';

export interface GoldenDataset {
  evalSetVersion: string;
  createdAgainstDocVersions: Record<string, string>;
  queries: Array<{
    id: string;
    query: string;
    domain: string;
    topic: string;
    expectedDocId: string;
    targetSectionPath: string;
    expectedKeywords: string[];
  }>;
}

export async function assertEvalSetNotStale(goldenSet: GoldenDataset): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const activeVersions = await db
    .select({
      docId: knowledgeDocVersions.docId,
      version: knowledgeDocVersions.version,
    })
    .from(knowledgeDocVersions)
    .where(eq(knowledgeDocVersions.status, 'active'));

  const activeMap = new Map<string, string>();
  for (const row of activeVersions) {
    activeMap.set(row.docId, row.version);
  }

  for (const [docId, expectedVer] of Object.entries(goldenSet.createdAgainstDocVersions)) {
    const activeVer = activeMap.get(docId);
    if (!activeVer) {
      throw new Error(
        `EVAL_ERROR_MISSING_DOC: Golden dataset references doc '${docId}', but no active version exists in DB.`
      );
    }

    const coercedExpected = semver.coerce(expectedVer);
    const coercedActive = semver.coerce(activeVer);

    if (!coercedExpected || !coercedActive) {
      throw new Error(`INVALID_VERSION_FORMAT: Unable to parse semver for ${docId}: ${expectedVer} vs ${activeVer}`);
    }

    // Forward drift: DB document has been updated to a newer version than eval set knows about
    if (semver.gt(coercedActive, coercedExpected)) {
      throw new Error(
        `STALE_EVAL_SET_FORWARD_DRIFT: Golden dataset for '${docId}' was created against v${expectedVer}, but database has newer v${activeVer}. Update eval dataset before testing.`
      );
    }

    // Backward drift: DB has an older version than eval set expected — warn, do not throw
    if (semver.lt(coercedActive, coercedExpected)) {
      const msg = `[EVAL_BACKWARD_DRIFT] Golden dataset for '${docId}' requires v${expectedVer}, but database only has older v${activeVer}. Run knowledge:ingest first.`;
      warnings.push(msg);
      console.warn(`::warning::${msg}`);
    }
  }

  return { warnings };
}

export async function resolveCandidateChunkIds(
  scope: { domain: KnowledgeDomain; topic: string },
  targetDocId: string,
  targetSectionPath?: string
): Promise<string[]> {
  const query = db
    .select({
      id: knowledgeChunks.id,
      sectionPath: knowledgeChunks.sectionPath,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocVersions, eq(knowledgeChunks.versionId, knowledgeDocVersions.id))
    .where(
      and(
        eq(knowledgeChunks.domain, scope.domain),
        eq(knowledgeChunks.topic, scope.topic),
        eq(knowledgeChunks.status, 'active'),
        eq(knowledgeDocVersions.docId, targetDocId)
      )
    );

  const rows = await query;
  if (targetSectionPath) {
    const filtered = rows.filter((r) =>
      r.sectionPath.toLowerCase().includes(targetSectionPath.toLowerCase())
    );
    if (filtered.length > 0) {
      return filtered.map((r) => r.id);
    }
  }

  return rows.map((r) => r.id);
}
