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
    const flakyCategories = new Set(['PROVEN_FLAKE', 'ENVIRONMENT_SENSITIVE', 'SUSPECTED_FLAKE']);
    const flakes = classifications.filter((item) => flakyCategories.has(item.category));
    const breakdown: Record<string, number> = {};
    for (const item of classifications) {
      breakdown[item.category] = (breakdown[item.category] ?? 0) + 1;
    }
    return {
      runId: effectiveRunId,
      windowSize: options?.windowSize ?? 30,
      runsAnalyzed: snapshot.runs.length,
      attemptsAnalyzed: snapshot.attempts.length,
      classifiedCount: classifications.length,
      flakesFound: flakes.length,
      cleanCount: Math.max(0, classifications.length - flakes.length),
      breakdown,
      latestRun: snapshot.runs[0] ? {
        id: snapshot.runs[0].id,
        branch: snapshot.runs[0].branch,
        commitSha: snapshot.runs[0].commitSha,
        createdAt: snapshot.runs[0].createdAt,
      } : null,
    };
  }

  async calculateSummary(repo: string) {
    const snapshot = await this.repository().getSnapshot(repo);
    const classifications = snapshot.attempts.length ? classifySnapshot(snapshot, snapshot.runs[0]?.id ?? '') : [];
    const flakyCategories = new Set(['PROVEN_FLAKE', 'ENVIRONMENT_SENSITIVE', 'SUSPECTED_FLAKE']);
    const flakyRunIds = new Set(classifications.filter((item) => flakyCategories.has(item.category)).map((item) => item.runId));
    const waste = calculateWaste(snapshot, flakyRunIds);
    const activeFlakes = classifications.filter((item) => flakyCategories.has(item.category)).length;
    const cleanTests = Math.max(0, classifications.length - activeFlakes);

    const recentRuns = snapshot.runs.map((run) => {
      const runAttempts = snapshot.attempts.filter((a) => a.runId === run.id);
      return {
        id: run.id,
        branch: run.branch,
        commitSha: run.commitSha,
        createdAt: run.createdAt,
        totalAttempts: runAttempts.length,
        passedAttempts: runAttempts.filter((a) => a.status === 'PASSED').length,
        failedAttempts: runAttempts.filter((a) => a.status === 'FAILED').length,
      };
    });

    return {
      healthScore: Math.max(0, 100 - activeFlakes),
      ...waste,
      activeFlakes,
      totalRuns: snapshot.runs.length,
      totalAttempts: snapshot.attempts.length,
      classifiedTests: classifications.length,
      cleanTests,
      lastRunId: snapshot.runs[0]?.id ?? null,
      lastBranch: snapshot.runs[0]?.branch ?? null,
      lastCommitSha: snapshot.runs[0]?.commitSha ?? null,
      lastAnalyzedAt: snapshot.runs[0]?.createdAt ?? null,
      recentRuns,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const app = new Hono<{ Bindings: Env }>();
    app.get('/health', (context) => context.json({ service: this.env.SERVICE_NAME ?? 'analysis-service', status: 'ok' }));
    return app.fetch(request, this.env);
  }
}

export default AnalysisEntrypoint;
