import type { Env } from "../types";
import { extractClaims, type Claim } from "./distillation";
import { judgeClaims } from "./claims-benchmark-judge";
import { getLlmProviderImpl } from "./llm-providers";
import { getModelPricing } from "./ai-usage";
import { getWorkProduct } from "./work-products";
import { wpKey } from "./work-products";

export interface RunNextResult {
  done: boolean;
  phase: "extraction" | "judging";
  progress: { done: number; total: number; current?: string };
}

/**
 * Execute the next pending task in a claims benchmark experiment.
 * Called repeatedly by the frontend polling loop.
 */
export async function runNextTask(
  experimentId: string,
  env: Env,
  prisma: any
): Promise<RunNextResult> {
  const experiment = await prisma.claimsExperiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment || experiment.status === "CANCELLED") {
    return { done: true, phase: "extraction", progress: { done: 0, total: 0 } };
  }

  // Phase 1: Extraction
  if (experiment.status === "RUNNING") {
    // Prioritize baseline tasks
    const pending = await prisma.claimsBenchmarkResult.findFirst({
      where: { experimentId, status: "PENDING" },
      orderBy: [{ isBaseline: "desc" }, { createdAt: "asc" }],
      include: { episode: { include: { podcast: true } } },
    });

    if (!pending) {
      // All extractions done — transition to JUDGING
      await prisma.claimsExperiment.update({
        where: { id: experimentId },
        data: { status: "JUDGING" },
      });
      return {
        done: false,
        phase: "judging",
        progress: { done: 0, total: experiment.totalJudgeTasks },
      };
    }

    await handleExtraction(pending, experiment, env, prisma);

    return {
      done: false,
      phase: "extraction",
      progress: {
        done: experiment.doneTasks + 1,
        total: experiment.totalTasks,
        current: `${pending.episode?.podcast?.title ?? ""} — ${pending.episode?.title ?? pending.episodeId}`,
      },
    };
  }

  // Phase 2: Judging
  if (experiment.status === "JUDGING") {
    const pending = await prisma.claimsBenchmarkResult.findFirst({
      where: { experimentId, isBaseline: false, judgeStatus: "PENDING" },
      include: { episode: { include: { podcast: true } } },
    });

    if (!pending) {
      // All judging done — transition to COMPLETED
      await prisma.claimsExperiment.update({
        where: { id: experimentId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return { done: true, phase: "judging", progress: { done: experiment.doneJudgeTasks, total: experiment.totalJudgeTasks } };
    }

    await handleJudging(pending, experiment, env, prisma);

    return {
      done: false,
      phase: "judging",
      progress: {
        done: experiment.doneJudgeTasks + 1,
        total: experiment.totalJudgeTasks,
        current: `Judging ${pending.model} on ${pending.episode?.title ?? pending.episodeId}`,
      },
    };
  }

  return { done: true, phase: "extraction", progress: { done: experiment.doneTasks, total: experiment.totalTasks } };
}

async function handleExtraction(
  result: any,
  experiment: any,
  env: Env,
  prisma: any
): Promise<void> {
  await prisma.claimsBenchmarkResult.update({
    where: { id: result.id },
    data: { status: "RUNNING" },
  });

  try {
    // Load transcript
    const transcriptKey = wpKey({ type: "TRANSCRIPT", episodeId: result.episodeId });
    const transcriptData = await getWorkProduct(env.R2, transcriptKey);
    if (!transcriptData) throw new Error("Transcript not found in R2");
    const transcript = new TextDecoder().decode(transcriptData);

    // Resolve model
    const providerRow = await prisma.aiModelProvider.findFirst({
      where: { provider: result.provider, model: { modelId: result.model } },
    });
    if (!providerRow) throw new Error(`No provider config for ${result.model}:${result.provider}`);
    const llm = getLlmProviderImpl(result.provider);
    const pricing = await getModelPricing(prisma, result.model, result.provider);

    // Extract claims
    const start = Date.now();
    const { claims, usage } = await extractClaims(
      llm,
      transcript,
      providerRow.providerModelId,
      8192,
      env,
      pricing
    );
    const latencyMs = Date.now() - start;

    // Store claims in R2
    const r2Key = `benchmark/claims/${experiment.id}/${result.episodeId}/${result.model}:${result.provider}.json`;
    await env.R2.put(r2Key, JSON.stringify(claims));

    // Update result
    await prisma.claimsBenchmarkResult.update({
      where: { id: result.id },
      data: {
        status: "COMPLETED",
        claimCount: claims.length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costDollars: usage.cost,
        latencyMs,
        r2ClaimsKey: r2Key,
        completedAt: new Date(),
      },
    });
    await prisma.claimsExperiment.update({
      where: { id: experiment.id },
      data: { doneTasks: { increment: 1 } },
    });
  } catch (err) {
    await markFailed(result, experiment.id, err, prisma);
  }
}

async function handleJudging(
  result: any,
  experiment: any,
  env: Env,
  prisma: any
): Promise<void> {
  await prisma.claimsBenchmarkResult.update({
    where: { id: result.id },
    data: { judgeStatus: "RUNNING" },
  });

  try {
    // Load baseline claims for this episode
    const baseline = await prisma.claimsBenchmarkResult.findFirst({
      where: { experimentId: experiment.id, episodeId: result.episodeId, isBaseline: true, status: "COMPLETED" },
    });
    if (!baseline?.r2ClaimsKey) throw new Error("Baseline claims not found");

    const baselineBytes = await getWorkProduct(env.R2, baseline.r2ClaimsKey);
    if (!baselineBytes) throw new Error("Baseline claims R2 object not found");
    const baselineClaims: Claim[] = JSON.parse(new TextDecoder().decode(baselineBytes));

    // Load candidate claims
    if (!result.r2ClaimsKey) throw new Error("Candidate claims not found");
    const candidateBytes = await getWorkProduct(env.R2, result.r2ClaimsKey);
    if (!candidateBytes) throw new Error("Candidate claims R2 object not found");
    const candidateClaims: Claim[] = JSON.parse(new TextDecoder().decode(candidateBytes));

    // Resolve judge model
    const judgeProviderRow = await prisma.aiModelProvider.findFirst({
      where: { provider: experiment.judgeProvider, model: { modelId: experiment.judgeModelId } },
    });
    if (!judgeProviderRow) throw new Error(`No provider config for judge ${experiment.judgeModelId}:${experiment.judgeProvider}`);
    const llm = getLlmProviderImpl(experiment.judgeProvider);
    const pricing = await getModelPricing(prisma, experiment.judgeModelId, experiment.judgeProvider);

    // Run judge
    const { output, coverageScore, weightedCoverageScore } = await judgeClaims(
      llm,
      baselineClaims,
      candidateClaims,
      judgeProviderRow.providerModelId,
      env,
      pricing
    );

    // Store verdicts in R2
    const r2Key = `benchmark/judge/${experiment.id}/${result.episodeId}/${result.model}:${result.provider}.json`;
    await env.R2.put(r2Key, JSON.stringify(output));

    // Update result
    await prisma.claimsBenchmarkResult.update({
      where: { id: result.id },
      data: {
        judgeStatus: "COMPLETED",
        coverageScore,
        weightedCoverageScore,
        hallucinations: output.hallucinations.length,
        r2JudgeKey: r2Key,
      },
    });
    await prisma.claimsExperiment.update({
      where: { id: experiment.id },
      data: { doneJudgeTasks: { increment: 1 } },
    });
  } catch (err) {
    await prisma.claimsBenchmarkResult.update({
      where: { id: result.id },
      data: {
        judgeStatus: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    await prisma.claimsExperiment.update({
      where: { id: experiment.id },
      data: { doneJudgeTasks: { increment: 1 } },
    });
  }
}

async function markFailed(
  result: any,
  experimentId: string,
  err: unknown,
  prisma: any
): Promise<void> {
  await prisma.claimsBenchmarkResult.update({
    where: { id: result.id },
    data: {
      status: "FAILED",
      errorMessage: err instanceof Error ? err.message : String(err),
    },
  });
  const experiment = await prisma.claimsExperiment.update({
    where: { id: experimentId },
    data: { doneTasks: { increment: 1 } },
  });

  // Check >50% failure threshold
  const failedCount = await prisma.claimsBenchmarkResult.count({
    where: { experimentId, status: "FAILED" },
  });
  if (failedCount > experiment.totalTasks / 2) {
    await prisma.claimsExperiment.update({
      where: { id: experimentId },
      data: { status: "FAILED", errorMessage: "Over 50% of tasks failed" },
    });
  }
}
