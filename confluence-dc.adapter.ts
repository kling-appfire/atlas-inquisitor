/**
 * Confluence Data Center REST Adapter
 *
 * ALL Confluence API calls go through this file.
 * Every method is GET-only — this is a read-only analysis tool.
 */

import type { Env } from './env';
import { fetchAllConfluencePages } from './pagination';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export interface ConfluenceSpace {
  key: string;
  name: string;
  type: 'global' | 'personal';
  status: 'current' | 'archived';
  _expandable?: { homepage?: string };
}

export interface ConfluencePage {
  id: string;
  title: string;
  spaceKey: string;
  status: 'current' | 'trashed';
  history: { createdDate: string; lastUpdated: { when: string } };
  body?: { storage?: { value: string } };
}

export class ConfluenceDCAdapter {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(env: Env) {
    this.baseUrl = env.CONFLUENCE_DC_BASE_URL.replace(/\/$/, '');
    this.authHeader = `Basic ${btoa(`${env.CONFLUENCE_DC_USERNAME}:${env.CONFLUENCE_DC_API_TOKEN}`)}`;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<Result<T>> {
    const url = new URL(`${this.baseUrl}/rest/api${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: this.authHeader, Accept: 'application/json' },
      });
      if (!response.ok) {
        return { ok: false, error: `Confluence API ${response.status}: ${path}`, status: response.status };
      }
      return { ok: true, data: (await response.json()) as T };
    } catch (err) {
      return { ok: false, error: `Network error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async getAllSpaces(): Promise<Result<ConfluenceSpace[]>> {
    const spaces = await fetchAllConfluencePages<ConfluenceSpace>(
      (start, limit) =>
        this.get<{ results: ConfluenceSpace[]; _links: { next?: string; base: string }; start: number; limit: number; size: number }>(
          '/space', { start: String(start), limit: String(limit), type: 'global' }
        ).then(r => { if (!r.ok) throw new Error(r.error); return r.data; })
    );
    return { ok: true, data: spaces };
  }

  async getServerInfo(): Promise<Result<{ version: string }>> {
    return this.get('/settings/systemInfo');
  }
}
