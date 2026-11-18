"use client";

import { Button } from "@/components/ui/button";
import { useAdmin } from "@/contexts/AdminContext";

/**
 * UI gate for /admin/*. Real enforcement happens server-side
 * (`requireAdmin` / `isAdminRequest` in every admin action and /api/ingest);
 * this only avoids showing admin tools to logged-out visitors.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, openAdminDialog } = useAdmin();

  if (!isAdmin) {
    return (
      <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <p className="text-base text-muted-foreground sm:text-lg">
          Admin login required to view this page.
        </p>
        <Button type="button" onClick={openAdminDialog}>
          Log in as admin
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
