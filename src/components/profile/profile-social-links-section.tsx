// Social Links section for the current employee's profile.
// Mirrors the lead Social Links UX: icon dropdown + URL + label → clickable chip.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  listMyProfileSocialLinks,
  addMyProfileSocialLink,
  updateMyProfileSocialLink,
  deleteMyProfileSocialLink,
  type ProfileSocialLinkRow,
} from "@/lib/profile-social-links.functions";

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

  const [draftPlatform, setDraftPlatform] = useState<SocialPlatform>("linkedin");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    platform: SocialPlatform;
    url: string;
    label: string;
  } | null>(null);

  const addM = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          platform: draftPlatform,
          url: normalizeUrl(draftPlatform, draftUrl),
          label: draftLabel || null,
        },
      }),
    onSuccess: () => {
      toast.success("Social link added");
      setDraftUrl("");
      setDraftLabel("");
      qc.invalidateQueries({ queryKey: ["profile-social-links"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to add"),
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
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile-social-links"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const draftError = draftUrl.trim() ? validateUrl(draftPlatform, draftUrl) : null;
  const placeholder =
    draftPlatform === "website"
      ? "https://yourdomain.com"
      : `https://${PLATFORM_DOMAINS[draftPlatform][0]}/…`;

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rows.map((row: ProfileSocialLinkRow) => {
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
                    onChange={(v) => setEditDraft({ ...editDraft, platform: v })}
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
                    placeholder="Label (optional)"
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
                    <TooltipContent
                      side="top"
                      className="max-w-[320px] break-all text-[11.5px]"
                    >
                      {displayName}
                      {row.label ? ` · ${row.label}` : ""}
                      <br />
                      <span className="text-muted-foreground">{row.url}</span>
                    </TooltipContent>
                  </Tooltip>
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
                      if (confirm(`Remove this ${displayName} link?`))
                        deleteM.mutate(row.id);
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
            placeholder="Label (optional)"
            className="h-9 w-[180px] rounded-sm text-[12.5px]"
          />
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-sm text-[12.5px]"
            disabled={addM.isPending || !draftUrl.trim() || draftError !== null}
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
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Plus className="mr-1.5 size-3" />
            )}
            Add
          </Button>
        </div>
        {draftError && (
          <p className="text-[11.5px] text-red-600">{draftError}</p>
        )}
      </div>
    </div>
  );
}
