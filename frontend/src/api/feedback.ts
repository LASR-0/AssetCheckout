import { apiFetch } from "./client";

export type FeedbackResponse = "improved" | "no_change" | "worse";

export type FeedbackInput = {
  improvedRequesting: FeedbackResponse;
  improvesItOverall: FeedbackResponse;
  comments?: string;
};

export type FeedbackRow = {
  id: number;
  improvedRequesting: FeedbackResponse;
  improvesItOverall: FeedbackResponse;
  comments: string | null;
  createdAt: string;
};

export async function getFeedbackEnabled(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>("/api/feedback/enabled");
}

export async function submitFeedback(
  input: FeedbackInput
): Promise<{ success: boolean; message: string }> {
  return apiFetch("/api/feedback", { method: "POST", body: input });
}

export async function getAllFeedback(): Promise<{ feedback: FeedbackRow[] }> {
  return apiFetch<{ feedback: FeedbackRow[] }>("/api/feedback/all");
}

export async function setFeedbackEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
  return apiFetch("/api/feedback/enabled", { method: "POST", body: { enabled } });
}