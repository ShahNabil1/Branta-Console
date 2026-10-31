// Global banner shown at the top of the app whenever an admin has
// swapped into another employee's session. One click restores the
// admin session and jumps back to that employee's detail page.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  clearBackup,
  isImpersonating,
  readBackup,
} from "@/lib/impersonation";
import { logImpersonationEnd } from "@/lib/employee-detail.functions";

export function ImpersonationBanner() {
  const [active, setActive] = useState(false);
  const [targetEmail, setTargetEmail] = useState<string>("");
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [exiting, setExiting] = useState(false);
  const navigate = useNavigate();
  const logEnd = useServerFn(logImpersonationEnd);

  useEffect(() => {
    const sync = () => {
      const on = isImpersonating();
      setActive(on);
      const b = readBackup();
      setTargetEmail(b?.target_email ?? "");
      setAdminEmail(b?.admin_email ?? "");
    };
    sync();
    const onStorage = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("branta:impersonation-changed", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("branta:impersonation-changed", onStorage);
    };
  }, []);

  if (!active) return null;

  const onExit = async () => {
    if (exiting) return;
    setExiting(true);
    const backup = readBackup();
    try {
      if (backup) {
        // Restore the admin session first, so the audit log call runs as admin.
        const { error } = await supabase.auth.setSession({
          access_token: backup.access_token,
          refresh_token: backup.refresh_token,
        });
        if (error) throw error;
        clearBackup();
        window.dispatchEvent(new Event("branta:impersonation-changed"));

        // Fire-and-forget audit; don't block navigation on it.
        logEnd({
          data: {
            targetUserId: backup.target_user_id,
            targetEmail: backup.target_email,
          },
        }).catch((e) => console.warn("[impersonation] log end failed", e));

        // Jump back to the employee card the admin was on.
        navigate({
          to: "/app/employees/$userId",
          params: { userId: backup.target_user_id },
          reloadDocument: true,
        });
      } else {
        clearBackup();
        window.location.assign("/app/employees");
      }
    } catch (err) {
      console.error("[impersonation] exit failed", err);
      // Session restore failed (likely expired) — send admin back to login.
      clearBackup();
      await supabase.auth.signOut().catch(() => {});
      window.location.assign("/login");
    }
  };

  return (
    <div className="sticky top-0 z-40 flex min-w-0 items-center justify-between gap-2 border-b border-amber-400 bg-amber-100 px-3 py-1.5 text-[12px] text-amber-900 shadow-sm sm:gap-3 sm:px-4 sm:text-[12.5px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2} />
        <span className="min-w-0 truncate">
          <span className="hidden sm:inline">Impersonating </span>
          <strong className="font-mono">{targetEmail}</strong>
          {adminEmail && (
            <span className="hidden md:inline">
              {" "}
              — signed in as <span className="font-mono">{adminEmail}</span>
            </span>
          )}
        </span>
      </div>
      <button
        onClick={onExit}
        disabled={exiting}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border border-amber-500 bg-white px-2.5 text-[12px] font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60"
      >
        {exiting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LogOut className="size-3.5" strokeWidth={2} />
        )}
        <span className="sm:hidden">Exit</span>
        <span className="hidden sm:inline">Exit impersonation</span>
      </button>
    </div>
  );
}
