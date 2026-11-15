import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

export interface ExecutedToolRecord {
  toolName: string;
  args?: Record<string, unknown>;
  outcome?: string;
  specialist?: string;
}

export interface QuerySourceStat {
  count: number;
  totalMs: number;
}

export interface QueryInterval {
  start: number;
  end: number;
  durationMs: number;
  source: string;
}

export interface TurnContext {
  conversationId?: string;
  node?: string;
  evalRunId?: string;
  datasetVersion?: string;
  llmCallCount: number;
  toolCallCount: number;
  executedTools?: ExecutedToolRecord[];
  dbQueryCount?: number;
  dbDurationMs?: number;
  llmDurationMs?: number;
  querySources?: Map<string, QuerySourceStat>;
  queryIntervals?: QueryInterval[];
}

export const turnStorage = new AsyncLocalStorage<TurnContext>();

export function runWithTurnContext<T>(
  context: TurnContext,
  fn: () => Promise<T>
): Promise<T> {
  return turnStorage.run(context, fn);
}

export function getTurnContext(): TurnContext | undefined {
  return turnStorage.getStore();
}

export function incrementLLMCallCount(): void {
  const ctx = getTurnContext();
  if (ctx) {
    ctx.llmCallCount++;
  }
}

export function incrementToolCallCount(): void {
  const ctx = getTurnContext();
  if (ctx) {
    ctx.toolCallCount++;
  }
}

export function recordExecutedTool(record: ExecutedToolRecord): void {
  const ctx = getTurnContext();
  if (ctx?.executedTools) {
    ctx.executedTools.push(record);
  }
}

export function recordDbQuery(
  durationMs: number,
  source: string,
  startMs?: number,
  endMs?: number
): void {
  const ctx = getTurnContext();
  if (ctx) {
    ctx.dbQueryCount = (ctx.dbQueryCount ?? 0) + 1;
    ctx.dbDurationMs = (ctx.dbDurationMs ?? 0) + durationMs;
    if (startMs !== undefined && endMs !== undefined) {
      if (!ctx.queryIntervals) {
        ctx.queryIntervals = [];
      }
      ctx.queryIntervals.push({
        start: startMs,
        end: endMs,
        durationMs,
        source,
      });
    }
    if (!ctx.querySources) {
      ctx.querySources = new Map();
    }
    const existing = ctx.querySources.get(source) ?? { count: 0, totalMs: 0 };
    existing.count++;
    existing.totalMs += durationMs;
    ctx.querySources.set(source, existing);
  }
}

export function recordLlmCall(durationMs: number): void {
  const ctx = getTurnContext();
  if (ctx) {
    ctx.llmDurationMs = (ctx.llmDurationMs ?? 0) + durationMs;
  }
}

// ---------------------------------------------------------------------------
// PG Query Wrapping
// ---------------------------------------------------------------------------

const QUERY_TRACKED = Symbol('orchestrai_query_tracked');
let pgTrackingInstalled = false;

function extractCallerSource(): string {
  const stack = new Error().stack || '';
  const lines = stack.split('\n');
  for (const line of lines) {
    if (
      line.includes('turn-context') ||
      line.includes('node_modules/pg') ||
      line.includes('node_modules\\pg') ||
      line.includes('node_modules/drizzle-orm') ||
      line.includes('node_modules\\drizzle-orm') ||
      line.includes('node:') ||
      line.includes('extractCallerSource')
    ) {
      continue;
    }
    const match = line.match(/(?:src[\\/][^:]+|\b[a-zA-Z0-9_.-]+\.(?:ts|js)):[0-9]+/);
    if (match) {
      return match[0].replace(/\\/g, '/');
    }
  }
  return 'unknown';
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function installPgQueryTracking(): void {
  if (pgTrackingInstalled) return;
  pgTrackingInstalled = true;

  const originalPoolQuery = pg.Pool.prototype.query;
  const originalClientQuery = pg.Client.prototype.query;

  pg.Pool.prototype.query = function (...args: any[]) {
    const ctx = getTurnContext();
    if (!ctx) {
      return originalPoolQuery.apply(this, args as any);
    }

    const caller = extractCallerSource();
    const start = performance.now();

    const queryObj = args[0];
    if (typeof queryObj === 'object' && queryObj !== null) {
      (queryObj as any)[QUERY_TRACKED] = true;
    }

    if (typeof args[args.length - 1] === 'function') {
      const originalCb = args[args.length - 1];
      args[args.length - 1] = function (err: any, res: any) {
        const end = performance.now();
        const ms = end - start;
        recordDbQuery(ms, caller, start, end);
        return originalCb(err, res);
      };
      return originalPoolQuery.apply(this, args as any);
    }

    const result: any = originalPoolQuery.apply(this, args as any);
    if (result && typeof result.then === 'function') {
      return result.then(
        (res: any) => {
          const end = performance.now();
          const ms = end - start;
          recordDbQuery(ms, caller, start, end);
          return res;
        },
        (err: any) => {
          const end = performance.now();
          const ms = end - start;
          recordDbQuery(ms, caller, start, end);
          throw err;
        }
      );
    }
    return result;
  };

  pg.Client.prototype.query = function (...args: any[]) {
    const ctx = getTurnContext();
    if (!ctx) {
      return originalClientQuery.apply(this, args as any);
    }

    const queryObj = args[0];
    if (typeof queryObj === 'object' && queryObj !== null && (queryObj as any)[QUERY_TRACKED]) {
      return originalClientQuery.apply(this, args as any);
    }

    const caller = extractCallerSource();
    const start = performance.now();

    if (typeof args[args.length - 1] === 'function') {
      const originalCb = args[args.length - 1];
      args[args.length - 1] = function (err: any, res: any) {
        const end = performance.now();
        const ms = end - start;
        recordDbQuery(ms, caller, start, end);
        return originalCb(err, res);
      };
      return originalClientQuery.apply(this, args as any);
    }

    const result: any = originalClientQuery.apply(this, args as any);
    if (result && typeof result.then === 'function') {
      return result.then(
        (res: any) => {
          const end = performance.now();
          const ms = end - start;
          recordDbQuery(ms, caller, start, end);
          return res;
        },
        (err: any) => {
          const end = performance.now();
          const ms = end - start;
          recordDbQuery(ms, caller, start, end);
          throw err;
        }
      );
    }
    return result;
  };
}
