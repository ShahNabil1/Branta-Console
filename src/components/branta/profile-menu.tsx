import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="grid size-8 place-items-center overflow-hidden rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
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
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-md border border-border bg-card p-0 shadow-[var(--shadow-panel)]"
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar className="size-11 border border-border">
            {profile?.avatarUrl && (
              <AvatarImage src={profile.avatarUrl} alt="" />
            )}
            <AvatarFallback className="bg-muted text-[13px] font-semibold text-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-foreground">
              {display}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {profile?.email ?? "—"}
            </div>
          </div>
        </div>
        <div className="hairline-t px-2 py-2">
          <Link
            to="/app/profile"
            className="flex h-9 items-center gap-2 rounded-sm px-2 text-[13px] text-foreground transition-colors hover:bg-muted"
          >
            <User className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
            View profile
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
