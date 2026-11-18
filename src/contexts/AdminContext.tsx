"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getAdminStatus,
  logoutAdmin,
  verifyAdminPassword,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

type AdminContextValue = {
  isAdmin: boolean;
  openAdminDialog: () => void;
  logout: () => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  // Admin state comes from the server's httpOnly session cookie, so it can't
  // be faked from the browser (the old sessionStorage flag could be).
  useEffect(() => {
    let cancelled = false;
    getAdminStatus()
      .then((ok) => {
        if (!cancelled && ok) setIsAdmin(true);
      })
      .catch(() => {
        /* treat as logged out */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openAdminDialog = useCallback(() => {
    setAdminDialogOpen(true);
  }, []);

  const logout = useCallback(() => {
    setIsAdmin(false);
    logoutAdmin()
      .then(() => toast("Left admin mode"))
      .catch(() => toast.error("Could not end admin session"));
  }, []);

  async function onSubmitAdminPassword(e: React.FormEvent) {
    e.preventDefault();
    setAdminLoginLoading(true);
    try {
      const ok = await verifyAdminPassword(adminPassword);
      if (ok) {
        setIsAdmin(true);
        setAdminDialogOpen(false);
        setAdminPassword("");
        toast.success("Admin mode enabled");
      } else {
        toast.error("Incorrect password");
      }
    } catch {
      toast.error("Could not verify password");
    } finally {
      setAdminLoginLoading(false);
    }
  }

  const value = useMemo<AdminContextValue>(
    () => ({
      isAdmin,
      openAdminDialog,
      logout,
    }),
    [isAdmin, openAdminDialog, logout],
  );

  return (
    <AdminContext.Provider value={value}>
      {children}
      <Dialog open={adminDialogOpen} onOpenChange={setAdminDialogOpen}>
        <DialogContent>
          <form onSubmit={onSubmitAdminPassword}>
            <DialogHeader>
              <DialogTitle>Admin mode</DialogTitle>
              <DialogDescription>
                Enter the admin password. It is only checked on the server.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                name="password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="text-base"
                autoComplete="off"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdminDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adminLoginLoading}>
                {adminLoginLoading ? "Checking…" : "Unlock"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminContext.Provider>
  );
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return ctx;
}
