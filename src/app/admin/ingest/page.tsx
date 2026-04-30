"use client";

import { useRef, useState } from "react";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { extractTextFromPdfFile } from "@/lib/extract-pdf-text";
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
  application_email: string;
  application_instructions: string;
  description: string;
  expires_at: string;
};

type ApiIngestResult = {
  error?: string;
  code?: string;
} & ReviewForm & { expires_at: string };

type ManualApplyMode = "link" | "email";

type ManualRoutingPayload = {
  applyMode?: ManualApplyMode;
  linkUrl?: string;
  applyEmail?: string;
  instructions?: string;
};

/** Exact JSON body from a successful POST /api/ingest (shadow log / audit). */
type RawAiSnapshot = Record<string, unknown>;

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

/** Returns canonical href or null if not a valid http(s) URL */
function parseValidApplicationUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** True if date input YYYY-MM-DD is strictly before local calendar today */
function isExpiryCalendarDateBeforeToday(ymd: string): boolean {
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  const expiry = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  expiry.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry.getTime() < today.getTime();
}

export default function AdminIngestPage() {
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [intakeTab, setIntakeTab] = useState<"scan" | "pdf" | "manual">(
    "scan",
  );
  const [url, setUrl] = useState("");
  const [manualRawJobText, setManualRawJobText] = useState("");
  const [manualApplyMode, setManualApplyMode] = useState<ManualApplyMode>(
    "link",
  );
  const [manualLinkUrl, setManualLinkUrl] = useState("");
  const [manualApplyEmail, setManualApplyEmail] = useState("");
  const [manualApplyInstructions, setManualApplyInstructions] = useState("");
  const [pdfDragging, setPdfDragging] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ReviewForm | null>(null);
  const [rawAiSnapshot, setRawAiSnapshot] = useState<RawAiSnapshot | null>(
    null,
  );

  function resetIngestionState() {
    setIntakeTab("scan");
    setUrl("");
    setManualRawJobText("");
    setManualApplyMode("link");
    setManualLinkUrl("");
    setManualApplyEmail("");
    setManualApplyInstructions("");
    setPdfDragging(false);
    setScanning(false);
    setSaving(false);
    setResult(null);
    setRawAiSnapshot(null);
    toast.dismiss();
  }

  function applyIngestExtract(data: ApiIngestResult) {
    const snapshot: RawAiSnapshot = JSON.parse(
      JSON.stringify(data),
    ) as RawAiSnapshot;
    setRawAiSnapshot(snapshot);
    setManualRawJobText("");
    setManualLinkUrl("");
    setManualApplyEmail("");
    setManualApplyInstructions("");
    setResult({
      title: data.title,
      company: data.company,
      locations: data.locations.length > 0 ? data.locations : [""],
      employment_type: data.employment_type,
      position: data.position,
      vertical_tag: data.vertical_tag,
      visa_sponsorship: data.visa_sponsorship,
      compensation: data.compensation ?? "",
      original_posted_date: tryNormalizeDateInput(data.original_posted_date),
      application_deadline: tryNormalizeDateInput(data.application_deadline),
      application_url: data.application_url ?? "",
      application_email: data.application_email ?? "",
      application_instructions: data.application_instructions ?? "",
      description: typeof data.description === "string" ? data.description : "",
      expires_at: isoToDateInputValue(data.expires_at),
    });
  }

  async function fetchIngestParse(
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const res = await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as ApiIngestResult;
    if (!res.ok) {
      toast.error(data.error ?? "Request failed");
      return false;
    }
    applyIngestExtract(data);
    return true;
  }

  async function ingestPost(payload: Record<string, unknown>): Promise<boolean> {
    setScanning(true);
    setResult(null);
    setRawAiSnapshot(null);
    try {
      return await fetchIngestParse(payload);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      return false;
    } finally {
      setScanning(false);
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const href = parseValidApplicationUrl(url);
    if (!href) {
      toast.error("Enter a valid http or https URL.");
      return;
    }

    setScanning(true);
    setResult(null);
    setRawAiSnapshot(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: href,
          intakeSource: "scan-jina",
        }),
      });
      const data = (await res.json()) as ApiIngestResult;
      if (!res.ok) {
        toast.error(data.error ?? "Scan failed — try manual entry or PDF.");
        setManualApplyMode("link");
        setManualLinkUrl(url.trim());
        setIntakeTab("manual");
        return;
      }
      applyIngestExtract(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setScanning(false);
    }
  }

  async function handlePdfFileSelected(file: File) {
    if (
      !file.name.toLowerCase().endsWith(".pdf") &&
      file.type !== "application/pdf"
    ) {
      toast.error("Choose a PDF file.");
      return;
    }
    setScanning(true);
    setResult(null);
    setRawAiSnapshot(null);
    try {
      const rawText = await extractTextFromPdfFile(file);
      if (!rawText.trim()) {
        toast.error("No extractable text in this PDF.");
        return;
      }
      await fetchIngestParse({
        rawText,
        intakeSource: "pdf",
        documentLabel: file.name,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not read this PDF.",
      );
    } finally {
      setScanning(false);
    }
  }

  function handlePdfDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPdfDragging(true);
  }

  function handlePdfDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPdfDragging(false);
  }

  function handlePdfDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPdfDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handlePdfFileSelected(f);
  }

  async function handleManualExtract(e: React.FormEvent) {
    e.preventDefault();
    const rawText = manualRawJobText.trim();
    if (!rawText) {
      toast.error("Paste the job posting text.");
      return;
    }

    let manualRouting: ManualRoutingPayload | undefined;
    if (manualApplyMode === "link") {
      const href = parseValidApplicationUrl(manualLinkUrl);
      if (!href) {
        toast.error("Enter a valid http(s) URL for applying.");
        return;
      }
      manualRouting = { applyMode: "link", linkUrl: href };
    } else {
      const em = manualApplyEmail.trim();
      if (!em || !em.includes("@")) {
        toast.error("Enter a valid email address.");
        return;
      }
      manualRouting = {
        applyMode: "email",
        applyEmail: em,
        instructions: manualApplyInstructions.trim() || undefined,
      };
    }

    await ingestPost({
      rawText,
      intakeSource: "manual",
      manualRouting,
    });
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
    if (isExpiryCalendarDateBeforeToday(result.expires_at)) {
      toast.error(
        "Cannot save: Expiry date is in the past. Please manually update the deadline.",
      );
      return;
    }

    const emailTrim = result.application_email.trim();
    const urlTrim = result.application_url.trim();

    let applicationEmail: string | null = null;
    let applicationUrl: string | null = null;
    let applicationInstructions: string | null =
      result.application_instructions.trim() || null;

    if (emailTrim) {
      if (!emailTrim.includes("@")) {
        toast.error("Application email does not look valid.");
        return;
      }
      applicationEmail = emailTrim.toLowerCase();
      applicationUrl = null;
      if (!applicationInstructions) {
        applicationInstructions = null;
      }
    } else if (urlTrim) {
      try {
        const u = new URL(urlTrim.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          throw new Error("invalid");
        }
        applicationUrl = u.href;
        applicationEmail = null;
      } catch {
        toast.error("Application URL must be a valid http or https link.");
        return;
      }
      applicationInstructions = null;
    } else {
      toast.error(
        "Provide either an application URL or an application email.",
      );
      return;
    }

    setSaving(true);
    try {
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
        application_email: applicationEmail,
        application_instructions: applicationInstructions,
        description: result.description.trim() || null,
        status: "Active",
        expires_at: dateInputToIsoTimestamptz(result.expires_at),
        raw_ai_output: rawAiSnapshot,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error(
            "This job is already in the database (possible duplicate posting).",
          );
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Job saved.");
      resetIngestionState();
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
            Scan a URL, extract from a PDF in the browser, or paste manually.
            Review every field, then save.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <Tabs
            value={intakeTab}
            onValueChange={(v) => setIntakeTab(v as "scan" | "pdf" | "manual")}
            className="w-full gap-4"
          >
            <TabsList className="grid h-auto w-full grid-cols-3 sm:max-w-xl">
              <TabsTrigger value="scan">Scan Link</TabsTrigger>
              <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
              <TabsTrigger value="manual">Manual Entry</TabsTrigger>
            </TabsList>
            <TabsContent value="scan" className="mt-4 space-y-4 outline-none">
              <form onSubmit={handleScan} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="job-url">Job posting URL</Label>
                  <Input
                    id="job-url"
                    type="url"
                    name="url"
                    inputMode="url"
                    placeholder="https://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                    disabled={scanning}
                    autoComplete="url"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be <span className="font-mono">http</span> or{" "}
                    <span className="font-mono">https</span>. If scanning is
                    blocked, switch to Manual Entry or PDF.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    disabled={
                      scanning || parseValidApplicationUrl(url) === null
                    }
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Scanning
                      </>
                    ) : (
                      "Scan job"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
            <TabsContent value="pdf" className="mt-4 outline-none">
              <div className="space-y-4">
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void handlePdfFileSelected(f);
                  }}
                />
                <div
                  onDragEnter={handlePdfDragOver}
                  onDragLeave={handlePdfDragLeave}
                  onDragOver={handlePdfDragOver}
                  onDrop={handlePdfDrop}
                  role="presentation"
                  className={cn(
                    "rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                    pdfDragging ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <Upload
                    className="mx-auto size-10 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="mt-3 text-sm font-medium">
                    Drag and drop a job posting PDF here
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Text is extracted in your browser only — the file is not
                    uploaded to our servers.
                  </p>
                  <Button
                    type="button"
                    className="mt-4"
                    variant="secondary"
                    disabled={scanning}
                    onClick={() => pdfInputRef.current?.click()}
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Extracting
                      </>
                    ) : (
                      "Choose PDF"
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="manual" className="mt-4 outline-none">
              <form onSubmit={handleManualExtract} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="manual-raw-job">Raw job description</Label>
                  <Textarea
                    id="manual-raw-job"
                    className="min-h-52 resize-y text-sm"
                    placeholder="Paste the complete job posting text."
                    value={manualRawJobText}
                    onChange={(e) => setManualRawJobText(e.target.value)}
                    disabled={scanning}
                    spellCheck={true}
                  />
                </div>
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    How should students apply?
                  </Label>
                  <RadioGroup
                    value={manualApplyMode}
                    onValueChange={(v) =>
                      setManualApplyMode(v as ManualApplyMode)
                    }
                    className="gap-4 sm:flex-row"
                    disabled={scanning}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem id="manual-apply-link" value="link" />
                      <Label
                        htmlFor="manual-apply-link"
                        className="cursor-pointer font-normal"
                      >
                        Link
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem id="manual-mode-email" value="email" />
                      <Label
                        htmlFor="manual-mode-email"
                        className="cursor-pointer font-normal"
                      >
                        Direct Email
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                {manualApplyMode === "link" ? (
                  <div className="space-y-2">
                    <Label htmlFor="manual-link-url">
                      Application URL (link)
                    </Label>
                    <Input
                      id="manual-link-url"
                      type="url"
                      inputMode="url"
                      placeholder="https://..."
                      value={manualLinkUrl}
                      onChange={(e) => setManualLinkUrl(e.target.value)}
                      disabled={scanning}
                      autoComplete="url"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="manual-email-address">
                        Email address
                      </Label>
                      <Input
                        id="manual-email-address"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="careers@company.com"
                        value={manualApplyEmail}
                        onChange={(e) =>
                          setManualApplyEmail(e.target.value)
                        }
                        disabled={scanning}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manual-apply-special">
                        Special instructions (optional)
                      </Label>
                      <Input
                        id="manual-apply-special"
                        placeholder="Subject line, attachments, naming…"
                        value={manualApplyInstructions}
                        onChange={(e) =>
                          setManualApplyInstructions(e.target.value)
                        }
                        disabled={scanning}
                      />
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={
                      scanning ||
                      !manualRawJobText.trim() ||
                      (manualApplyMode === "link"
                        ? parseValidApplicationUrl(manualLinkUrl) === null
                        : manualApplyEmail.trim().length === 0)
                    }
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Extracting
                      </>
                    ) : (
                      "Extract with AI"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>

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
              {result.application_email.trim().length > 0 ? (
                <div className="space-y-4 rounded-lg border border-border/80 bg-muted/20 p-4">
                  <p className="text-sm font-medium">Application (email)</p>
                  <div className="space-y-2">
                    <Label htmlFor="review-application-email">
                      Email address
                    </Label>
                    <Input
                      id="review-application-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      value={result.application_email}
                      onChange={(e) =>
                        updateField("application_email", e.target.value)
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="review-application-instructions">
                      Special instructions (optional)
                    </Label>
                    <Input
                      id="review-application-instructions"
                      value={result.application_instructions}
                      onChange={(e) =>
                        updateField(
                          "application_instructions",
                          e.target.value,
                        )
                      }
                      placeholder="Subject line, attachments, etc."
                      disabled={saving}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label
                    htmlFor="application_url"
                    className="text-sm font-medium"
                  >
                    Application URL
                  </Label>
                  <Input
                    id="application_url"
                    type="url"
                    value={result.application_url}
                    onChange={(e) =>
                      updateField("application_url", e.target.value)
                    }
                    required={
                      result.application_email.trim().length === 0
                    }
                    disabled={saving}
                  />
                </div>
              )}
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
              <div className="flex flex-wrap items-center gap-2 pt-2">
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
                    setRawAiSnapshot(null);
                  }}
                >
                  Intake another
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={resetIngestionState}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
