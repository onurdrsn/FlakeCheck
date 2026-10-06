import { Hono } from 'hono';
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { AnalysisRPC } from '@flakecheck/shared-kernel';
import { createDatabase } from './db/client.js';
import { writeClassifications } from './db/writer.js';
import { classifySnapshot } from './classifier.js';
import { DrizzleSnapshotRepository } from './snapshot.js';
import { calculateWaste } from './waste.js';
import type { AnalysisSnapshot } from './model.js';

export interface Env { DATABASE_URL: string; SERVICE_NAME?: string; }

export class AnalysisEntrypoint extends WorkerEntrypoint<Env> implements AnalysisRPC {
  private repository() { return new DrizzleSnapshotRepository(createDatabase(this.env.DATABASE_URL)); }

  async analyzeRun(repo: string, runId: string, options?: { windowSize?: number }) {
    const snapshot = await this.repository().getSnapshot(repo, runId, options?.windowSize);
    const effectiveRunId = runId === 'latest' ? snapshot.runs[0]?.id ?? runId : runId;
    const classifications = classifySnapshot(snapshot, effectiveRunId);
    await writeClassifications(createDatabase(this.env.DATABASE_URL), classifications);
    return {
      classifiedCount: classifications.length,
      flakesFound: classifications.filter((item) => ['PROVEN_FLAKE', 'ENVIRONMENT_SENSITIVE', 'SUSPECTED_FLAKE'].includes(item.category)).length,
    };
  }

  async calculateSummary(repo: string) {
    const snapshot = await this.repository().getSnapshot(repo);
    const classifications = snapshot.attempts.length ? classifySnapshot(snapshot, snapshot.runs[0]?.id ?? '') : [];
    const flakyCategories = new Set(['PROVEN_FLAKE', 'ENVIRONMENT_SENSITIVE', 'SUSPECTED_FLAKE']);
    const flakyRunIds = new Set(classifications.filter((item) => flakyCategories.has(item.category)).map((item) => item.runId));
    const waste = calculateWaste(snapshot, flakyRunIds);
    const activeFlakes = classifications.filter((item) => flakyCategories.has(item.category)).length;
    return { healthScore: Math.max(0, 100 - activeFlakes), ...waste, activeFlakes };
  }

  async fetch(request: Request): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/health', (context) => context.json({ service: this.env.SERVICE_NAME ?? 'analysis-service', status: 'ok' }));
    return app.fetch(request, this.env);
  }
}

export default AnalysisEntrypoint;
