"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, MoreVertical, Plus, Table2, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

import {
  deleteJob,
  getJobsList,
  setJobStatus,
  updateJobFromBoard,
  type JobUpdatePayload,
} from "@/app/actions/jobs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  EMPLOYMENT_TYPES,
  POSITIONS,
  VERTICAL_TAGS,
} from "@/lib/jobs-constants";
import { formatAddedAgo } from "@/lib/job-display";
import { useAdmin } from "@/contexts/AdminContext";
import { getLocationColor } from "@/lib/location-pill-color";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type PublicJob = {
  id: string;
  status: string;
  created_at: string;
  title: string;
  company: string;
  locations: string[] | null;
  compensation: string | null;
  vertical_tag: string;
  employment_type: string | null;
  position: string | null;
  application_url: string | null;
  application_email: string | null;
  application_instructions: string | null;
  application_deadline: string | null;
  expires_at: string | null;
  original_posted_date: string | null;
  visa_sponsorship: string | null;
  /** AI-cleaned Markdown job description; null for legacy rows. */
  description: string | null;
};

type JobBoardProps = {
  jobs: PublicJob[];
};

/** Prefer email apply flow when stored; otherwise open application URL. */
function applyHref(job: PublicJob): string {
  const em = job.application_email?.trim();
  if (em) {
    const instructions = job.application_instructions?.trim();
    return instructions?.length
      ? `mailto:${em}?body=${encodeURIComponent(instructions)}`
      : `mailto:${em}`;
  }
  const u = job.application_url?.trim();
  return u ?? "#";
}

function applyLinkIsExternal(job: PublicJob): boolean {
  const em = job.application_email?.trim();
  if (em) return false;
  const u = job.application_url?.trim();
  return !!u?.startsWith("http");
}

/** True when expires_at has passed — greys out card/row styling when visible. */
function isJobExpiredForDisplay(job: PublicJob): boolean {
  if (job.expires_at == null || String(job.expires_at).trim() === "") {
    return false;
  }
  const t = Date.parse(job.expires_at);
  return !Number.isNaN(t) && t < Date.now();
}

const FILTER_ALL = "all" as const;

/** Industry / Job type / Position / View cells: wrap with gap-4 row, min-w-0 prevents grid overflow */
const FILTER_BAR_COL =
  "min-w-0 basis-full space-y-2 sm:min-w-[calc(50%-0.5rem)] sm:basis-[calc(50%-0.5rem)] sm:flex-1 xl:min-w-0 xl:basis-[calc((100%-3rem)/4)] xl:max-w-full";

type ViewMode = "grid" | "table";

function toDateInputValue(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function endOfLocalDayToIso(s: string): string {
  return new Date(`${s}T12:00:00.000Z`).toISOString();
}

function matchesSearch(job: PublicJob, q: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const pos = (job.position ?? "").toLowerCase();
  return (
    job.title.toLowerCase().includes(s) ||
    job.company.toLowerCase().includes(s) ||
    (job.locations ?? []).join(" ").toLowerCase().includes(s) ||
    pos.includes(s)
  );
}

function LocationPills({ locations }: { locations: string[] | null }) {
  const list = (locations ?? [])
    .map((l) => l.trim())
    .filter(Boolean);
  if (list.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((loc, i) => (
        <Badge
          key={`${i}-${loc}`}
          variant="secondary"
          className={cn(
            "max-w-full font-normal [text-wrap:balance]",
            getLocationColor(loc),
          )}
        >
          {loc}
        </Badge>
      ))}
    </div>
  );
}

type EditForm = {
  title: string;
  company: string;
  locations: string[];
  employment_type: string;
  position: string;
  vertical_tag: string;
  compensation: string;
  application_deadline: string;
  expires_at: string;
  application_url: string;
  application_email: string;
  application_instructions: string;
};

const emptyForm = (job: PublicJob): EditForm => ({
  title: job.title,
  company: job.company,
  locations:
    job.locations && job.locations.length > 0 ? [...job.locations] : [""],
  employment_type: job.employment_type?.trim() || EMPLOYMENT_TYPES[0],
  position: job.position?.trim() || POSITIONS[0],
  vertical_tag: job.vertical_tag,
  compensation: job.compensation?.trim() ?? "",
  application_deadline: toDateInputValue(job.application_deadline),
  expires_at: toDateInputValue(job.expires_at),
  application_url: job.application_url?.trim() ?? "",
  application_email: job.application_email?.trim() ?? "",
  application_instructions: job.application_instructions?.trim() ?? "",
});

export function JobBoard({ jobs: initialFromServer }: JobBoardProps) {
  const { isAdmin } = useAdmin();
  const [listJobs, setListJobs] = useState<PublicJob[]>(initialFromServer);
  const [showArchived, setShowArchived] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [industryFilter, setIndustryFilter] = useState<string>(FILTER_ALL);
  const [employmentFilter, setEmploymentFilter] = useState<string>(FILTER_ALL);
  const [positionFilter, setPositionFilter] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");

  const [editJob, setEditJob] = useState<PublicJob | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<PublicJob | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicJob | null>(null);
  const [detailsJob, setDetailsJob] = useState<PublicJob | null>(null);

  useEffect(() => {
    if (isAdmin) return;
    const id = requestAnimationFrame(() => {
      setShowArchived(false);
    });
    return () => cancelAnimationFrame(id);
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAdmin) {
        const { data, error } = await getJobsList({
          status: "Active",
          includeExpired: showExpired,
        });
        if (cancelled) return;
        if (error) {
          toast.error(error);
          return;
        }
        if (data) {
          setListJobs(data as PublicJob[]);
        }
        return;
      }

      const { data, error } = await getJobsList({
        status: showArchived ? "Archived" : "Active",
        includeExpired: showArchived ? true : showExpired,
      });
      if (cancelled) return;
      if (error) {
        toast.error(error);
        return;
      }
      if (data) {
        setListJobs(data as PublicJob[]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, showArchived, showExpired]);

  const displayJobs = listJobs;

  function openEdit(job: PublicJob) {
    setEditJob(job);
    setEditForm(emptyForm(job));
  }

  function closeEdit() {
    setEditJob(null);
    setEditForm(null);
  }

  const filtered = useMemo(() => {
    return displayJobs.filter((job) => {
      if (industryFilter !== FILTER_ALL && job.vertical_tag !== industryFilter) {
        return false;
      }
      if (employmentFilter !== FILTER_ALL) {
        const t = job.employment_type?.trim() ?? "";
        if (t !== employmentFilter) return false;
      }
      if (positionFilter !== FILTER_ALL) {
        const p = job.position?.trim() ?? "";
        if (p !== positionFilter) return false;
      }
      if (!matchesSearch(job, searchQuery)) return false;
      return true;
    });
  }, [
    displayJobs,
    industryFilter,
    employmentFilter,
    positionFilter,
    searchQuery,
  ]);

  const applyJobPatch = useCallback(
    (updated: PublicJob) => {
      setListJobs((prev) =>
        prev.map((j) => (j.id === updated.id ? { ...j, ...updated } : j)),
      );
    },
    [],
  );

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editJob || !editForm) return;
    const locs = editForm.locations.map((l) => l.trim()).filter(Boolean);
    if (locs.length === 0) {
      toast.error("Add at least one location.");
      return;
    }
    if (!editForm.expires_at) {
      toast.error("Set an expires date.");
      return;
    }
    const emailTrim = editForm.application_email.trim();
    const urlTrim = editForm.application_url.trim();

    let application_email: string | null = null;
    let application_url: string | null = null;
    let application_instructions: string | null =
      editForm.application_instructions.trim() || null;

    if (emailTrim) {
      if (!emailTrim.includes("@")) {
        toast.error("Application email does not look valid.");
        return;
      }
      application_email = emailTrim.toLowerCase();
      application_url = null;
      if (!application_instructions) application_instructions = null;
    } else if (urlTrim) {
      try {
        const u = new URL(urlTrim);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
        application_url = u.href;
      } catch {
        toast.error("Application URL must be valid http(s).");
        return;
      }
      application_instructions = null;
    } else {
      toast.error("Provide either an application URL or an application email.");
      return;
    }

    setSaveLoading(true);
    try {
      const payload: JobUpdatePayload = {
        id: editJob.id,
        title: editForm.title.trim(),
        company: editForm.company.trim(),
        locations: locs,
        employment_type: editForm.employment_type,
        position: editForm.position,
        vertical_tag: editForm.vertical_tag,
        compensation: editForm.compensation.trim() || null,
        application_deadline: editForm.application_deadline.trim() || null,
        expires_at: endOfLocalDayToIso(editForm.expires_at),
        application_url,
        application_email,
        application_instructions,
      };
      const { data, error } = await updateJobFromBoard(payload);
      if (error) {
        toast.error(error);
        return;
      }
      const row = data as PublicJob;
      applyJobPatch(row);
      closeEdit();
      toast.success("Job updated");
    } finally {
      setSaveLoading(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    const next: "Active" | "Archived" =
      archiveTarget.status === "Archived" ? "Active" : "Archived";
    const { error } = await setJobStatus(archiveTarget.id, next);
    if (error) {
      toast.error(error);
      return;
    }
    setArchiveTarget(null);
    const { data: fresh, error: fetchErr } = await getJobsList({
      status: showArchived ? "Archived" : "Active",
      includeExpired: showArchived ? true : showExpired,
    });
    if (fetchErr) {
      toast.error(fetchErr);
    } else if (fresh) {
      setListJobs(fresh as PublicJob[]);
    }
    toast.success(next === "Archived" ? "Job archived" : "Job reactivated");
  }

  async function confirmDeleteJob() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const { error } = await deleteJob(id);
    if (error) {
      toast.error(error);
      return;
    }
    setDeleteTarget(null);
    setListJobs((prev) => prev.filter((j) => j.id !== id));
    toast.success("Job permanently deleted");
  }

  if (!isAdmin && listJobs.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        No open roles at the moment. Check back soon.
      </p>
    );
  }

  return (
    <div className="w-full space-y-8 text-base leading-relaxed">
      <Sheet
        open={!!detailsJob}
        onOpenChange={(open) => {
          if (!open) setDetailsJob(null);
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl"
        >
          {detailsJob ? (
            <>
              <SheetHeader className="border-b border-border/80 px-6 py-4 text-left">
                <SheetTitle className="pr-8 text-left text-xl leading-snug">
                  {detailsJob.title}
                </SheetTitle>
                <SheetDescription className="text-left text-base">
                  {detailsJob.company}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {detailsJob.description != null &&
                String(detailsJob.description).trim() !== "" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{detailsJob.description}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No description is available for this listing yet. Older
                    postings may not include an AI-cleaned summary.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet
        open={!!editJob}
        onOpenChange={(o) => {
          if (!o) closeEdit();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full max-w-lg flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
        >
          {editJob && editForm && (
            <form onSubmit={onSaveEdit} className="flex flex-1 flex-col">
              <SheetHeader className="border-b border-border/80 px-6 py-4">
                <SheetTitle>Edit job</SheetTitle>
                <SheetDescription>
                  Update the listing. Changes save to the database.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, title: e.target.value } : f))
                    }
                    className="text-base"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-company">Company</Label>
                  <Input
                    id="edit-company"
                    value={editForm.company}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, company: e.target.value } : f))
                    }
                    className="text-base"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Locations</p>
                  {editForm.locations.map((line, i) => (
                    <div className="flex gap-2" key={i}>
                      <Input
                        value={line}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditForm((f) => {
                            if (!f) return f;
                            const next = [...f.locations];
                            next[i] = v;
                            return { ...f, locations: next };
                          });
                        }}
                        className="text-base"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => {
                          setEditForm((f) => {
                            if (!f) return f;
                            const next = f.locations.filter((_, j) => j !== i);
                            return {
                              ...f,
                              locations: next.length > 0 ? next : [""],
                            };
                          });
                        }}
                        aria-label="Remove location"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setEditForm((f) =>
                        f ? { ...f, locations: [...f.locations, ""] } : f,
                      )
                    }
                  >
                    <Plus className="size-4" />
                    Add location
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Job type</Label>
                  <Select
                    value={editForm.employment_type}
                    onValueChange={(v) =>
                      setEditForm((f) => (f ? { ...f, employment_type: v } : f))
                    }
                  >
                    <SelectTrigger className="text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Select
                    value={editForm.position}
                    onValueChange={(v) =>
                      setEditForm((f) => (f ? { ...f, position: v } : f))
                    }
                  >
                    <SelectTrigger className="text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Select
                    value={editForm.vertical_tag}
                    onValueChange={(v) =>
                      setEditForm((f) => (f ? { ...f, vertical_tag: v } : f))
                    }
                  >
                    <SelectTrigger className="text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VERTICAL_TAGS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-comp">Compensation (salary)</Label>
                  <Input
                    id="edit-comp"
                    value={editForm.compensation}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, compensation: e.target.value } : f,
                      )
                    }
                    className="text-base"
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-deadline">Application deadline</Label>
                  <Input
                    id="edit-deadline"
                    type="date"
                    value={editForm.application_deadline}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, application_deadline: e.target.value } : f,
                      )
                    }
                    className="text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-expires">Listing expires</Label>
                  <Input
                    id="edit-expires"
                    type="date"
                    value={editForm.expires_at}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, expires_at: e.target.value } : f,
                      )
                    }
                    className="text-base"
                    required
                  />
                </div>
                {editForm.application_email.trim().length > 0 ? (
                  <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3">
                    <Label className="text-base">Apply by email</Label>
                    <div className="space-y-2">
                      <Label htmlFor="edit-email" className="text-sm">
                        Email
                      </Label>
                      <Input
                        id="edit-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        value={editForm.application_email}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f
                              ? { ...f, application_email: e.target.value }
                              : f,
                          )
                        }
                        className="text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-inst" className="text-sm">
                        Instructions (optional)
                      </Label>
                      <Input
                        id="edit-inst"
                        value={editForm.application_instructions}
                        onChange={(e) =>
                          setEditForm((f) =>
                            f
                              ? {
                                  ...f,
                                  application_instructions: e.target.value,
                                }
                              : f,
                          )
                        }
                        className="text-base"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="edit-url">Application URL</Label>
                    <Input
                      id="edit-url"
                      type="url"
                      value={editForm.application_url}
                      onChange={(e) =>
                        setEditForm((f) =>
                          f ? { ...f, application_url: e.target.value } : f,
                        )
                      }
                      className="text-base"
                      required={editForm.application_email.trim().length === 0}
                    />
                  </div>
                )}
              </div>
              <SheetFooter className="mt-auto border-t border-border/80 p-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEdit}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saveLoading}>
                  {saveLoading ? "Saving…" : "Save changes"}
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!archiveTarget}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.status === "Archived"
                ? "Reactivate this job?"
                : "Archive this job?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.status === "Archived"
                ? "The job will return to the active board for students (subject to other rules)."
                : "Are you sure you want to archive this job? It can be reactivated later from archived view."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmArchive}>
              {archiveTarget?.status === "Archived" ? "Reactivate" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will permanently delete the job and its
              history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              type="button"
              onClick={() => {
                void confirmDeleteJob();
              }}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className={cn(
          "flex min-h-0 w-full flex-col gap-4 overflow-visible rounded-xl border border-border/70 bg-muted/30",
          "p-4 sm:p-5",
          "shadow-sm",
        )}
      >
        <div className="min-w-0 space-y-2">
          <label
            htmlFor="job-search"
            className="text-sm font-medium sm:text-base"
          >
            Search
          </label>
          <Input
            id="job-search"
            type="search"
            placeholder="Search roles, companies, or locations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full min-w-0 text-base"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex w-full min-w-0 flex-wrap gap-4">
          <div className={FILTER_BAR_COL}>
            <p className="text-sm font-medium sm:text-base">Industry</p>
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger
                className="h-10 w-full min-w-0 text-base"
                aria-label="Filter by industry / vertical"
              >
                <SelectValue placeholder="All verticals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL} className="text-base">
                  All verticals
                </SelectItem>
                {VERTICAL_TAGS.map((tag) => (
                  <SelectItem key={tag} value={tag} className="text-base">
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={FILTER_BAR_COL}>
            <p className="text-sm font-medium sm:text-base">Job type</p>
            <Select
              value={employmentFilter}
              onValueChange={setEmploymentFilter}
            >
              <SelectTrigger
                className="h-10 w-full min-w-0 text-base"
                aria-label="Filter by employment type"
              >
                <SelectValue placeholder="All job types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL} className="text-base">
                  All job types
                </SelectItem>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="text-base">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={FILTER_BAR_COL}>
            <p className="text-sm font-medium sm:text-base">Position</p>
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger
                className="h-10 w-full min-w-0 text-base"
                aria-label="Filter by position / function"
              >
                <SelectValue placeholder="All positions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL} className="text-base">
                  All positions
                </SelectItem>
                {POSITIONS.map((p) => (
                  <SelectItem key={p} value={p} className="text-base">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={FILTER_BAR_COL}>
            <p className="text-sm font-medium sm:text-base">View</p>
            <div className="flex min-h-[2.5rem] w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-3">
              {isAdmin ? (
                <div className="flex h-10 shrink-0 items-center gap-2 self-center rounded-md border border-input bg-background px-2.5 text-sm min-[500px]:px-3 min-[500px]:text-base">
                  <Switch
                    id="show-archived"
                    className="shrink-0"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    aria-label="Show archived jobs"
                  />
                  <label
                    htmlFor="show-archived"
                    className="cursor-pointer whitespace-nowrap leading-none text-muted-foreground"
                  >
                    Show archived
                  </label>
                </div>
              ) : (
                <Tooltip>
                    <TooltipTrigger asChild>
                    <div className="flex h-10 shrink-0 cursor-not-allowed items-center gap-2 self-center rounded-md border border-input bg-background/80 px-2.5 text-sm opacity-50 min-[500px]:px-3 min-[500px]:text-base">
                      <Switch
                        id="show-archived"
                        className="shrink-0"
                        checked={false}
                        disabled
                        aria-label="Show archived jobs (admin mode required)"
                      />
                      <span className="whitespace-nowrap leading-none text-muted-foreground">
                        Show archived
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[16rem]">
                    Turn on Admin mode in the top bar to show archived
                    listings.
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="flex h-10 shrink-0 items-center gap-2 self-center rounded-md border border-input bg-background px-2.5 text-sm min-[500px]:px-3 min-[500px]:text-base">
                <Switch
                  id="show-expired"
                  className="shrink-0"
                  checked={showExpired}
                  onCheckedChange={setShowExpired}
                  aria-label="Show expired job listings"
                />
                <label
                  htmlFor="show-expired"
                  className="cursor-pointer whitespace-nowrap leading-none text-muted-foreground"
                >
                  Show expired
                </label>
              </div>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => {
                  if (v) setViewMode(v as ViewMode);
                }}
                variant="outline"
                size="lg"
                spacing={0}
                className="h-10 min-h-10 w-full max-w-full min-w-0 flex-1 basis-full sm:flex-1 sm:basis-auto"
              >
                <ToggleGroupItem
                  value="grid"
                  aria-label="Grid view"
                  className="min-h-10 flex-1 min-w-0 gap-2 text-base data-[state=on]:bg-accent sm:flex-initial sm:justify-center"
                >
                  <LayoutGrid className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">Grid</span>
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="table"
                  aria-label="Table view"
                  className="min-h-10 flex-1 min-w-0 gap-2 text-base data-[state=on]:bg-accent sm:flex-initial sm:justify-center"
                >
                  <Table2 className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">Table</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </div>
      </div>

      {isAdmin && displayJobs.length === 0 && (
        <p className="text-base text-muted-foreground">
          {showArchived
            ? "No archived jobs yet."
            : "No active jobs in the database for this view."}
        </p>
      )}

      {displayJobs.length > 0 && filtered.length === 0 ? (
        <p className="text-base text-muted-foreground">
          No jobs match your filters. Try clearing search or setting filters
          to &quot;All&quot;.
        </p>
      ) : null}

      {filtered.length > 0 && viewMode === "table" ? (
        <div className="w-full min-w-0 overflow-x-auto overflow-y-visible rounded-lg border border-border/80 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {isAdmin && <TableHead className="w-8 p-1" aria-hidden />}
                <TableHead className="h-8 min-w-[8rem] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Role
                </TableHead>
                <TableHead className="h-8 min-w-[6rem] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Company
                </TableHead>
                <TableHead className="h-8 min-w-[9rem] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Location
                </TableHead>
                <TableHead className="h-8 min-w-[5rem] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="h-8 min-w-[6rem] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Position
                </TableHead>
                <TableHead className="h-8 min-w-[5rem] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Industry
                </TableHead>
                <TableHead className="h-8 min-w-[6rem] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Added
                </TableHead>
                <TableHead className="h-8 w-[1%] min-w-[12rem] py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((job) => {
                const ghostVacancy = isJobExpiredForDisplay(job);
                return (
                  <TableRow
                    key={job.id}
                    className={cn(
                      "text-sm",
                      ghostVacancy && "bg-muted/20 opacity-60 grayscale",
                    )}
                  >
                  {isAdmin && (
                    <TableCell className="p-1 align-top">
                      <RowActions
                        job={job}
                        onEdit={() => openEdit(job)}
                        onArchive={() => setArchiveTarget(job)}
                        onDelete={() => setDeleteTarget(job)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="whitespace-normal py-1.5 align-top font-medium text-foreground">
                    {job.title}
                  </TableCell>
                  <TableCell className="whitespace-normal py-1.5 align-top">
                    {job.company}
                  </TableCell>
                  <TableCell className="min-w-[9rem] max-w-[14rem] py-1.5 align-top">
                    <LocationPills locations={job.locations} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-1.5 align-top text-muted-foreground">
                    {job.employment_type?.trim() || "—"}
                  </TableCell>
                  <TableCell className="align-top">
                    {job.position?.trim() ? (
                      <Badge
                        variant="secondary"
                        className="whitespace-nowrap text-xs"
                      >
                        {job.position.trim()}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-1.5 align-top">
                    <Badge variant="outline" className="text-xs">
                      {job.vertical_tag}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-1.5 align-top text-xs text-muted-foreground">
                    {formatAddedAgo(job.created_at)}
                  </TableCell>
                  <TableCell className="py-1.5 text-right align-top">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-sm"
                        onClick={() => setDetailsJob(job)}
                      >
                        View Details
                      </Button>
                      <Button
                        size="sm"
                        className="text-sm"
                        variant={
                          ghostVacancy ? "secondary" : "default"
                        }
                        asChild
                      >
                        <a
                          href={applyHref(job)}
                          {...(applyLinkIsExternal(job)
                            ? {
                                target: "_blank" as const,
                                rel: "noopener noreferrer",
                              }
                            : {})}
                        >
                          {ghostVacancy ? "Go to Expired Link" : "Apply"}
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {filtered.length > 0 && viewMode === "grid" ? (
        <ul
          className={cn(
            "grid list-none gap-6 p-0 sm:gap-7 lg:gap-8",
            "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
          )}
        >
          {filtered.map((job) => {
            const ghostVacancy = isJobExpiredForDisplay(job);
            return (
            <li key={job.id} className="min-w-0">
              <Card
                className={cn(
                  "relative flex h-full flex-col border-border/80 shadow-md",
                  "transition-shadow hover:shadow-lg",
                  !ghostVacancy &&
                    job.status === "Archived" &&
                    "opacity-90",
                  ghostVacancy && "opacity-60 grayscale hover:opacity-65",
                )}
              >
                {isAdmin && (
                  <div className="absolute right-2 top-2 z-10">
                    <RowActions
                      job={job}
                      onEdit={() => openEdit(job)}
                      onArchive={() => setArchiveTarget(job)}
                      onDelete={() => setDeleteTarget(job)}
                    />
                  </div>
                )}
                <CardHeader className="space-y-2 pr-10 px-6 pt-6 sm:px-7 sm:pt-7">
                  <h2 className="text-balance pr-2 text-xl font-bold leading-snug text-foreground">
                    {job.title}
                  </h2>
                  <p className="text-base text-muted-foreground">
                    {job.company}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Badge variant="secondary" className="text-sm font-medium">
                      {job.vertical_tag}
                    </Badge>
                    {job.position?.trim() ? (
                      <Badge variant="outline" className="text-sm font-medium">
                        {job.position.trim()}
                      </Badge>
                    ) : null}
                    {isAdmin && job.status === "Archived" ? (
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        Archived
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3 px-6 pb-2 text-base sm:px-7">
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Locations
                    </p>
                    <LocationPills locations={job.locations} />
                  </div>
                  {job.employment_type != null &&
                  String(job.employment_type).trim() !== "" ? (
                    <p>
                      <span className="font-medium text-foreground/90">
                        Type:{" "}
                      </span>
                      <span className="text-muted-foreground">
                        {String(job.employment_type).trim()}
                      </span>
                    </p>
                  ) : null}
                  {job.compensation != null &&
                  String(job.compensation).trim() !== "" ? (
                    <p>
                      <span className="font-medium text-foreground/90">
                        Compensation:{" "}
                      </span>
                      <span className="text-muted-foreground">
                        {String(job.compensation).trim()}
                      </span>
                    </p>
                  ) : null}
                </CardContent>
                <div className="px-6 pb-1 sm:px-7">
                  <p className="text-right text-xs text-muted-foreground">
                    {formatAddedAgo(job.created_at)}
                  </p>
                </div>
                <CardFooter className="mt-auto flex flex-col gap-2 px-6 pb-6 sm:flex-row sm:px-7">
                  <Button
                    asChild
                    className={cn(
                      "h-11 w-full flex-1 text-base font-medium sm:min-w-0",
                      ghostVacancy &&
                        "border border-input shadow-none",
                    )}
                    size="default"
                    variant={ghostVacancy ? "secondary" : "default"}
                  >
                    <a
                      href={applyHref(job)}
                      {...(applyLinkIsExternal(job)
                        ? {
                            target: "_blank" as const,
                            rel: "noopener noreferrer",
                          }
                        : {})}
                    >
                      {ghostVacancy ? "Go to Expired Link" : "Apply Now"}
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full flex-1 text-base font-medium sm:w-auto sm:min-w-[10.5rem]"
                    onClick={() => setDetailsJob(job)}
                  >
                    View Details
                  </Button>
                </CardFooter>
              </Card>
            </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function RowActions({
  job,
  onEdit,
  onArchive,
  onDelete,
}: {
  job: PublicJob;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const archived = job.status === "Archived";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Job actions"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchive}>
          {archived ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
