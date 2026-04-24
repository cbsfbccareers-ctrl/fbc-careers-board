"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  EMPLOYMENT_TYPES,
  POSITIONS,
  VERTICAL_TAGS,
  VISA_SPONSORSHIP,
  type EmploymentType,
  type Position,
  type VerticalTag,
  type VisaSponsorship,
} from "@/lib/jobs-constants";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase";

const selectClassName = cn(
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs",
  "outline-none transition-[color,box-shadow]",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "dark:bg-input/30",
);

type ReviewForm = {
  title: string;
  company: string;
  locations: string[];
  employment_type: EmploymentType;
  position: Position;
  vertical_tag: VerticalTag;
  visa_sponsorship: VisaSponsorship;
  compensation: string;
  original_posted_date: string;
  application_deadline: string;
  application_url: string;
  expires_at: string;
};

type ApiIngestResult = {
  error?: string;
} & ReviewForm & { expires_at: string };

function isoToDateInputValue(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function tryNormalizeDateInput(s: string | undefined): string {
  if (!s?.trim()) return "";
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = Date.parse(s.trim());
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

function dateInputToIsoTimestamptz(d: string): string {
  if (!d) throw new Error("Missing date");
  return new Date(`${d}T12:00:00.000Z`).toISOString();
}

export default function AdminIngestPage() {
  const [url, setUrl] = useState("");
  const [rawTextFallback, setRawTextFallback] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ReviewForm | null>(null);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setScanning(true);
    setResult(null);
    const usingRawPasted = rawTextFallback.trim().length > 0;
    try {
      const payload: { url: string; rawText?: string } = {
        url: url.trim(),
      };
      if (usingRawPasted) {
        payload.rawText = rawTextFallback;
      }
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ApiIngestResult;
      if (!res.ok) {
        if (!usingRawPasted) {
          setShowFallback(true);
        } else {
          toast.error(data.error ?? "Scan failed");
        }
        return;
      }
      setShowFallback(false);
      setRawTextFallback("");
      setResult({
        title: data.title,
        company: data.company,
        locations: data.locations.length > 0 ? data.locations : [""],
        employment_type: data.employment_type,
        position: data.position,
        vertical_tag: data.vertical_tag,
        visa_sponsorship: data.visa_sponsorship,
        compensation: data.compensation,
        original_posted_date: tryNormalizeDateInput(
          data.original_posted_date,
        ),
        application_deadline: tryNormalizeDateInput(
          data.application_deadline,
        ),
        application_url: data.application_url,
        expires_at: isoToDateInputValue(data.expires_at),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setScanning(false);
    }
  }

  function updateField<K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) {
    setResult((prev) => (prev ? { ...prev, [key]: value } : null));
  }

  function setLocationIndex(index: number, value: string) {
    setResult((prev) => {
      if (!prev) return null;
      const next = [...prev.locations];
      next[index] = value;
      return { ...prev, locations: next };
    });
  }

  function addLocationRow() {
    setResult((prev) =>
      prev ? { ...prev, locations: [...prev.locations, ""] } : null,
    );
  }

  function removeLocationIndex(index: number) {
    setResult((prev) => {
      if (!prev) return null;
      const next = prev.locations.filter((_, i) => i !== index);
      return { ...prev, locations: next.length > 0 ? next : [""] };
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;

    const locations = result.locations
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (locations.length === 0) {
      toast.error("Add at least one location.");
      return;
    }
    if (!result.expires_at) {
      toast.error("Set an expires date.");
      return;
    }

    setSaving(true);
    try {
      let applicationUrl: string;
      try {
        const u = new URL(result.application_url.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          throw new Error("invalid");
        }
        applicationUrl = u.href;
      } catch {
        toast.error("Application URL must be a valid http or https link.");
        return;
      }

      const { error } = await supabase.from("jobs").insert({
        title: result.title.trim(),
        company: result.company.trim(),
        locations,
        employment_type: result.employment_type,
        position: result.position,
        vertical_tag: result.vertical_tag,
        visa_sponsorship: result.visa_sponsorship,
        compensation: result.compensation.trim() || null,
        original_posted_date: result.original_posted_date.trim() || null,
        application_deadline: result.application_deadline.trim() || null,
        application_url: applicationUrl,
        status: "Active",
        expires_at: dateInputToIsoTimestamptz(result.expires_at),
      });

      if (error) {
        if (error.code === "23505") {
          toast.error(
            "This job is already in the database (duplicate application URL).",
          );
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Job saved.");
      setResult(null);
      setUrl("");
      setRawTextFallback("");
      setShowFallback(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Ingest job</CardTitle>
          <CardDescription>
            Paste a job URL to scan, review every field, then save to the
            database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <form onSubmit={handleScan} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="job-url" className="text-sm font-medium">
                Job posting URL
              </label>
              <Input
                id="job-url"
                type="url"
                name="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                disabled={scanning}
                autoComplete="url"
              />
            </div>
            {showFallback && (
              <div
                className={cn(
                  "space-y-3 animate-in fade-in-0 slide-in-from-top-2 duration-300",
                )}
              >
                <div
                  role="status"
                  className={cn(
                    "rounded-lg border p-4 text-sm leading-relaxed shadow-sm",
                    "border-sky-200 bg-sky-50 text-sky-950",
                    "dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100",
                  )}
                >
                  Looks like this company&apos;s security blocked our automated
                  scanner. Please press <kbd className="font-mono text-xs">Cmd+A</kbd> /{" "}
                  <kbd className="font-mono text-xs">Ctrl+A</kbd> on the job page
                  to copy all the text, and paste it here to continue.
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="raw-job-fallback"
                    className="text-sm font-medium"
                  >
                    Raw Job Description (Fallback)
                  </label>
                  <textarea
                    id="raw-job-fallback"
                    className={cn(
                      "min-h-32 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs",
                      "placeholder:text-muted-foreground outline-none transition-[color,box-shadow]",
                      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      "dark:bg-input/30",
                    )}
                    name="rawText"
                    value={rawTextFallback}
                    onChange={(e) => setRawTextFallback(e.target.value)}
                    disabled={scanning}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={scanning || !url.trim()}>
                {scanning ? (
                  <>
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden
                    />
                    Scanning
                  </>
                ) : (
                  "Scan job"
                )}
              </Button>
            </div>
          </form>

          {result && (
            <form
              onSubmit={handleSave}
              className="space-y-4 border-t border-border pt-8"
            >
              <h2 className="text-sm font-semibold">Review and edit</h2>
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  Title
                </label>
                <Input
                  id="title"
                  value={result.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  required
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="company" className="text-sm font-medium">
                  Company
                </label>
                <Input
                  id="company"
                  value={result.company}
                  onChange={(e) => updateField("company", e.target.value)}
                  required
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Locations</p>
                <p className="text-xs text-muted-foreground">
                  One or more work locations. Add or remove rows as needed.
                </p>
                <div className="space-y-2">
                  {result.locations.map((line, i) => (
                    <div className="flex gap-2" key={i}>
                      <Input
                        value={line}
                        onChange={(e) => setLocationIndex(i, e.target.value)}
                        placeholder="e.g. New York, NY or Remote (US)"
                        disabled={saving}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => removeLocationIndex(i)}
                        disabled={saving}
                        aria-label="Remove location"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addLocationRow}
                  disabled={saving}
                >
                  <Plus className="size-4" />
                  Add location
                </Button>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="employment_type"
                  className="text-sm font-medium"
                >
                  Employment type
                </label>
                <select
                  id="employment_type"
                  className={selectClassName}
                  value={result.employment_type}
                  onChange={(e) =>
                    updateField(
                      "employment_type",
                      e.target.value as EmploymentType,
                    )
                  }
                  required
                  disabled={saving}
                >
                  {EMPLOYMENT_TYPES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="position" className="text-sm font-medium">
                  Position
                </label>
                <select
                  id="position"
                  className={selectClassName}
                  value={result.position}
                  onChange={(e) =>
                    updateField("position", e.target.value as Position)
                  }
                  required
                  disabled={saving}
                >
                  {POSITIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="vertical_tag" className="text-sm font-medium">
                  Vertical
                </label>
                <select
                  id="vertical_tag"
                  className={selectClassName}
                  value={result.vertical_tag}
                  onChange={(e) =>
                    updateField("vertical_tag", e.target.value as VerticalTag)
                  }
                  required
                  disabled={saving}
                >
                  {VERTICAL_TAGS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="visa_sponsorship"
                  className="text-sm font-medium"
                >
                  Visa sponsorship
                </label>
                <select
                  id="visa_sponsorship"
                  className={selectClassName}
                  value={result.visa_sponsorship}
                  onChange={(e) =>
                    updateField(
                      "visa_sponsorship",
                      e.target.value as VisaSponsorship,
                    )
                  }
                  required
                  disabled={saving}
                >
                  {VISA_SPONSORSHIP.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="compensation" className="text-sm font-medium">
                  Compensation (optional)
                </label>
                <Input
                  id="compensation"
                  value={result.compensation}
                  onChange={(e) => updateField("compensation", e.target.value)}
                  disabled={saving}
                  placeholder="Salary range, hourly, etc."
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="original_posted_date"
                  className="text-sm font-medium"
                >
                  Original posted date (optional)
                </label>
                <Input
                  id="original_posted_date"
                  type="date"
                  value={result.original_posted_date}
                  onChange={(e) =>
                    updateField("original_posted_date", e.target.value)
                  }
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="application_deadline"
                  className="text-sm font-medium"
                >
                  Application deadline (optional)
                </label>
                <Input
                  id="application_deadline"
                  type="date"
                  value={result.application_deadline}
                  onChange={(e) =>
                    updateField("application_deadline", e.target.value)
                  }
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  Informational: what the posting said. The listing expiry
                  you save to the database is{" "}
                  <span className="font-medium">Expires at</span> below.
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="application_url" className="text-sm font-medium">
                  Application URL
                </label>
                <Input
                  id="application_url"
                  type="url"
                  value={result.application_url}
                  onChange={(e) =>
                    updateField("application_url", e.target.value)
                  }
                  required
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="expires_at" className="text-sm font-medium">
                  Expires at
                </label>
                <Input
                  id="expires_at"
                  type="date"
                  value={result.expires_at}
                  onChange={(e) =>
                    updateField("expires_at", e.target.value)
                  }
                  required
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">
                  This is the value written to the database. The scan sets it
                  from a stated deadline or a 45-day default; you can override
                  it here.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden
                      />
                      Saving
                    </>
                  ) : (
                    "Save to database"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setResult(null);
                    setRawTextFallback("");
                    setShowFallback(false);
                  }}
                >
                  Scan another
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
