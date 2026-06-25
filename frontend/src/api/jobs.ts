import { apiFetch } from "./client";


///  +-----------------------------------------------------------------+
///  |                          TYPES                                  |
///  +-----------------------------------------------------------------+

export type JobStatus = "Pending" | "Running" | "Completed" | "Failed";

export type JobType =
  | "SEND_REQUEST_NOTIFICATION"
  | "SYNC_REQUEST_TO_SHAREPOINT"
  | "REFRESH_CATEGORIES_CACHE"
  | "REFRESH_PRICES_CACHE"
  | "CLEANUP_STALE_REQUESTS"
  | "CLEANUP_ORPHAN_SNIPE_MODELS"
  | "PURGE_OLD_JOB_HISTORY"
  | "REMIND_SHIPPED_REQUESTS";

export type BackgroundJob = {
  id: number;
  type: string;
  status: string;
  payload: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
};

export type ListJobsParams = {
  status?: JobStatus;
  type?: JobType;
  page?: number;
  pageSize?: number;
};

export type ListJobsResponse = {
  jobs: BackgroundJob[];
  total: number;
  page: number;
  pageSize: number;
};

export type EnqueueResponse = {
  success: boolean;
  enqueued: boolean;
  message: string;
};

export type DryRunStates = Record<string, boolean>;
export type DryRunStatesResponse = { states: DryRunStates };

export type JobSchedule = { jobType: JobType; settingKey: string; cron: string };
export type SchedulesResponse = { schedules: JobSchedule[] };

export type ReminderThresholds = { d1: number; d2: number; d3: number };
export type ReminderThresholdsResponse = ReminderThresholds;

///  +-----------------------------------------------------------------+
///  |                           CALLS                                 |
///  +-----------------------------------------------------------------+

/**
 * Fetch a paginated, optionally-filtered page of the job history.
 * Admin-only on the backend; apiFetch supplies the dev/SSO identity headers.
 */
export async function listJobs(params: ListJobsParams = {}): Promise<ListJobsResponse> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.type) search.set("type", params.type);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));

  const qs = search.toString();
  return apiFetch<ListJobsResponse>(`/api/job${qs ? `?${qs}` : ""}`);
}

/**
 * Manually enqueue a job ("Run now"). Returns enqueued: false when the job
 * was deduped (an identical one is already pending), so the caller can show
 * an "already queued" message.
 */
export async function enqueueJob(type: JobType): Promise<EnqueueResponse> {
  return apiFetch<EnqueueResponse>("/api/job", {
    method: "POST",
    body: { type },
  });
}

export async function getJobSchedules(): Promise<SchedulesResponse> {
  return apiFetch<SchedulesResponse>("/api/job/schedules");
}

export async function saveJobSchedule(
  settingKey: string,
  cron: string
): Promise<{ settingKey: string; cron: string; note?: string }> {
  return apiFetch("/api/job/schedule", { method: "POST", body: { settingKey, cron } });
}

export async function getDryRunStates(): Promise<DryRunStatesResponse> {
  return apiFetch<DryRunStatesResponse>("/api/job/dry-run-states");
}

export async function setDryRun(jobType: JobType, dryRun: boolean): Promise<{ jobType: JobType; dryRun: boolean }> {
  return apiFetch("/api/job/dry-run", { method: "POST", body: { jobType, dryRun } });
}

export async function getReminderThresholds(): Promise<ReminderThresholds> {
  return apiFetch<ReminderThresholds>("/api/job/reminder-thresholds");
}

export async function saveReminderThresholds(
  thresholds: ReminderThresholds
): Promise<ReminderThresholds> {
  return apiFetch("/api/job/reminder-thresholds", {
    method: "POST",
    body: thresholds,
  });
}