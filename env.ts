/**
 * Cloudflare Workers environment bindings type.
 * All secrets and bindings are declared here.
 * Never add actual values here — use wrangler secret put / .dev.vars
 */
export interface Env {
  // KV namespace for job state tracking
  JOB_STATE: KVNamespace;

  // R2 bucket for report artifact storage
  REPORTS: R2Bucket;

  // Jira DC connection
  JIRA_DC_BASE_URL: string;
  JIRA_DC_USERNAME: string;
  JIRA_DC_API_TOKEN: string;

  // Confluence DC connection
  CONFLUENCE_DC_BASE_URL: string;
  CONFLUENCE_DC_USERNAME: string;
  CONFLUENCE_DC_API_TOKEN: string;

  // Claude API for report summarization
  ANTHROPIC_API_KEY: string;

  // n8n webhook validation
  N8N_WEBHOOK_SECRET: string;

  // Runtime
  ENVIRONMENT: 'development' | 'staging' | 'production';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}
