import Image from "next/image";
import Link from "next/link";

export function GlobalNav() {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/90"
    >
      <div className="mx-auto flex h-14 w-full max-w-[100rem] items-center justify-between gap-4 px-4 sm:h-[3.5rem] sm:px-6 lg:px-10">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 sm:gap-3"
        >
          <Image
            src="/logo.png"
            alt="Columbia FBC"
            width={160}
            height={32}
            className="h-8 w-auto shrink-0"
            priority
          />
          <span className="truncate text-base font-semibold tracking-tight text-foreground sm:text-lg">
            Columbia FBC
          </span>
        </Link>
        <nav
          className="flex shrink-0 items-center gap-2 text-sm font-medium sm:gap-6 sm:text-base"
          aria-label="Main"
        >
          <Link
            href="/"
            className="text-foreground/90 transition-colors hover:text-foreground"
          >
            Job Board
          </Link>
          <Link
            href="/admin/ingest"
            className="text-foreground/90 transition-colors hover:text-foreground"
          >
            Add a Job
          </Link>
          <Link
            href="/admin"
            className="text-foreground/90 transition-colors hover:text-foreground"
          >
            Admin Portal
          </Link>
        </nav>
      </div>
    </header>
  );
}
