import {
  findModelRequestsAwaitingCompletion,
  rejectRequest,
} from "../../services/request.js";
import {
    isSnipeAssetLive,
  modelHasAnyAssets,
  deleteSnipeModel,
} from "../../services/snipeitassets.js";
import { getSetting } from "../../services/settings.js";

const DEFAULT_MAX_DELETES = 5;
const AUTOMATED_ACTOR = "Automated Job";
const ORPHAN_REASON = "Rejected by automated system; Orphaned Asset and Model";

/**
 * CLEANUP_ORPHAN_SNIPE_MODELS handler.
 *
 * Cleans up models we created in Snipe-IT whose skeleton asset was deleted
 * out-of-band by an admin (typically when fixing a mistake between the fill-
 * details and complete actions), leaving a model with no asset and a request
 * that can never be completed.
 *
 * Detection (provenance-gated — only ever considers models WE created):
 *   1. Candidate: findModelRequestsAwaitingCompletion (APPROVED request,
 *      COMPLETED ModelRequest, both Snipe IDs set).
 *   2. Trigger: the linked asset no longer exists (hard delete → null).
 *   3. Confirm: the model has no assets. We create exactly one skeleton per
 *      model, so asset-gone implies model-empty; this fails safe otherwise.
 *
 * Action per confirmed orphan — reject BEFORE delete, so a failure leaves Snipe
 * untouched and retryable. (Trade-off: if reject succeeds but delete is refused,
 * the request is now terminal and won't be re-detected, so that model needs
 * manual cleanup — recorded loudly in the summary.)
 *
 * Safety rails — the only handler that hard-deletes from the live asset system:
 *   - DRY-RUN by default (jobs.orphanCleanupDryRun): reports what it WOULD do
 *     without rejecting/deleting. Flip to "false" only after reviewing a run.
 *   - Per-run cap (jobs.orphanCleanupMaxDeletes, default 5).
 *   - Full audit of every found/deleted/rejected/skipped item in resultSummary.
 *
 * maxAttempts: 1 via ONE_SHOT_JOBS; the schedule is the retry.
 */
export async function cleanupOrphanSnipeModelsHandler(): Promise<Record<string, unknown>> {
  const dryRunRaw = await getSetting("jobs.orphanCleanupDryRun");
  const dryRun = (dryRunRaw ?? "true").toLowerCase() !== "false";

  const maxRaw = await getSetting("jobs.orphanCleanupMaxDeletes");
  const maxDeletes = Number(maxRaw) > 0 ? Number(maxRaw) : DEFAULT_MAX_DELETES;

  const candidates = await findModelRequestsAwaitingCompletion();

  const orphansFound: number[] = [];
  const deletedModels: number[] = [];
  const rejectedRequests: number[] = [];
  const skipped: string[] = [];
  const failures: string[] = [];
  let capReached = false;

  for (const mr of candidates) {
    const modelId = mr.snipeModelId!;
    const assetId = mr.linkedAssetId!;

    try {
      // (2) Trigger: is the linked asset gone?
      const live = await isSnipeAssetLive(assetId);
      if (live) {
        skipped.push(`mr#${mr.id}: asset ${assetId} still live — not orphaned`);
        continue;
      }

      // (3) Confirm: is the model genuinely empty? (We make exactly one
      // skeleton per model, so asset-gone should mean model-empty. If anything
      // unexpected is still attached, skip — fail safe, don't delete.)
      const hasAssets = await modelHasAnyAssets(modelId);
      if (hasAssets) {
        skipped.push(
          `mr#${mr.id}: asset ${assetId} gone but model ${modelId} still has asset(s) — not deleting`
        );
        continue;
      }

      orphansFound.push(mr.id);

      if (dryRun) {
        skipped.push(
          `mr#${mr.id}: DRY-RUN — would reject request ${mr.requestId} and delete model ${modelId}`
        );
        continue;
      }

      if (deletedModels.length >= maxDeletes) {
        capReached = true;
        skipped.push(`mr#${mr.id}: per-run cap (${maxDeletes}) reached — deferring to next run`);
        continue;
      }

      // Reject first (leaves Snipe untouched if this throws).
      const reason =
        "REJECTED: " + ORPHAN_REASON + "\n REQUEST: " + (mr.request.reason ?? "");
      await rejectRequest(mr.requestId, AUTOMATED_ACTOR, reason);
      rejectedRequests.push(mr.requestId);

      // Then delete the orphaned model — checked.
      const deleted = await deleteSnipeModel(modelId);
      if (deleted) {
        deletedModels.push(modelId);
      } else {
        failures.push(
          `mr#${mr.id}: request ${mr.requestId} rejected but model ${modelId} delete refused — manual cleanup needed (request now terminal, won't be re-detected)`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`mr#${mr.id}: ${msg}`);
    }
  }

  // Live runs fail loudly only if they accomplished nothing while erroring.
  // Dry runs always complete — you read the summary.
  const didWork = rejectedRequests.length > 0 || deletedModels.length > 0;
  if (!dryRun && !didWork && failures.length > 0) {
    throw new Error(
      `Orphan cleanup failed for all ${failures.length} action(s). First: ${failures[0]}`
    );
  }

  return {
    dryRun,
    maxDeletes,
    candidates: candidates.length,
    orphansFound: orphansFound.length,
    rejectedRequests,
    deletedModels,
    capReached,
    skipped,
    failed: failures.length,
    failures,
  };
}