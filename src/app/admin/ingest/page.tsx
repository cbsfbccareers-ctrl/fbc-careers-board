"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase";

type ScanResult = {
  title: string;
  company: string;
  location: string;
  application_url: string;
  vertical_tag: string;
  expires_at: string;
};

export default function AdminIngestPage() {
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setScanning(true);
    setResult(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as ScanResult & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Scan failed");
        return;
      }
      setResult({
        title: data.title,
        company: data.company,
        location: data.location,
        application_url: data.application_url,
        vertical_tag: data.vertical_tag,
        expires_at: data.expires_at,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setScanning(false);
    }
  }

  function updateField<K extends keyof ScanResult>(key: K, value: ScanResult[K]) {
    setResult((prev) => (prev ? { ...prev, [key]: value } : null));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;
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
        location: result.location.trim(),
        vertical_tag: result.vertical_tag.trim(),
        application_url: applicationUrl,
        status: "Active",
        expires_at: result.expires_at,
      });

      if (error) {
        if (error.code === "23505") {
          toast.error("This job is already in the database (duplicate application URL).");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Job saved.");
      setResult(null);
      setUrl("");
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
            Paste a job URL to scan, review the AI extraction, then save to
            the database.
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
            <form onSubmit={handleSave} className="space-y-4 border-t border-border pt-8">
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
                <label htmlFor="location" className="text-sm font-medium">
                  Location
                </label>
                <Input
                  id="location"
                  value={result.location}
                  onChange={(e) => updateField("location", e.target.value)}
                  required
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="vertical_tag" className="text-sm font-medium">
                  Vertical tag
                </label>
                <Input
                  id="vertical_tag"
                  value={result.vertical_tag}
                  onChange={(e) => updateField("vertical_tag", e.target.value)}
                  required
                  disabled={saving}
                  placeholder="TradFi, DeFi, Crypto, AI Infrastructure, or Other"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="application_url" className="text-sm font-medium">
                  URL
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
              <p className="text-xs text-muted-foreground">
                Expires (30 days from scan):{" "}
                <time dateTime={result.expires_at}>
                  {new Date(result.expires_at).toLocaleString()}
                </time>
              </p>
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
                  onClick={() => setResult(null)}
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
