"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EMPLOYMENT_TYPES, VERTICAL_TAGS } from "@/lib/jobs-constants";
import { cn } from "@/lib/utils";

export type PublicJob = {
  id: string;
  created_at: string;
  title: string;
  company: string;
  locations: string[] | null;
  compensation: string | null;
  vertical_tag: string;
  employment_type: string | null;
  application_url: string;
};

type JobBoardProps = {
  jobs: PublicJob[];
};

const FILTER_ALL = "all" as const;

type ViewMode = "grid" | "table";

function formatLocations(locations: string[] | null): string {
  if (!locations || locations.length === 0) return "—";
  return locations.map((l) => l.trim()).filter(Boolean).join(" | ");
}

function matchesSearch(
  job: PublicJob,
  q: string,
): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const inTitle = job.title.toLowerCase().includes(s);
  const inCompany = job.company.toLowerCase().includes(s);
  const inLocs = (job.locations ?? [])
    .join(" ")
    .toLowerCase()
    .includes(s);
  return inTitle || inCompany || inLocs;
}

export function JobBoard({ jobs }: JobBoardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [industryFilter, setIndustryFilter] = useState<string>(FILTER_ALL);
  const [employmentFilter, setEmploymentFilter] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    return jobs.filter((job) => {
      if (industryFilter !== FILTER_ALL && job.vertical_tag !== industryFilter) {
        return false;
      }
      if (employmentFilter !== FILTER_ALL) {
        const t = job.employment_type?.trim() ?? "";
        if (t !== employmentFilter) return false;
      }
      if (!matchesSearch(job, searchQuery)) return false;
      return true;
    });
  }, [jobs, industryFilter, employmentFilter, searchQuery]);

  if (jobs.length === 0) {
    return (
      <p className="text-base text-muted-foreground">
        No open roles at the moment. Check back soon.
      </p>
    );
  }

  return (
    <div className="w-full space-y-8 text-base leading-relaxed">
      <div
        className={cn(
          "flex flex-col gap-4 rounded-xl border border-border/70 bg-muted/30 p-4 sm:p-5",
          "shadow-sm",
        )}
      >
        <div className="space-y-2">
          <label htmlFor="job-search" className="text-sm font-medium sm:text-base">
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_minmax(0,auto)] lg:items-end">
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
            <Select value={employmentFilter} onValueChange={setEmploymentFilter}>
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
            <p className="text-sm font-medium sm:text-base">View</p>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => {
                if (v) setViewMode(v as ViewMode);
              }}
              variant="outline"
              size="default"
              spacing={0}
              className="h-11 w-full justify-stretch min-[480px]:w-auto"
            >
              <ToggleGroupItem
                value="grid"
                aria-label="Grid view"
                className="flex-1 gap-2 text-base data-[state=on]:bg-accent sm:flex-none"
              >
                <LayoutGrid className="size-4 shrink-0" />
                Grid
              </ToggleGroupItem>
              <ToggleGroupItem
                value="table"
                aria-label="Table view"
                className="flex-1 gap-2 text-base data-[state=on]:bg-accent sm:flex-none"
              >
                <Table2 className="size-4 shrink-0" />
                Table
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-base text-muted-foreground">
          No jobs match your filters. Try &quot;All verticals,&quot; &quot;All
          job types,&quot; or clear the search.
        </p>
      ) : viewMode === "table" ? (
        <div className="w-full min-w-0 overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 w-[20%] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Role
                </TableHead>
                <TableHead className="h-8 w-[16%] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Company
                </TableHead>
                <TableHead className="h-8 w-[20%] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Location
                </TableHead>
                <TableHead className="h-8 w-[16%] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Type
                </TableHead>
                <TableHead className="h-8 w-[12%] py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Industry
                </TableHead>
                <TableHead className="h-8 w-[16%] py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Apply
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((job) => (
                <TableRow key={job.id} className="text-sm">
                  <TableCell className="whitespace-normal py-1.5 align-top font-medium text-foreground">
                    {job.title}
                  </TableCell>
                  <TableCell className="whitespace-normal py-1.5 align-top">
                    {job.company}
                  </TableCell>
                  <TableCell className="whitespace-normal py-1.5 align-top text-muted-foreground [text-wrap:pretty] max-w-xs">
                    {formatLocations(job.locations)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-1.5 align-top text-muted-foreground">
                    {job.employment_type?.trim() || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-1.5 align-top">
                    <Badge variant="secondary" className="text-xs">
                      {job.vertical_tag}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-right align-top">
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
      ) : (
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
                  "h-full border-border/80 shadow-md transition-shadow",
                  "hover:shadow-lg",
                )}
              >
                <CardHeader className="gap-3 px-6 pt-7 pb-2 sm:px-8 sm:pt-8">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-balance pr-1 text-xl font-semibold leading-snug sm:text-2xl">
                      {job.title}
                    </CardTitle>
                    <Badge variant="secondary" className="shrink-0 text-sm">
                      {job.vertical_tag}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2 text-base font-medium text-foreground/90 sm:text-lg">
                    {job.company}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 px-6 text-base text-muted-foreground sm:px-8">
                  <p className="line-clamp-4 leading-normal">
                    {formatLocations(job.locations)}
                  </p>
                  {job.employment_type != null &&
                  String(job.employment_type).trim() !== "" ? (
                    <p>
                      <span className="font-medium text-foreground/80">
                        Type:{" "}
                      </span>
                      {String(job.employment_type).trim()}
                    </p>
                  ) : null}
                  {job.compensation != null &&
                  String(job.compensation).trim() !== "" ? (
                    <p>
                      <span className="font-medium text-foreground/80">
                        Compensation:{" "}
                      </span>
                      {String(job.compensation).trim()}
                    </p>
                  ) : null}
                </CardContent>
                <CardFooter className="px-6 pb-7 sm:px-8">
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
      )}
    </div>
  );
}
