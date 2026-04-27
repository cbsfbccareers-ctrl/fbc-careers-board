"use client";

import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAdmin } from "@/contexts/AdminContext";
import { cn } from "@/lib/utils";

function AdminModeControls() {
  const { isAdmin, openAdminDialog, logout } = useAdmin();

  if (isAdmin) {
    return (
      <div
        className={cn(
          "flex max-w-full shrink-0 items-center gap-0.5 rounded-full border pl-2.5",
          "border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
        )}
        role="status"
        aria-label="Admin mode is active"
      >
        <span className="hidden text-xs font-medium sm:inline sm:text-sm">
          Admin: Active
        </span>
        <span className="inline text-xs font-medium sm:hidden" aria-hidden>
          Admin
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={logout}
          aria-label="Log out of admin mode"
          className="h-8 shrink-0 gap-1 rounded-full px-2 text-xs text-emerald-900 hover:bg-emerald-500/20 dark:text-emerald-100 dark:hover:bg-emerald-500/20"
        >
          <LogOut className="size-3.5 sm:hidden" aria-hidden />
          <span className="hidden sm:inline">Log out</span>
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={openAdminDialog}
      className="h-8 shrink-0 text-xs sm:h-9 sm:text-sm"
    >
      Admin mode
    </Button>
  );
}

export function GlobalNav() {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/90"
    >
      <div className="mx-auto flex h-14 w-full max-w-[100rem] items-center justify-between gap-3 px-4 sm:h-[3.5rem] sm:gap-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 min-h-0 flex-1 items-center gap-3 overflow-x-auto py-0.5 sm:gap-8">
          <Link
            href="/"
            className="group flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3"
          >
            <Image
              src="/logo.png"
              alt="Columbia FBC"
              width={160}
              height={32}
              className="h-8 w-auto shrink-0"
              priority
            />
            <span className="max-w-[9rem] truncate text-sm font-semibold tracking-tight text-foreground sm:max-w-none sm:text-base sm:text-lg">
              Columbia FBC
            </span>
          </Link>
          <nav
            className="flex min-w-0 shrink-0 items-center gap-3 text-sm font-medium sm:gap-6 sm:text-base"
            aria-label="Main"
          >
            <Link
              href="/"
              className="shrink-0 text-foreground/90 transition-colors hover:text-foreground"
            >
              Job Board
            </Link>
            <Link
              href="/admin/ingest"
              className="shrink-0 text-foreground/90 transition-colors hover:text-foreground"
            >
              Add a Job
            </Link>
            <Link
              href="/admin"
              className="shrink-0 text-foreground/90 transition-colors hover:text-foreground"
            >
              Admin Portal
            </Link>
          </nav>
        </div>
        <div className="shrink-0 pl-1">
          <AdminModeControls />
        </div>
      </div>
    </header>
  );
}
