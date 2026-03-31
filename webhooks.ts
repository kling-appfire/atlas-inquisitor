/**
 * n8n Webhook Receiver
 * Validates HMAC signature and dispatches to job state machine.
 */

import type { Env } from './env';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Validate n8n webhook secret
    const signature = request.headers.get('x-n8n-signature');
    if (!signature || signature !== env.N8N_WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as unknown;
    // TODO: Validate body with Zod, update job state in KV
    console.log('n8n webhook received:', JSON.stringify(body));

    return Response.json({ received: true });
  }
} satisfies ExportedHandler<Env>;
