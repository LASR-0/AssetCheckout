import { prisma } from "../db/prisma.js";
import type { JobType } from "../../generated/prisma_client/client.js";
import { getSetting } from "../services/settings.js";

///  +-----------------------------------------------------------------+
///  |                       HANDLER REGISTRY                          |
///  +-----------------------------------------------------------------+

/**
 * A job handler receives the deserialized payload and returns a summary
 * object that gets stored (JSON-encoded) in resultSummary. Throwing marks
 * the job failed (and triggers retry if attempts remain).
 */
export type HandlerFn = (
  payload: Record<string, unknown>
) => Promise<Record<string, unknown>>;

const handlers = new Map<JobType, HandlerFn>();

export function registerHandler(type: JobType, handler: HandlerFn): void {
  handlers.set(type, handler);
}

///  +-----------------------------------------------------------------+
///  |                        RETRY POLICY                             |
///  +-----------------------------------------------------------------+

/**
 * Exponential backoff in milliseconds, based on how many attempts have
 * been made so far. 5^(attempts-1) minutes, capped at 60 minutes.
 *
 *   after attempt 1 fails → 5^0 = 1 minute
 *   after attempt 2 fails → 5^1 = 5 minutes
 *   after attempt 3 fails → 5^2 = 25 minutes (only reached if maxAttempts > 3)
 */
function backoffMs(attempts: number): number {
  const minutes = Math.min(Math.pow(5, attempts - 1), 60);
  return minutes * 60 * 1000;
}

///  +-----------------------------------------------------------------+
///  |                       STUCK RECOVERY                            |
///  +-----------------------------------------------------------------+

/**
 * Sweep any jobs left in Running back to Pending. This handles the case
 * where the server crashed mid-job: without this, those jobs would be
 * stuck in Running forever because the runner only picks up Pending work.
 *
 * attempts is preserved, so a job that crashed on its second attempt still
 * has its remaining retry budget. We accept that an idempotent job might
 * re-run a side effect it had already partially completed — re-running is
 * safer than silently dropping the work.
 */
async function recoverStuckJobs(): Promise<void> {
  const result = await prisma.backgroundJob.updateMany({
    where: { status: "Running" },
    data: { status: "Pending", startedAt: null },
  });
  if (result.count > 0) {
    console.log(`[JobRunner] Recovered ${result.count} stuck job(s) → Pending`);
  }
}

///  +-----------------------------------------------------------------+
///  |                           TICK                                  |
///  +-----------------------------------------------------------------+

/**
 * Process at most one job. Finds the oldest Pending job whose scheduledAt
 * is in the past, marks it Running, runs its handler, then records the
 * outcome (Completed with resultSummary, or Failed / retry on error).
 *
 * One job per tick keeps SQLite write pressure low and behaviour
 * predictable — no concurrent handlers racing.
 */
async function tick(): Promise<void> {
  const job = await prisma.backgroundJob.findFirst({
    where: {
      status: "Pending",
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
  });
  if (!job) return;

  // Claim the job: mark Running and bump the attempt counter.
  const attemptNumber = job.attempts + 1;
  await prisma.backgroundJob.update({
    where: { id: job.id },
    data: { status: "Running", startedAt: new Date(), attempts: attemptNumber },
  });

  const handler = handlers.get(job.type);
  if (!handler) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "Failed",
        errorMessage: `No handler registered for job type: ${job.type}`,
        completedAt: new Date(),
      },
    });
    return;
  }

  try {
    const payload = job.payload ? JSON.parse(job.payload) : {};
    const result = await handler(payload);

    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: "Completed",
        resultSummary: JSON.stringify(result),
        errorMessage: null,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (attemptNumber < job.maxAttempts) {
      // Retry: back to Pending, scheduled into the future with backoff.
      const nextRunAt = new Date(Date.now() + backoffMs(attemptNumber));
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "Pending",
          scheduledAt: nextRunAt,
          startedAt: null,
          errorMessage: message,
        },
      });
      console.warn(
        `[JobRunner] Job ${job.id} (${job.type}) failed attempt ${attemptNumber}/${job.maxAttempts}; retrying at ${nextRunAt.toISOString()}. Error: ${message}`
      );
    } else {
      // Retries exhausted — terminal failure.
      await prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: "Failed",
          errorMessage: message,
          completedAt: new Date(),
        },
      });
      console.error(
        `[JobRunner] Job ${job.id} (${job.type}) failed permanently after ${attemptNumber} attempt(s). Error: ${message}`
      );
    }
  }
}

///  +-----------------------------------------------------------------+
///  |                       RUNNER LIFECYCLE                          |
///  +-----------------------------------------------------------------+

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the poll loop. Reads the poll interval from settings (seeded from
 * the JOBS_POLL_INTERVAL_MS env var or its default). Runs stuck-job
 * recovery once before the first tick.
 *
 * Idempotent: calling twice is a no-op (guards against double-start in
 * dev hot-reload).
 */
export async function startRunner(): Promise<void> {
  if (intervalHandle) return;

  await recoverStuckJobs();

  const raw = await getSetting("jobs.pollIntervalMs");
  const intervalMs = Number(raw) > 0 ? Number(raw) : 5000;

  intervalHandle = setInterval(() => {
    tick().catch((err) =>
      console.error("[JobRunner] Unhandled tick error:", err)
    );
  }, intervalMs);

  console.log(`[JobRunner] Started — polling every ${intervalMs}ms`);
}

export function stopRunner(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}