"use server";

import { supabase } from "@/utils/supabase";

const SELECT_COLUMNS = [
  "id",
  "status",
  "created_at",
  "title",
  "company",
  "locations",
  "compensation",
  "vertical_tag",
  "employment_type",
  "position",
  "application_url",
  "application_email",
  "application_instructions",
  "application_deadline",
  "expires_at",
  "original_posted_date",
  "visa_sponsorship",
].join(", ");

export type JobListStatus = "Active" | "Archived";

export async function getJobsList({
  status,
  includeExpired = false,
}: {
  status: JobListStatus;
  /** When status is Active: false = only expires_at in the future (default). */
  includeExpired?: boolean;
}): Promise<{ data: unknown[] | null; error: string | null }> {
  let q = supabase
    .from("jobs")
    .select(SELECT_COLUMNS)
    .eq("status", status);

  if (status === "Active" && !includeExpired) {
    q = q.gt("expires_at", new Date().toISOString());
  }

  const { data, error } = await q.order("created_at", { ascending: false });
  return { data, error: error?.message ?? null };
}

export type JobUpdatePayload = {
  id: string;
  title: string;
  company: string;
  locations: string[];
  employment_type: string;
  position: string;
  vertical_tag: string;
  compensation: string | null;
  application_deadline: string | null;
  expires_at: string;
  application_url: string | null;
  application_email: string | null;
  application_instructions: string | null;
};

export async function updateJobFromBoard(
  payload: JobUpdatePayload,
): Promise<{ data: unknown | null; error: string | null }> {
  const { id, ...rest } = payload;
  const { data, error } = await supabase
    .from("jobs")
    .update({
      title: rest.title,
      company: rest.company,
      locations: rest.locations.filter((s) => s.trim().length > 0),
      employment_type: rest.employment_type,
      position: rest.position,
      vertical_tag: rest.vertical_tag,
      compensation: rest.compensation,
      application_deadline: rest.application_deadline,
      expires_at: rest.expires_at,
      application_url: rest.application_url,
      application_email: rest.application_email?.trim()
        ? rest.application_email.trim()
        : null,
      application_instructions: rest.application_instructions?.trim()
        ? rest.application_instructions.trim()
        : null,
    })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  return { data, error: error?.message ?? null };
}

export async function setJobStatus(
  id: string,
  status: "Active" | "Archived",
): Promise<{ data: unknown | null; error: string | null }> {
  const { data, error } = await supabase
    .from("jobs")
    .update({ status })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  return { data, error: error?.message ?? null };
}

export async function deleteJob(
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("jobs").delete().eq("id", id);

  return { error: error?.message ?? null };
}
