"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, MoreVertical, Plus, Table2, Trash2 } from "lucide-react";

import {
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
  application_url: string;
  application_deadline: string | null;
  expires_at: string | null;
  original_posted_date: string | null;
  visa_sponsorship: string | null;
};

type JobBoardProps = {
  jobs: PublicJob[];
};

const FILTER_ALL = "all" as const;

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
  application_url: job.application_url,
});

export function JobBoard({ jobs: initialFromServer }: JobBoardProps) {
  const { isAdmin } = useAdmin();
  const [listJobs, setListJobs] = useState<PublicJob[]>(initialFromServer);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [industryFilter, setIndustryFilter] = useState<string>(FILTER_ALL);
  const [employmentFilter, setEmploymentFilter] = useState<string>(FILTER_ALL);
  const [positionFilter, setPositionFilter] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");

  const [editJob, setEditJob] = useState<PublicJob | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<PublicJob | null>(null);

  useEffect(() => {
    if (isAdmin) return;
    const id = requestAnimationFrame(() => {
      setShowArchived(false);
    });
    return () => cancelAnimationFrame(id);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await getJobsList({
        status: showArchived ? "Archived" : "Active",
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
  }, [isAdmin, showArchived]);

  const displayJobs = isAdmin ? listJobs : initialFromServer;

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
        application_url: editForm.application_url.trim(),
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
    });
    if (fetchErr) {
      toast.error(fetchErr);
    } else if (fresh) {
      setListJobs(fresh as PublicJob[]);
    }
    toast.success(next === "Archived" ? "Job archived" : "Job reactivated");
  }

  if (!isAdmin && initialFromServer.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        No open roles at the moment. Check back soon.
      </p>
    );
  }

  return (
    <div className="w-full space-y-8 text-base leading-relaxed">
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
                    required
                  />
                </div>
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

      <div
        className={cn(
          "flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/30 p-4 sm:p-5",
          "shadow-sm",
        )}
      >
        <div className="space-y-2">
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
            className="h-11 w-full min-w-0 text-base"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2">
            <p className="text-sm font-medium sm:text-base">Industry</p>
            <Select value={industryFilter} onValueChange={setIndustryFilter}>
              <SelectTrigger
                className="h-11 w-full min-w-0 text-base"
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
          <div className="space-y-2">
            <p className="text-sm font-medium sm:text-base">Job type</p>
            <Select
              value={employmentFilter}
              onValueChange={setEmploymentFilter}
            >
              <SelectTrigger
                className="h-11 w-full min-w-0 text-base"
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
          <div className="space-y-2">
            <p className="text-sm font-medium sm:text-base">Position</p>
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger
                className="h-11 w-full min-w-0 text-base"
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
          <div className="space-y-2">
            <p className="text-sm font-medium sm:text-base">View</p>
            <div className="flex flex-col gap-3 min-[500px]:flex-row min-[500px]:items-end min-[500px]:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {isAdmin ? (
                  <div className="flex h-11 min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm min-[500px]:text-base">
                    <Switch
                      id="show-archived"
                      checked={showArchived}
                      onCheckedChange={setShowArchived}
                      aria-label="Show archived jobs"
                    />
                    <label
                      htmlFor="show-archived"
                      className="text-muted-foreground"
                    >
                      Show archived
                    </label>
                  </div>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-11 min-w-0 cursor-not-allowed items-center gap-2 rounded-md border border-input bg-background/80 px-3 text-sm opacity-50 min-[500px]:text-base">
                        <Switch
                          id="show-archived"
                          checked={false}
                          disabled
                          aria-label="Show archived jobs (admin mode required)"
                        />
                        <span className="text-muted-foreground">Show archived</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[16rem]">
                      Turn on Admin mode in the top bar to show archived
                      listings.
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => {
                  if (v) setViewMode(v as ViewMode);
                }}
                variant="outline"
                size="default"
                spacing={0}
                className="h-11 w-full shrink-0 min-[500px]:w-auto"
              >
                <ToggleGroupItem
                  value="grid"
                  aria-label="Grid view"
                  className="flex-1 gap-2 text-base data-[state=on]:bg-accent"
                >
                  <LayoutGrid className="size-4 shrink-0" />
                  Grid
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="table"
                  aria-label="Table view"
                  className="flex-1 gap-2 text-base data-[state=on]:bg-accent"
                >
                  <Table2 className="size-4 shrink-0" />
                  Table
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
                <TableHead className="h-8 w-[1%] min-w-[4.5rem] py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Apply
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((job) => (
                <TableRow key={job.id} className="text-sm">
                  {isAdmin && (
                    <TableCell className="p-1 align-top">
                      <RowActions
                        job={job}
                        onEdit={() => openEdit(job)}
                        onArchive={() => setArchiveTarget(job)}
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
                  <TableCell className="whitespace-nowrap py-1.5 text-right align-top">
                    <Button size="sm" className="text-sm" asChild>
                      <a
                        href={job.application_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Apply
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
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
          {filtered.map((job) => (
            <li key={job.id} className="min-w-0">
              <Card
                className={cn(
                  "relative flex h-full flex-col border-border/80 shadow-md",
                  "transition-shadow hover:shadow-lg",
                  job.status === "Archived" && "opacity-90",
                )}
              >
                {isAdmin && (
                  <div className="absolute right-2 top-2 z-10">
                    <RowActions
                      job={job}
                      onEdit={() => openEdit(job)}
                      onArchive={() => setArchiveTarget(job)}
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
                <CardFooter className="mt-auto flex flex-col gap-0 px-6 pb-6 sm:px-7">
                  <Button
                    asChild
                    className="h-11 w-full text-base font-medium"
                    size="default"
                    variant="default"
                  >
                    <a
                      href={job.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apply Now
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RowActions({
  job,
  onEdit,
  onArchive,
}: {
  job: PublicJob;
  onEdit: () => void;
  onArchive: () => void;
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
