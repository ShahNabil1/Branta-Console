import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { User, Wallet, ShieldCheck, LogOut, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useConfirm } from "@/components/ui/confirm-dialog";

type ProfileData = {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

function initialsOf(name: string | null, email: string | null) {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase();
}

export function ProfileMenu() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      const { data: row } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile({
        email: user.email ?? null,
        fullName: row?.full_name ?? null,
        avatarUrl: row?.avatar_url ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const display = profile?.fullName ?? profile?.email?.split("@")[0] ?? "Operator";
  const initials = initialsOf(profile?.fullName ?? null, profile?.email ?? null);

  const handleSignOut = async () => {
    setOpen(false);
    const ok = await confirm({
      title: "Sign out?",
      description: "You'll need to sign in again to access your workspace.",
      tone: "danger",
      confirmLabel: "Sign out",
    });
    if (!ok) return;
    const { signOutWithLog } = await import("@/lib/sign-out");
    await signOutWithLog("manual_logout");
    navigate({ to: "/login" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="grid size-9 place-items-center overflow-hidden rounded-full border-2 border-card bg-card text-muted-foreground shadow-sm ring-2 ring-brand/30 transition-all hover:-translate-y-px hover:ring-brand hover:shadow-md hover:shadow-brand/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-label="Open profile menu"
        >
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="text-[11px] font-semibold tracking-wide text-foreground">
              {initials}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-72 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-2xl shadow-foreground/10">
        <div className="relative overflow-hidden px-4 py-4">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand via-amber-400 to-rose-500" />
          <div className="pointer-events-none absolute -right-10 -top-12 size-32 rounded-full bg-brand/15 blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="relative">
              <Avatar className="size-12 ring-2 ring-brand/30 ring-offset-2 ring-offset-card">
                {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
                <AvatarFallback className="bg-brand/10 text-[13px] font-semibold text-brand">{initials}</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 size-3 rounded-full bg-emerald-500 ring-2 ring-card" title="Active now" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-foreground">{display}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">{profile?.email ?? "—"}</div>
              <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                <span className="size-1.5 rounded-full bg-emerald-500" /> Active now
              </div>
            </div>
          </div>
        </div>
        <div className="hairline-t space-y-0.5 p-1.5">
          {([
            { to: "/app/profile", label: "View profile", hint: "Personal details", Icon: User, cls: "bg-indigo-500/10 text-indigo-600" },
            { to: "/app/profile/finance", label: "My Wallet", hint: "Balance & withdrawals", Icon: Wallet, cls: "bg-emerald-500/10 text-emerald-600" },
            { to: "/app/profile/security", label: "Security", hint: "Password & 2FA", Icon: ShieldCheck, cls: "bg-amber-500/10 text-amber-600" },
          ] as const).map(({ to, label, hint, Icon, cls }) => (
            <Link key={to} to={to} onClick={() => setOpen(false)}
              className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-all hover:translate-x-0.5 hover:bg-muted/70">
              <span className={`grid size-8 place-items-center rounded-lg transition-transform group-hover:scale-110 ${cls}`}><Icon className="size-4" strokeWidth={2} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">{label}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </span>
              <ChevronRight className="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100" />
            </Link>
          ))}
        </div>
        <div className="hairline-t p-2">
          <button type="button" onClick={handleSignOut}
            className="group flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2 text-[13px] font-medium text-rose-600 transition-all hover:border-rose-600 hover:bg-rose-600 hover:text-white hover:shadow-md hover:shadow-rose-600/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2">
            <LogOut className="size-3.5 transition-transform group-hover:-translate-x-0.5" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
