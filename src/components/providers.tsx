"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminProvider } from "@/contexts/AdminContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <AdminProvider>{children}</AdminProvider>
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  );
}
