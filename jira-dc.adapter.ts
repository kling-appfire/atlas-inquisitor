/**
 * Jira Data Center REST Adapter
 *
 * ALL Jira API calls go through this file.
 * Every method is GET-only — this is a read-only analysis tool.
 *
 * Uses the Result<T> pattern: never throws across async boundaries.
 */

import type { Env } from './env';
import type { JiraPaginatedResponse } from './pagination';
import { fetchAllJiraPages } from './pagination';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: 'software' | 'service_desk' | 'business';
  lead: { accountId: string; displayName: string };
  isPrivate: boolean;
}

export interface JiraUser {
  accountId: string;
  emailAddress: string | null;
  displayName: string;
  active: boolean;
  lastLoginDate?: string;
}

export interface JiraWorkflow {
  name: string;
  description: string;
  steps: JiraWorkflowStep[];
  isDefault: boolean;
}

export interface JiraWorkflowStep {
  id: number;
  name: string;
  status: { id: string; name: string };
}

export interface JiraCustomField {
  id: string;
  name: string;
  type: string;
  searcherKey: string;
  isLocked: boolean;
  isManaged: boolean;
  projectsCount?: number;
  issueCounts?: number;
}

export interface JiraPermissionScheme {
  id: number;
  name: string;
  description: string;
}

export interface JiraIssueTypeScheme {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class JiraDCAdapter {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(env: Env) {
    this.baseUrl = env.JIRA_DC_BASE_URL.replace(/\/$/, '');
    this.authHeader = `Basic ${btoa(`${env.JIRA_DC_USERNAME}:${env.JIRA_DC_API_TOKEN}`)}`;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<Result<T>> {
    const url = new URL(`${this.baseUrl}/rest/api/2${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `Jira API error: ${response.status} ${response.statusText} for ${path}`,
          status: response.status,
        };
      }

      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: `Network error calling Jira at ${path}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ─── Projects ───────────────────────────────────────────────────────────────

  async getAllProjects(): Promise<Result<JiraProject[]>> {
    const projects = await fetchAllJiraPages<JiraProject>(
      (startAt, maxResults) =>
        this.get<JiraPaginatedResponse<JiraProject>>(
          '/project/search',
          { startAt: String(startAt), maxResults: String(maxResults), expand: 'lead,issueTypes' }
        ).then(r => {
          if (!r.ok) throw new Error(r.error);
          return r.data;
        })
    );
    return { ok: true, data: projects };
  }

  async getProjectIssueStats(projectKey: string): Promise<Result<{ total: number; open: number; lastUpdated: string | null }>> {
    // Use JQL to get issue stats — GET via search endpoint
    const result = await this.get<{ total: number; issues: Array<{ fields: { updated: string; status: { statusCategory: { key: string } } } }> }>(
      '/search',
      {
        jql: `project = "${projectKey}" ORDER BY updated DESC`,
        maxResults: '1',
        fields: 'updated,status',
      }
    );

    if (!result.ok) return result;

    const openResult = await this.get<{ total: number }>(
      '/search',
      { jql: `project = "${projectKey}" AND statusCategory != Done`, maxResults: '0' }
    );

    if (!openResult.ok) return openResult;

    const lastUpdated = result.data.issues[0]?.fields.updated ?? null;

    return {
      ok: true,
      data: {
        total: result.data.total,
        open: openResult.data.total,
        lastUpdated,
      },
    };
  }

  // ─── Users ───────────────────────────────────────────────────────────────────

  async getAllUsers(): Promise<Result<JiraUser[]>> {
    const users = await fetchAllJiraPages<JiraUser>(
      (startAt, maxResults) =>
        this.get<JiraPaginatedResponse<JiraUser>>(
          '/users/search',
          { startAt: String(startAt), maxResults: String(maxResults) }
        ).then(r => {
          if (!r.ok) throw new Error(r.error);
          return r.data;
        })
    );
    return { ok: true, data: users };
  }

  // ─── Configuration Schemes ────────────────────────────────────────────────

  async getPermissionSchemes(): Promise<Result<JiraPermissionScheme[]>> {
    const result = await this.get<{ permissionSchemes: JiraPermissionScheme[] }>('/permissionscheme');
    if (!result.ok) return result;
    return { ok: true, data: result.data.permissionSchemes };
  }

  async getWorkflows(): Promise<Result<JiraWorkflow[]>> {
    const workflows = await fetchAllJiraPages<JiraWorkflow>(
      (startAt, maxResults) =>
        this.get<JiraPaginatedResponse<JiraWorkflow>>(
          '/workflow/search',
          { startAt: String(startAt), maxResults: String(maxResults), expand: 'statuses,transitions' }
        ).then(r => {
          if (!r.ok) throw new Error(r.error);
          return r.data;
        })
    );
    return { ok: true, data: workflows };
  }

  async getCustomFields(): Promise<Result<JiraCustomField[]>> {
    const result = await this.get<JiraCustomField[]>('/field');
    if (!result.ok) return result;
    // Filter to only custom fields (IDs starting with 'customfield_')
    const customFields = result.data.filter(f => f.id.startsWith('customfield_'));
    return { ok: true, data: customFields };
  }

  async getIssueTypeSchemes(): Promise<Result<JiraIssueTypeScheme[]>> {
    const schemes = await fetchAllJiraPages<JiraIssueTypeScheme>(
      (startAt, maxResults) =>
        this.get<JiraPaginatedResponse<JiraIssueTypeScheme>>(
          '/issuetypescheme',
          { startAt: String(startAt), maxResults: String(maxResults) }
        ).then(r => {
          if (!r.ok) throw new Error(r.error);
          return r.data;
        })
    );
    return { ok: true, data: schemes };
  }

  // ─── Server Info ──────────────────────────────────────────────────────────

  async getServerInfo(): Promise<Result<{ version: string; deploymentType: string; buildNumber: number }>> {
    return this.get('/serverInfo');
  }
}
