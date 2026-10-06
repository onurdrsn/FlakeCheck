import { Hono } from 'hono';
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { IngestionRPC } from '@flakecheck/shared-kernel';
import { createDatabase } from './db/client.js';
import { writeIngestion } from './db/writer.js';
import { parseReport } from './parsers/index.js';
import type { ParserMetadata } from './parsers/index.js';

export interface Env {
  DATABASE_URL: string;
  SERVICE_NAME?: string;
}

function metadataFromHeaders(request: Request): ParserMetadata {
  const metadata: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (key.startsWith('x-flakecheck-')) metadata[key.slice('x-flakecheck-'.length).replaceAll('-', '_')] = value;
  });
  const repo = request.headers.get('x-flakecheck-repo');
  if (repo) metadata.repo = repo;
  return metadata as ParserMetadata;
}

export class IngestionEntrypoint extends WorkerEntrypoint<Env> implements IngestionRPC {
  async ingestStream(format: string, metadata: Record<string, string>, payloadStream: ReadableStream<Uint8Array>) {
    const parsed = await parseReport(format, payloadStream, metadata as ParserMetadata);
    const result = await writeIngestion(createDatabase(this.env.DATABASE_URL), parsed);
    return { runId: parsed.run.id, ingestedAttempts: result.persistedAttempts };
  }

  async fetch(request: Request): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();
    app.post('/ingest', async (context) => {
      const format = context.req.header('x-flakecheck-format');
      const repo = context.req.header('x-flakecheck-repo');
      if (!format || !repo || !context.req.raw.body) return context.json({ error: 'format, repo, and request body are required' }, 400);
      try {
        const result = await this.ingestStream(format, metadataFromHeaders(context.req.raw), context.req.raw.body);
        return context.json(result, 201);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Ingestion failed';
        return context.json({ error: message, partial: error instanceof Error && error.name === 'PartialBatchError' }, 500);
      }
    });
    app.get('/health', (context) => context.json({ service: this.env.SERVICE_NAME ?? 'ingestion-service', status: 'ok' }));
    return app.fetch(request, this.env);
  }
}

export default IngestionEntrypoint;
