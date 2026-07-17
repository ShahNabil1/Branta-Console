import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  Upload,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  getMyProfile,
  updateMyProfile,
  requestKycReupload,
  type ProfileRow,
} from "@/lib/profile.functions";

import { requestR2Upload } from "@/lib/r2.functions";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "Profile · Branta Tech" }] }),
  component: ProfilePage,
});



// ---------- KYC status badge ----------
type KycStatus = "not_verified" | "under_review" | "verified" | "rejected";
const STATUS_META: Record<
  KycStatus,
  { label: string; tone: string; Icon: typeof BadgeCheck }
> = {
  not_verified: {
    label: "Not Verified",
    tone: "bg-muted text-muted-foreground border-border",
    Icon: ShieldQuestion,
  },
  under_review: {
    label: "Under Review",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: Loader2,
  },
  verified: {
    label: "Verified",
    tone: "bg-emerald-50 text-emerald-800 border-emerald-200",
    Icon: BadgeCheck,
  },
  rejected: {
    label: "Rejected",
    tone: "bg-red-50 text-red-800 border-red-200",
    Icon: ShieldAlert,
  },
};

function KycBadge({ status }: { status: string }) {
  const s = (STATUS_META[status as KycStatus] ?? STATUS_META.not_verified);
  const spin = status === "under_review";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em]",
        s.tone,
      )}
    >
      <s.Icon className={cn("size-3", spin && "animate-spin")} strokeWidth={2} />
      {s.label}
    </span>
  );
}

// ---------- Field primitives ----------
function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ---------- Page ----------
function ProfilePage() {
  const router = useRouter();
  const fetchProfile = useServerFn(getMyProfile);
  const update = useServerFn(updateMyProfile);
  
  const reupload = useServerFn(requestKycReupload);
  const presign = useServerFn(requestR2Upload);
  

  const profileQuery = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => fetchProfile(),
    staleTime: 15_000,
  });

  // Realtime: subscribe to this user's profile row so KYC fields update live
  // when an admin changes status in the database.
  const userId = profileQuery.data?.profile.user_id;
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void profileQuery.refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, profileQuery]);

  if (profileQuery.isLoading) return <ProfileSkeleton />;
  if (profileQuery.error)
    return (
      <div className="p-8 text-sm text-red-700">
        Failed to load profile: {(profileQuery.error as Error).message}
      </div>
    );

  const { profile, email } = profileQuery.data!;

  return (
    <ProfileForm
      profile={profile}
      email={email}
      onSaved={() => {
        profileQuery.refetch();
        router.invalidate();
      }}
      update={update}
      reupload={reupload}
      presign={presign}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-8">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="h-40 animate-pulse rounded-md bg-muted" />
      <div className="h-64 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

interface FormProps {
  profile: ProfileRow;
  email: string;
  onSaved: () => void;
  update: ReturnType<typeof useServerFn<typeof updateMyProfile>>;
  reupload: ReturnType<typeof useServerFn<typeof requestKycReupload>>;
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>;
}

function ProfileForm({
  profile,
  email,
  onSaved,
  update,
  reupload,
  presign,
}: FormProps) {
  const [form, setForm] = useState<ProfileRow>(profile);
  useEffect(() => setForm(profile), [profile]);
  const [saving, setSaving] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const submitReupload = async () => {
    if (form.kyc_status !== "rejected") return;
    if (!form.nid_url && !form.cv_url) {
      toast.error("Add updated NID or CV first", {
        description: "Upload replacement files in the Documents section.",
      });
      return;
    }
    setReuploading(true);
    try {
      const res = await reupload({ data: { note: null } });
      toast.success("Re-submitted for review", {
        description: `${res.submitted} document(s) queued for the KYC team.`,
      });
      onSaved();
    } catch (err) {
      toast.error("Re-upload failed", {
        description: (err as Error).message,
      });
    } finally {
      setReuploading(false);
    }
  };



  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const set = <K extends keyof ProfileRow>(k: K, v: ProfileRow[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(profile),
    [form, profile],
  );

  const save = async () => {
    setSaving(true);
    try {
      await update({
        data: {
          full_name: form.full_name,
          legal_full_name: form.legal_full_name,
          phone_primary: form.phone_primary,
          phone_alt: form.phone_alt,
          address_line1: form.address_line1,
          address_line2: form.address_line2,
          city: form.city,
          district: form.district,
          postcode: form.postcode,
          country: form.country,
          bank_name: form.bank_name,
          bank_account_name: form.bank_account_name,
          bank_account_number: form.bank_account_number,
          bank_routing: form.bank_routing,
          mfs_provider: form.mfs_provider,
          mfs_number: form.mfs_number,
          avatar_url: form.avatar_url,
          nid_url: form.nid_url,
          cv_url: form.cv_url,
        },
      });
      toast.success("Profile updated");
      onSaved();
    } catch (err) {
      toast.error("Save failed", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  void userId; // reserved for future use

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Account
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-foreground">
            Profile
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Manage your personal, financial, and identity information.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <KycBadge status={form.kyc_status} />
          <Button
            onClick={save}
            disabled={!dirty || saving}
            className="h-9 rounded-sm bg-primary text-primary-foreground hover:bg-brand-700"
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>
      </header>

      <div className="grid gap-4">
        {/* Identity */}
        <Section
          title="Identity"
          description="Legal name and official identifiers."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[120px_1fr]">
            <AvatarUploader
              url={form.avatar_url}
              onChange={(u) => set("avatar_url", u)}
              presign={presign}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Legal Full Name">
                <Input
                  className="h-9 rounded-sm"
                  value={form.legal_full_name ?? ""}
                  onChange={(e) => set("legal_full_name", e.target.value)}
                  placeholder="As it appears on your NID / passport"
                />
              </Field>
              <Field label="Display Name">
                <Input
                  className="h-9 rounded-sm"
                  value={form.full_name ?? ""}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="Shown across the console"
                />
              </Field>
              <Field label="Official Email" hint="Assigned by Branta Tech · read only">
                <Input
                  className="h-9 rounded-sm bg-muted font-mono text-[12px]"
                  value={email}
                  readOnly
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Primary Contact">
              <Input
                className="h-9 rounded-sm"
                value={form.phone_primary ?? ""}
                onChange={(e) => set("phone_primary", e.target.value)}
                placeholder="+8801XXXXXXXXX"
              />
            </Field>
            <Field label="Alternative Contact">
              <Input
                className="h-9 rounded-sm"
                value={form.phone_alt ?? ""}
                onChange={(e) => set("phone_alt", e.target.value)}
                placeholder="+8801XXXXXXXXX"
              />
            </Field>
          </div>
        </Section>

        {/* Address */}
        <Section title="Address">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Address Line 1" className="md:col-span-2">
              <Input
                className="h-9 rounded-sm"
                value={form.address_line1 ?? ""}
                onChange={(e) => set("address_line1", e.target.value)}
                placeholder="House / Road / Village"
              />
            </Field>
            <Field label="Address Line 2" className="md:col-span-2">
              <Input
                className="h-9 rounded-sm"
                value={form.address_line2 ?? ""}
                onChange={(e) => set("address_line2", e.target.value)}
              />
            </Field>
            <Field label="City / Thana">
              <Input
                className="h-9 rounded-sm"
                value={form.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="District">
              <Input
                className="h-9 rounded-sm"
                value={form.district ?? ""}
                onChange={(e) => set("district", e.target.value)}
              />
            </Field>
            <Field label="Postcode">
              <Input
                className="h-9 rounded-sm"
                value={form.postcode ?? ""}
                onChange={(e) => set("postcode", e.target.value)}
              />
            </Field>
            <Field label="Country">
              <Input
                className="h-9 rounded-sm"
                value={form.country ?? ""}
                onChange={(e) => set("country", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {/* Banking / MFS */}
        <Section
          title="Banking & Mobile Financial Services"
          description="Used for payroll and reimbursements."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Bank Name">
              <Input
                className="h-9 rounded-sm"
                value={form.bank_name ?? ""}
                onChange={(e) => set("bank_name", e.target.value)}
              />
            </Field>
            <Field label="Account Holder Name">
              <Input
                className="h-9 rounded-sm"
                value={form.bank_account_name ?? ""}
                onChange={(e) => set("bank_account_name", e.target.value)}
              />
            </Field>
            <Field label="Account Number">
              <Input
                className="h-9 rounded-sm font-mono text-[12px]"
                value={form.bank_account_number ?? ""}
                onChange={(e) => set("bank_account_number", e.target.value)}
              />
            </Field>
            <Field label="Routing Number">
              <Input
                className="h-9 rounded-sm font-mono text-[12px]"
                value={form.bank_routing ?? ""}
                onChange={(e) => set("bank_routing", e.target.value)}
              />
            </Field>
            <Field label="MFS Provider" hint="bKash / Nagad / Rocket / Upay">
              <Input
                className="h-9 rounded-sm"
                value={form.mfs_provider ?? ""}
                onChange={(e) => set("mfs_provider", e.target.value)}
              />
            </Field>
            <Field label="MFS Number">
              <Input
                className="h-9 rounded-sm font-mono text-[12px]"
                value={form.mfs_number ?? ""}
                onChange={(e) => set("mfs_number", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {/* Documents */}
        <Section
          title="Documents"
          description="Upload your NID and CV. Files are stored privately in Cloudflare R2."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DocumentSlot
              label="NID (front + back combined PDF or image)"
              url={form.nid_url}
              onChange={(u) => set("nid_url", u)}
              presign={presign}
              scope="document"
            />
            <DocumentSlot
              label="CV / Résumé"
              url={form.cv_url}
              onChange={(u) => set("cv_url", u)}
              presign={presign}
              scope="document"
            />
          </div>
        </Section>

        {/* KYC / Didit */}
        <Section
          title="Identity Verification (KYC)"
          right={<KycBadge status={form.kyc_status} />}
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_auto]">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
              <KycRow label="Document Type" value={form.kyc_document_type} />
              <KycRow label="Document Number" value={form.kyc_document_number} mono />
              <KycRow label="Document Expiry" value={form.kyc_document_expiry} mono />
              <KycRow label="Extracted Name" value={form.kyc_extracted_full_name} />
              <KycRow
                label="Extracted Address"
                value={form.kyc_extracted_address}
                className="col-span-2"
              />
              <KycRow
                label="Submitted"
                value={form.kyc_submitted_at ? new Date(form.kyc_submitted_at).toLocaleString() : null}
                mono
              />
              <KycRow
                label="Verified"
                value={form.kyc_verified_at ? new Date(form.kyc_verified_at).toLocaleString() : null}
                mono
              />
              {form.kyc_rejection_reason && (
                <KycRow
                  label="Rejection reason"
                  value={form.kyc_rejection_reason}
                  className="col-span-2 text-red-700"
                />
              )}
            </dl>
            <div className="flex flex-col items-stretch justify-start gap-2 md:min-w-[220px]">
              {form.kyc_status === "rejected" && (
                <Button
                  onClick={submitReupload}
                  disabled={reuploading || (!form.nid_url && !form.cv_url)}
                  variant="outline"
                  className="h-9 rounded-sm border-primary/40 text-[12px] font-semibold text-primary hover:bg-primary/5"
                >
                  {reuploading ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 size-3.5" />
                  )}
                  Request Re-upload
                </Button>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                KYC is reviewed manually by the Branta Tech admin team. Upload updated NID / CV in the Documents section, then request re-upload if previously rejected.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function KycRow({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-[13px] text-foreground",
          mono && "font-mono text-[12px]",
          !value && "text-muted-foreground",
        )}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

// ---------- Uploaders ----------
function useR2Upload(
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>,
  scope: "avatar" | "document",
) {
  return useMutation({
    mutationFn: async (file: File) => {
      const { url, publicUrl } = await presign({
        data: {
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          scope,
        },
      });
      const put = await fetch(url, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);
      if (!publicUrl) throw new Error("R2_PUBLIC_BASE_URL not configured");
      return publicUrl;
    },
  });
}

function AvatarUploader({
  url,
  onChange,
  presign,
}: {
  url: string | null;
  onChange: (u: string) => void;
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>;
}) {
  const upload = useR2Upload(presign, "avatar");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="size-[104px] overflow-hidden rounded-md border border-border bg-muted">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Avatar" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
            No photo
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          upload.mutate(f, {
            onSuccess: (u) => {
              onChange(u);
              toast.success("Avatar uploaded");
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-8 rounded-sm text-[12px]"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
      >
        {upload.isPending ? (
          <Loader2 className="mr-1.5 size-3 animate-spin" />
        ) : (
          <Upload className="mr-1.5 size-3" />
        )}
        {url ? "Replace" : "Upload"}
      </Button>
    </div>
  );
}

function DocumentSlot({
  label,
  url,
  onChange,
  presign,
  scope,
}: {
  label: string;
  url: string | null;
  onChange: (u: string) => void;
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>;
  scope: "avatar" | "document";
}) {
  const upload = useR2Upload(presign, scope);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-sm border border-dashed border-border bg-muted/30 p-4">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-sm text-[12px]"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? (
            <Loader2 className="mr-1.5 size-3 animate-spin" />
          ) : (
            <Upload className="mr-1.5 size-3" />
          )}
          {url ? "Replace file" : "Choose file"}
        </Button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
          >
            View <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*,application/pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          upload.mutate(f, {
            onSuccess: (u) => {
              onChange(u);
              toast.success("Document uploaded");
            },
            onError: (err) => toast.error((err as Error).message),
          });
        }}
      />
    </div>
  );
}
