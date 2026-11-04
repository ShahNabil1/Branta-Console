import { confirmAction } from "@/components/ui/confirm-dialog";
import { DiscardCancelButton } from "@/components/company/danger-confirm";
// Social Links section for a lead — icon dropdown + URL + label.
// After adding, the URL collapses into a clickable icon chip with its label.
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addLeadSocialLink,
  deleteLeadSocialLink,
  listLeadSocialLinks,
  updateLeadSocialLink,
  SOCIAL_PLATFORMS,
  type LeadSocialLinkRow,
  type SocialPlatform,
} from "@/lib/lead-social-links.functions";

const PLATFORM_META: Record<
  SocialPlatform,
  { name: string; color: string; svg: React.ReactNode }
> = {
  website: {
    name: "Website",
    color: "#334155",
    svg: <Globe className="size-3.5" />,
  },
  linkedin: {
    name: "LinkedIn",
    color: "#0A66C2",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z" />
      </svg>
    ),
  },
  facebook: {
    name: "Facebook",
    color: "#1877F2",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.28-.04-1.25-.12-2.38-.12-2.36 0-3.98 1.44-3.98 4.08V9.9H7.6V13h2.74v8h3.16z" />
      </svg>
    ),
  },
  instagram: {
    name: "Instagram",
    color: "#E4405F",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.17.42.37 1.06.42 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.42 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.17-1.06.37-2.23.42-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.42-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.17-.42-.37-1.06-.42-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.42-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.17 1.06-.37 2.23-.42C8.42 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.5.01-4.74.07-1 .05-1.55.22-1.91.36-.48.19-.83.41-1.19.77-.36.36-.58.71-.77 1.19-.14.36-.31.91-.36 1.91-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.05 1 .22 1.55.36 1.91.19.48.41.83.77 1.19.36.36.71.58 1.19.77.36.14.91.31 1.91.36 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1-.05 1.55-.22 1.91-.36.48-.19.83-.41 1.19-.77.36-.36.58-.71.77-1.19.14-.36.31-.91.36-1.91.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1-.22-1.55-.36-1.91a3.2 3.2 0 0 0-.77-1.19 3.2 3.2 0 0 0-1.19-.77c-.36-.14-.91-.31-1.91-.36C15.5 4.01 15.15 4 12 4zm0 3.05a4.95 4.95 0 1 1 0 9.9 4.95 4.95 0 0 1 0-9.9zm0 8.16a3.21 3.21 0 1 0 0-6.42 3.21 3.21 0 0 0 0 6.42zm5.15-8.36a1.16 1.16 0 1 1 0-2.32 1.16 1.16 0 0 1 0 2.32z" />
      </svg>
    ),
  },
  youtube: {
    name: "YouTube",
    color: "#FF0000",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M23.5 7.1a3 3 0 0 0-2.1-2.12C19.55 4.5 12 4.5 12 4.5s-7.55 0-9.4.48A3 3 0 0 0 .5 7.1C0 8.95 0 12 0 12s0 3.05.5 4.9a3 3 0 0 0 2.1 2.12C4.45 19.5 12 19.5 12 19.5s7.55 0 9.4-.48a3 3 0 0 0 2.1-2.12C24 15.05 24 12 24 12s0-3.05-.5-4.9zM9.75 15.5v-7l6.25 3.5-6.25 3.5z" />
      </svg>
    ),
  },
  x: {
    name: "X (Twitter)",
    color: "#000000",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  tiktok: {
    name: "TikTok",
    color: "#000000",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M19.6 6.32a5.6 5.6 0 0 1-3.32-1.08 5.6 5.6 0 0 1-2.16-3.24h-3.36v13.44a2.64 2.64 0 1 1-2.64-2.64c.24 0 .48.03.72.09v-3.42a6 6 0 1 0 5.28 5.97V9.53a8.94 8.94 0 0 0 5.48 1.86V8.03c0-.63-.13-1.19-.36-1.71z" />
      </svg>
    ),
  },
};

const PLATFORM_DOMAINS: Record<SocialPlatform, string[]> = {
  website: [],
  linkedin: ["linkedin.com", "lnkd.in"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  instagram: ["instagram.com", "instagr.am"],
  youtube: ["youtube.com", "youtu.be"],
  x: ["x.com", "twitter.com"],
  tiktok: ["tiktok.com"],
};

function normalizeUrl(platform: SocialPlatform, url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Returns null when valid, else a user-facing error string. */
function validateUrl(platform: SocialPlatform, url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "URL is required";
  const normalized = normalizeUrl(platform, trimmed);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return "Enter a valid URL";
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return "URL must start with http:// or https://";
  }
  if (platform === "website") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = PLATFORM_DOMAINS[platform];
  const ok = allowed.some((d) => host === d || host.endsWith(`.${d}`));
  if (!ok) {
    return `${PLATFORM_META[platform].name} link must be on ${allowed.join(" or ")}`;
  }
  return null;
}


function PlatformIcon({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform as SocialPlatform];
  if (!meta) return <Globe className="size-3.5" />;
  return <span style={{ color: meta.color }}>{meta.svg}</span>;
}

function PlatformSelect({
  value,
  onChange,
  className,
}: {
  value: SocialPlatform;
  onChange: (v: SocialPlatform) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SocialPlatform)}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SOCIAL_PLATFORMS.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="inline-flex items-center gap-2">
              <PlatformIcon platform={p} />
              {PLATFORM_META[p].name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SocialLinksSection({
  leadId,
  locked = false,
}: {
  leadId: string;
  locked?: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadSocialLinks);
  const addFn = useServerFn(addLeadSocialLink);
  const updateFn = useServerFn(updateLeadSocialLink);
  const deleteFn = useServerFn(deleteLeadSocialLink);

  const q = useQuery({
    queryKey: ["lead-social-links", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  const [draftPlatform, setDraftPlatform] = useState<SocialPlatform>("linkedin");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    platform: SocialPlatform;
    url: string;
    label: string;
  } | null>(null);
  const [editBase, setEditBase] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setEditBase(editDraft ? JSON.stringify(editDraft) : null); }, [editingId]);

  const addM = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          leadId,
          platform: draftPlatform,
          url: normalizeUrl(draftPlatform, draftUrl),
          label: draftLabel || null,
        },
      }),
    onSuccess: () => {
      toast.success("Social link added");
      setDraftUrl("");
      setDraftLabel("");
      qc.invalidateQueries({ queryKey: ["lead-social-links", leadId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to add"),
  });

  const updateM = useMutation({
    mutationFn: (payload: { id: string; patch: { platform?: SocialPlatform; url?: string; label?: string | null } }) =>
      updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Updated");
      setEditingId(null);
      setEditDraft(null);
      qc.invalidateQueries({ queryKey: ["lead-social-links", leadId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-social-links", leadId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  if (locked && rows.length === 0) return null;

  return (
    <section className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Social Links
          </span>
          {rows.length > 0 && (
            <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {rows.length}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {/* Existing chips */}
        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {rows.map((row: LeadSocialLinkRow) => {
              const meta = PLATFORM_META[row.platform as SocialPlatform];
              const displayName = meta?.name ?? row.platform;
              const isEditing = editingId === row.id;
              if (isEditing && editDraft) {
                return (
                  <div
                    key={row.id}
                    className="flex w-full items-center gap-1.5 rounded-sm border border-border bg-background p-1.5 md:w-auto"
                  >
                    <PlatformSelect
                      value={editDraft.platform}
                      onChange={(v) =>
                        setEditDraft({ ...editDraft, platform: v })
                      }
                      className="h-8 w-[140px] shrink-0 rounded-sm text-[12px]"
                    />
                    <Input
                      value={editDraft.url}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, url: e.target.value })
                      }
                      placeholder="https://…"
                      className="h-8 w-[220px] rounded-sm text-[12px]"
                    />
                    <Input
                      value={editDraft.label}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, label: e.target.value })
                      }
                      placeholder="Label (e.g. Company)"
                      className="h-8 w-[160px] rounded-sm text-[12px]"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-sm"
                      disabled={
                        updateM.isPending ||
                        validateUrl(editDraft.platform, editDraft.url) !== null
                      }
                      onClick={() => {
                        const err = validateUrl(editDraft.platform, editDraft.url);
                        if (err) {
                          toast.error(err);
                          return;
                        }
                        updateM.mutate({
                          id: row.id,
                          patch: {
                            platform: editDraft.platform,
                            url: normalizeUrl(editDraft.platform, editDraft.url),
                            label: editDraft.label || null,
                          },
                        });
                      }}
                      aria-label="Save"
                    >
                      {updateM.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                    </Button>

                    <DiscardCancelButton dirty={JSON.stringify(editDraft) !== editBase} label="" className="h-8 w-8 rounded-sm p-0"
                      onCancel={() => { setEditingId(null); setEditDraft(null); }} />
                  </div>
                );
              }
              return (
                <TooltipProvider key={row.id} delayDuration={150}>
                  <div className="group inline-flex items-center gap-1 rounded-sm border border-border bg-background pl-1 pr-0.5 transition-colors hover:border-foreground/30">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-1.5 py-1 text-[12px] text-foreground"
                        >
                          <PlatformIcon platform={row.platform} />
                          <span className="font-medium">
                            {row.label?.trim() || displayName}
                          </span>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[320px] break-all text-[11.5px]">
                        {displayName}
                        {row.label ? ` · ${row.label}` : ""}
                        <br />
                        <span className="text-muted-foreground">{row.url}</span>
                      </TooltipContent>
                    </Tooltip>
                    {!locked && (
                      <>
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                          onClick={() => {
                            setEditingId(row.id);
                            setEditDraft({
                              platform: (SOCIAL_PLATFORMS as readonly string[]).includes(
                                row.platform,
                              )
                                ? (row.platform as SocialPlatform)
                                : "website",
                              url: row.url,
                              label: row.label ?? "",
                            });
                          }}
                          aria-label="Edit"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                          onClick={() => {
                            void confirmAction({ tone: "danger", icon: Trash2, title: `Remove this ${displayName} link?`, subject: "It disappears from this lead.", confirmLabel: "Remove" }).then((ok) => ok && deleteM.mutate(row.id));
                          }}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
                </TooltipProvider>
              );
            })}
          </div>
        )}

        {/* Add new row */}
        {!locked && (() => {
          const draftError = draftUrl.trim()
            ? validateUrl(draftPlatform, draftUrl)
            : null;
          const placeholder =
            draftPlatform === "website"
              ? "http://yourdomain.com"
              : `https://${PLATFORM_DOMAINS[draftPlatform][0]}/…`;
          return (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <PlatformSelect
                  value={draftPlatform}
                  onChange={(v) => setDraftPlatform(v)}
                  className="h-9 w-[160px] shrink-0 rounded-sm text-[12.5px]"
                />
                <Input
                  value={draftUrl}
                  onChange={(e) => setDraftUrl(e.target.value)}
                  placeholder={placeholder}
                  className={`h-9 min-w-[220px] flex-1 rounded-sm text-[12.5px] ${
                    draftError ? "border-red-500 focus-visible:ring-red-500" : ""
                  }`}
                />
                <Input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  placeholder="Label — e.g. Company, Personal"
                  className="h-9 w-[200px] rounded-sm text-[12.5px]"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9 rounded-sm text-[12px]"
                  disabled={
                    addM.isPending ||
                    !draftUrl.trim() ||
                    draftError !== null
                  }
                  onClick={() => {
                    const err = validateUrl(draftPlatform, draftUrl);
                    if (err) {
                      toast.error(err);
                      return;
                    }
                    addM.mutate();
                  }}
                >
                  {addM.isPending ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 size-3.5" />
                  )}
                  Add
                </Button>
              </div>
              {draftError && (
                <p className="text-[11px] text-red-600">{draftError}</p>
              )}
            </div>
          );
        })()}


        {!locked && rows.length === 0 && !q.isLoading && (
          <p className="text-[11.5px] text-muted-foreground">
            No social links yet — add LinkedIn, Facebook, Instagram, YouTube, X,
            TikTok, or a website. You can add the same platform multiple times
            with different labels (e.g. Company Facebook, Personal Facebook).
          </p>
        )}
      </div>
    </section>
  );
}
