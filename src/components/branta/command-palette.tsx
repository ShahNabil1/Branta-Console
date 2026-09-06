import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Settings,
  LogOut,
  Building2,
  Inbox,
  FileText,
  Wallet,
  Banknote,
  Receipt,
  PiggyBank,
  Palette,
  UserPlus,
  ArrowLeftRight,
  Send,
  Shield,
  KeyRound,
  BellRing,
  User,
  Activity,
  Link2,
  FileSignature,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { globalSearch, type GlobalSearchHit } from "@/lib/global-search.functions";
import type { LucideIcon } from "lucide-react";

// --- Static index: navigation, settings sub-sections, actions ----------------

type StaticEntry = {
  label: string;
  group: string;
  icon: LucideIcon;
  to: string;
  hash?: string;
  keywords?: string;
};

const STATIC_ENTRIES: StaticEntry[] = [
  // Workspace
  { label: "Overview", group: "Workspace", icon: LayoutDashboard, to: "/app", keywords: "home dashboard" },
  // CRM
  { label: "Leads", group: "CRM", icon: Users, to: "/app/leads", keywords: "prospects btl" },
  { label: "Lead drafts", group: "CRM", icon: Users, to: "/app/leads/drafts", keywords: "unsaved" },
  { label: "Customers", group: "CRM", icon: Building2, to: "/app/customers", keywords: "clients accounts" },
  { label: "Inbox", group: "CRM", icon: Inbox, to: "/app/inbox", keywords: "email gmail" },
  // Finance
  { label: "Finance dashboard", group: "Finance", icon: PiggyBank, to: "/app/finance", keywords: "profit loss report" },
  { label: "Income", group: "Finance", icon: TrendingUp, to: "/app/finance/income", keywords: "revenue received payments report export" },
  { label: "Invoices", group: "Finance", icon: FileText, to: "/app/finance/invoices", keywords: "billing bt" },
  { label: "New invoice", group: "Finance", icon: FileSignature, to: "/app/finance/invoices/new", keywords: "create invoice" },
  { label: "Company Wallet", group: "Finance", icon: Wallet, to: "/app/finance/wallet", keywords: "balance ledger" },
  { label: "Withdrawals", group: "Finance", icon: Banknote, to: "/app/finance/withdrawals", keywords: "payout cashout" },
  { label: "Expenses", group: "Finance", icon: Receipt, to: "/app/finance/expenses", keywords: "spend costs" },
  { label: "Invoice templates", group: "Finance", icon: Palette, to: "/app/finance/templates", keywords: "pdf email template branding logo" },
  // Admin
  { label: "Employees", group: "Admin", icon: UserPlus, to: "/app/employees", keywords: "team users staff" },
  { label: "Transfers", group: "Admin", icon: ArrowLeftRight, to: "/app/transfers", keywords: "lead transfer request" },
  { label: "Mail queue", group: "Admin", icon: Send, to: "/app/mail-queue", keywords: "brevo resend log" },
  { label: "Settings", group: "Admin", icon: Settings, to: "/app/settings", keywords: "config" },
  // Profile
  { label: "My profile", group: "Profile", icon: User, to: "/app/profile", keywords: "me account" },
  { label: "Personal information", group: "Profile", icon: User, to: "/app/profile/personal", keywords: "name address kyc" },
  { label: "Finance & Payment", group: "Profile", icon: Wallet, to: "/app/profile/finance", keywords: "bank mfs bkash nagad payment method" },
  { label: "My wallet", group: "Profile", icon: Wallet, to: "/app/profile/wallet", keywords: "balance payouts" },
  { label: "My activity", group: "Profile", icon: Activity, to: "/app/profile/activity", keywords: "log history" },
  // Security sub-sections (all live on /app/profile/security)
  { label: "Security & Notification", group: "Security", icon: Shield, to: "/app/profile/security", keywords: "2fa passkey session" },
  { label: "Passkeys", group: "Security", icon: KeyRound, to: "/app/profile/security", keywords: "webauthn face touch id fingerprint" },
  { label: "Two-factor authentication (2FA)", group: "Security", icon: Shield, to: "/app/profile/security", keywords: "totp authenticator otp mfa" },
  { label: "Sessions", group: "Security", icon: Shield, to: "/app/profile/security", keywords: "devices sign out revoke" },
  { label: "Change password", group: "Security", icon: KeyRound, to: "/app/profile/security", keywords: "reset password" },
  { label: "Notifications", group: "Security", icon: BellRing, to: "/app/profile/security", keywords: "alerts telegram email" },
  { label: "Telegram", group: "Security", icon: Link2, to: "/app/profile/security", keywords: "link telegram bot" },
];

const KIND_META: Record<
  GlobalSearchHit["kind"],
  { icon: LucideIcon; group: string }
> = {
  lead: { icon: Users, group: "Leads" },
  customer: { icon: Building2, group: "Customers" },
  invoice: { icon: FileText, group: "Invoices" },
  employee: { icon: UserPlus, group: "Employees" },
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();
  const searchFn = useServerFn(globalSearch);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
    }
  }, [open]);

  // Debounce query -> live search
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const remote = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => searchFn({ data: { q: debounced, limit: 8 } }),
    enabled: open && debounced.length >= 1,
    staleTime: 30_000,
  });

  const staticMatches = useMemo(() => {
    const n = query.trim().toLowerCase();
    if (!n) return STATIC_ENTRIES;
    return STATIC_ENTRIES.filter((e) => {
      const hay = `${e.label} ${e.group} ${e.keywords ?? ""}`.toLowerCase();
      return hay.includes(n);
    });
  }, [query]);

  const grouped = useMemo(() => {
    const g = new Map<string, StaticEntry[]>();
    for (const e of staticMatches) {
      if (!g.has(e.group)) g.set(e.group, []);
      g.get(e.group)!.push(e);
    }
    return Array.from(g.entries());
  }, [staticMatches]);

  const groupedRemote = useMemo(() => {
    const g = new Map<GlobalSearchHit["kind"], GlobalSearchHit[]>();
    for (const h of remote.data ?? []) {
      if (!g.has(h.kind)) g.set(h.kind, []);
      g.get(h.kind)!.push(h);
    }
    return Array.from(g.entries());
  }, [remote.data]);

  const go = (to: string) => {
    setOpen(false);
    // Cast to any route string; palette links stay untyped by design.
    navigate({ to: to as unknown as "/app" });
  };

  const goHit = (h: GlobalSearchHit) => {
    setOpen(false);
    navigate({
      to: h.to as unknown as "/app",
      params: h.params as never,
    });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search leads (BTL-01), invoices (BT-03), customers, employees, settings…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {remote.isFetching ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Searching…
            </span>
          ) : (
            "No results."
          )}
        </CommandEmpty>

        {groupedRemote.length > 0 && (
          <>
            {groupedRemote.map(([kind, hits]) => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              return (
                <CommandGroup key={kind} heading={meta.group}>
                  {hits.map((h) => (
                    <CommandItem
                      key={kind + h.id}
                      value={`${kind}-${h.code ?? ""}-${h.title}-${h.id}`}
                      onSelect={() => goHit(h)}
                    >
                      <Icon className="size-4" />
                      <span className="flex-1 truncate">{h.title}</span>
                      {h.code && (
                        <span className="ml-2 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {h.code}
                        </span>
                      )}
                      {h.subtitle && (
                        <span className="ml-2 max-w-[40%] truncate text-[11px] text-muted-foreground">
                          {h.subtitle}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            <CommandSeparator />
          </>
        )}

        {grouped.map(([label, items], idx) => (
          <CommandGroup key={label} heading={label}>
            {items.map((e) => {
              const Icon = e.icon;
              return (
                <CommandItem
                  key={e.label + e.to}
                  value={`${e.group}-${e.label}-${e.keywords ?? ""}`}
                  onSelect={() => go(e.to)}
                >
                  <Icon className="size-4" />
                  <span>{e.label}</span>
                </CommandItem>
              );
            })}
            {idx < grouped.length - 1 && <CommandSeparator />}
          </CommandGroup>
        ))}

        <CommandSeparator />
        <CommandGroup heading="Session">
          <CommandItem
            onSelect={async () => {
              setOpen(false);
              await supabase.auth.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="size-4" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
