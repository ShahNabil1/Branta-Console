// Social Links section for the current employee's profile.
// Icon dropdown + URL (WhatsApp: BD number with fixed prefix) + label dropdown → chip.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
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
  SOCIAL_PLATFORMS,
  PLATFORM_META,
  PLATFORM_DOMAINS,
  PlatformIcon,
  PlatformSelect,
  normalizeUrl,
  validateUrl,
  type SocialPlatform,
} from "@/components/social/platforms";
import {
  EMPLOYEE_EXCLUDED_PLATFORMS,
  SOCIAL_LABELS,
  WA_PREFIX,
  isBdMobile,
  waNumberFromUrl,
  waUrl,
} from "@/components/profile/social-link-rules";
import {
  listMyProfileSocialLinks,
  addMyProfileSocialLink,
  updateMyProfileSocialLink,
  deleteMyProfileSocialLink,
  type ProfileSocialLinkRow,
} from "@/lib/profile-social-links.functions";

type Draft = { platform: SocialPlatform; value: string; label: string };

/** Returns null if valid, else an error message. `value` is a URL or, for WhatsApp, an 11-digit number. */
function draftError(d: Draft): string | null {
  if (!d.value.trim()) return null;
  if (d.platform === "whatsapp")
    return isBdMobile(d.value) ? null : "Enter an 11-digit BD mobile number (013–019)";
  return validateUrl(d.platform, d.value);
}
const draftUrl = (d: Draft) =>
  d.platform === "whatsapp" ? waUrl(d.value) : normalizeUrl(d.platform, d.value);

function LinkFields({
  d,
  setD,
  compact,
}: {
  d: Draft;
  setD: (d: Draft) => void;
  compact?: boolean;
}) {
  const h = `${compact ? "h-9 text-[13px]" : "h-10 text-[13.5px]"} font-semibold border-2 border-foreground/20 shadow-sm focus-visible:border-brand focus:border-brand`;
  const err = draftError(d);
  const placeholder =
    d.platform === "website"
      ? "https://yourdomain.com"
      : `https://${PLATFORM_DOMAINS[d.platform][0]}/…`;
  return (
    <>
      <PlatformSelect
        value={d.platform}
        exclude={EMPLOYEE_EXCLUDED_PLATFORMS}
        onChange={(v) =>
          setD({ ...d, platform: v, value: v === "whatsapp" || d.platform === "whatsapp" ? "" : d.value })
        }
        className={`${h} w-[150px] shrink-0 rounded-sm`}
      />
      {d.platform === "whatsapp" ? (
        <div
          className={`flex ${h} min-w-[220px] flex-1 items-center overflow-hidden rounded-sm border bg-background ${
            err ? "border-destructive" : "border-input"
          }`}
        >
          <span className="h-full shrink-0 border-r border-border bg-muted px-2 font-mono text-[11.5px] leading-[2.6] text-muted-foreground">
            {WA_PREFIX}
          </span>
          <input
            inputMode="numeric"
            maxLength={11}
            value={d.value}
            onChange={(e) => setD({ ...d, value: e.target.value.replace(/\D/g, "").slice(0, 11) })}
            placeholder="01XXXXXXXXX"
            className="h-full min-w-0 flex-1 bg-transparent px-2 font-mono outline-none"
          />
        </div>
      ) : (
        <Input
          value={d.value}
          onChange={(e) => setD({ ...d, value: e.target.value })}
          placeholder={placeholder}
          className={`${h} min-w-[220px] flex-1 rounded-sm ${err ? "border-destructive" : ""}`}
        />
      )}
      <Select value={d.label || undefined} onValueChange={(v) => setD({ ...d, label: v })}>
        <SelectTrigger className={`${h} w-[170px] rounded-sm`}>
          <SelectValue placeholder="Label" />
        </SelectTrigger>
        <SelectContent>
          {SOCIAL_LABELS.map((l) => (
            <SelectItem key={l} value={l}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

export function ProfileSocialLinksSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyProfileSocialLinks);
  const addFn = useServerFn(addMyProfileSocialLink);
  const updateFn = useServerFn(updateMyProfileSocialLink);
  const deleteFn = useServerFn(deleteMyProfileSocialLink);

  const q = useQuery({
    queryKey: ["profile-social-links"],
    queryFn: () => listFn({}),
  });

  const empty: Draft = { platform: "linkedin", value: "", label: "" };
  const [draft, setDraft] = useState<Draft>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);

  const addM = useMutation({
    mutationFn: () =>
      addFn({
        data: { platform: draft.platform, url: draftUrl(draft), label: draft.label || null },
      }),
    onSuccess: () => {
      toast.success("Social link added");
      setDraft({ ...empty, platform: draft.platform });
      qc.invalidateQueries({ queryKey: ["profile-social-links"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });

  const updateM = useMutation({
    mutationFn: (payload: {
      id: string;
      patch: { platform?: SocialPlatform; url?: string; label?: string | null };
    }) => updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Updated");
      setEditingId(null);
      setEditDraft(null);
      qc.invalidateQueries({ queryKey: ["profile-social-links"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile-social-links"] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const addErr = draftError(draft);
  const editErr = editDraft ? draftError(editDraft) : null;

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rows.map((row: ProfileSocialLinkRow) => {
            const meta = PLATFORM_META[row.platform as SocialPlatform];
            const displayName = meta?.name ?? row.platform;
            if (editingId === row.id && editDraft) {
              return (
                <div
                  key={row.id}
                  className="flex w-full flex-wrap items-center gap-1.5 rounded-sm border border-border bg-background p-1.5"
                >
                  <LinkFields d={editDraft} setD={setEditDraft} compact />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-sm"
                    disabled={updateM.isPending || !editDraft.value.trim() || editErr !== null}
                    onClick={() =>
                      updateM.mutate({
                        id: row.id,
                        patch: {
                          platform: editDraft.platform,
                          url: draftUrl(editDraft),
                          label: editDraft.label || null,
                        },
                      })
                    }
                    aria-label="Save"
                  >
                    {updateM.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-sm"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft(null);
                    }}
                    aria-label="Cancel"
                  >
                    <X className="size-3.5" />
                  </Button>
                  {editErr && <p className="w-full text-[11.5px] text-destructive">{editErr}</p>}
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
                        <span className="font-medium">{displayName}</span>
                        {row.label?.trim() && (
                          <span className="text-muted-foreground">· {row.label}</span>
                        )}
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[320px] break-all text-[11.5px]">
                      {row.url}
                    </TooltipContent>
                  </Tooltip>
                  <button
                    type="button"
                    className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                    onClick={() => {
                      const platform = (SOCIAL_PLATFORMS as readonly string[]).includes(row.platform)
                        ? (row.platform as SocialPlatform)
                        : "website";
                      setEditingId(row.id);
                      setEditDraft({
                        platform,
                        value: platform === "whatsapp" ? waNumberFromUrl(row.url) : row.url,
                        label: (SOCIAL_LABELS as readonly string[]).includes(row.label ?? "")
                          ? (row.label as string)
                          : "",
                      });
                    }}
                    aria-label="Edit"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    onClick={() => {
                      if (confirm(`Remove this ${displayName} link?`)) deleteM.mutate(row.id);
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </TooltipProvider>
            );
          })}
        </div>
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <LinkFields d={draft} setD={setDraft} />
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-sm text-[12.5px]"
            disabled={addM.isPending || !draft.value.trim() || addErr !== null}
            onClick={() => addM.mutate()}
          >
            {addM.isPending ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-3" />
            )}
            Add
          </Button>
        </div>
        {addErr && <p className="text-[11.5px] text-destructive">{addErr}</p>}
      </div>
    </div>
  );
}
