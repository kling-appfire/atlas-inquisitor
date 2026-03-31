/**
 * Atlassian Migration Advisor — Main Worker Entry Point
 *
 * Routes incoming requests to domain-specific collector workers
 * and orchestrates the report pipeline.
 *
 * READ-ONLY: This worker never writes to Jira or Confluence.
 */

import type { Env } from './env';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return Response.json({ status: 'ok', version: '0.1.0' });
    }

    // n8n webhook receiver
    if (path === '/webhooks/n8n' && request.method === 'POST') {
      const { default: handler } = await import('./webhooks');
      return handler.fetch(request, env, ctx);
    }

    // Report job trigger
    if (path.startsWith('/jobs') && request.method === 'POST') {
      return handleJobCreate(request, env);
    }

    // Report artifact retrieval
    if (path.startsWith('/reports/') && request.method === 'GET') {
      return handleReportFetch(path, env);
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }
} satisfies ExportedHandler<Env>;

async function handleJobCreate(request: Request, env: Env): Promise<Response> {
  // TODO: Validate request, create job ID, store in KV, trigger n8n workflow
  return Response.json({ message: 'Job creation — not yet implemented' }, { status: 501 });
}

async function handleReportFetch(path: string, env: Env): Promise<Response> {
  // TODO: Retrieve report artifact from R2
  return Response.json({ message: 'Report fetch — not yet implemented' }, { status: 501 });
}
