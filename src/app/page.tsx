import { supabase } from "@/utils/supabase";

import { JobBoard, type PublicJob } from "@/components/JobBoard";

/** Always fetch fresh listings (not cached from build time). */
export const dynamic = "force-dynamic";

export default async function Home() {
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, created_at, title, company, locations, compensation, vertical_tag, employment_type, application_url",
    )
    .eq("status", "Active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  const jobs = (data as PublicJob[] | null) ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Open roles
        </h1>
        <p className="text-base text-muted-foreground max-w-3xl leading-relaxed">
          Columbia FBC job board: TradFi, DeFi, crypto, and AI infrastructure
          opportunities. Active listings with future deadlines.
        </p>
      </div>
      {error ? (
        <p className="text-base text-destructive">
          Could not load job listings. Please refresh or try again later.
        </p>
      ) : (
        <JobBoard jobs={jobs} />
      )}
    </div>
  );
}
