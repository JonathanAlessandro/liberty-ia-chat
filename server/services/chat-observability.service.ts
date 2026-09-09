import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export type ChatTrace = {
  id: string;
  requestStartedAt: number;
};

function memoryMb() {
  const usage = process.memoryUsage();
  return {
    rssMb: Math.round(usage.rss / 1024 / 1024),
    heapUsedMb: Math.round(usage.heapUsed / 1024 / 1024),
  };
}

export function createChatTrace(): ChatTrace {
  return { id: randomUUID().slice(0, 8), requestStartedAt: performance.now() };
}

export function chatTimer() {
  return performance.now();
}

export function logChatStage(trace: ChatTrace, stage: string, state: "started" | "completed" | "failed", startedAt?: number, details: Record<string, unknown> = {}) {
  console.info(JSON.stringify({
    event: "chat_timing",
    requestId: trace.id,
    stage,
    state,
    ...(startedAt === undefined ? {} : { durationMs: Math.round(performance.now() - startedAt) }),
    totalMs: Math.round(performance.now() - trace.requestStartedAt),
    ...details,
    ...memoryMb(),
  }));
}
