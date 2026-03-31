/**
 * KV-backed result caching service.
 * Used to cache expensive Jira/Confluence API collection results
 * so individual report sections can re-run without re-fetching.
 */

import type { Env } from '../api/env';

export async function cacheSet(key: string, value: unknown, env: Env, ttlSeconds = 3600): Promise<void> {
  await env.JOB_STATE.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export async function cacheGet<T>(key: string, env: Env): Promise<T | null> {
  const raw = await env.JOB_STATE.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function jobCacheKey(jobId: string, dataType: string): string {
  return `job:${jobId}:data:${dataType}`;
}

export function sectionResultKey(jobId: string, sectionId: string): string {
  return `job:${jobId}:section:${sectionId}`;
}
