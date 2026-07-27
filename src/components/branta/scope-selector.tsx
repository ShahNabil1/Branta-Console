import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listScopeUsers, type RangeKey } from "@/lib/analytics.functions";
import { getMyPermissions } from "@/lib/permissions.functions";
import { cn } from "@/lib/utils";
import { User, ChevronDown, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
  { key: "90d", label: "90d" },
  { key: "ytd", label: "YTD" },
];

export interface ScopeState {
  userId: string | null;   // null = self
  range: RangeKey;
}

export interface ScopeSelectorProps {
  value: ScopeState;
  onChange: (v: ScopeState) => void;
}

export function ScopeSelector({ value, onChange }: ScopeSelectorProps) {
  const permsFn = useServerFn(getMyPermissions);
  const scopeFn = useServerFn(listScopeUsers);
  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });
  const isSuperAdmin = Boolean(permsQ.data?.isSuperAdmin);
  const usersQ = useQuery({
    queryKey: ["scope-users"],
    queryFn: () => scopeFn(),
    enabled: isSuperAdmin,
    staleTime: 60_000,
  });

  const selected = value.userId
    ? usersQ.data?.find((u) => u.user_id === value.userId) ?? null
    : null;
  const selectedLabel = selected
    ? selected.full_name || selected.employee_code || "Employee"
    : "Me";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Acting as
        </span>
        {isSuperAdmin ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hairline flex h-8 items-center gap-2 rounded-sm border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground hover:border-brand/40">
                <User className="size-3.5 text-muted-foreground" />
                <span className="max-w-[160px] truncate">{selectedLabel}</span>
                {selected?.employee_code && (
                  <span className="rounded-sm border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                    {selected.employee_code}
                  </span>
                )}
                <ChevronDown className="size-3 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[360px] w-[260px] overflow-y-auto">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Scope</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onChange({ ...value, userId: null })}>
                <User className="size-3.5" /> Me
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Employees</DropdownMenuLabel>
              {(usersQ.data ?? []).map((u) => (
                <DropdownMenuItem
                  key={u.user_id}
                  onClick={() => onChange({ ...value, userId: u.user_id })}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">{u.full_name || "—"}</span>
                  {u.employee_code && (
                    <span className="rounded-sm border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                      {u.employee_code}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="hairline flex h-8 items-center gap-2 rounded-sm border border-border bg-muted/50 px-2.5 text-[12.5px] text-muted-foreground">
            <User className="size-3.5" /> Me
          </div>
        )}
      </div>

      <div className="inline-flex items-center rounded-sm border border-border bg-card p-0.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => onChange({ ...value, range: r.key })}
            className={cn(
              "rounded-[3px] px-2 py-1 text-[11px] font-medium",
              value.range === r.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}
