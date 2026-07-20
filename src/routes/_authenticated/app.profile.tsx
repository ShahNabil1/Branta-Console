import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  ExternalLink,
} from "lucide-react";
import {
  getMyProfile,
  updateMyProfile,
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
  const presign = useServerFn(requestR2Upload);

  

  const profileQuery = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => fetchProfile(),
    staleTime: 15_000,
  });

  // Realtime: subscribe to this user's profile row so updates land live.
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
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>;

}

function ProfileForm({
  profile,
  email,
  onSaved,
  update,
  presign,
}: FormProps) {
  const [form, setForm] = useState<ProfileRow>(profile);
  useEffect(() => setForm(profile), [profile]);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);


  const set = <K extends keyof ProfileRow>(k: K, v: ProfileRow[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(profile),
    [form, profile],
  );

  const isValidBdPhone = (v: string | null | undefined) =>
    !!v && /^01[3-9]\d{8}$/.test(v);
  const isValidGmail = (v: string | null | undefined) =>
    !!v && /^[^\s@]+@gmail\.com$/i.test(v);

  const primaryValid = isValidBdPhone(form.phone_primary);
  const altValid = !form.phone_alt || isValidBdPhone(form.phone_alt);
  const gmailValid = isValidGmail(form.personal_gmail);
  const canSave = dirty && primaryValid && altValid && gmailValid;

  const save = async () => {
    if (!primaryValid) {
      toast.error("Primary Contact is required and must be a valid BD number");
      return;
    }
    if (!gmailValid) {
      toast.error("Personal Gmail is required and must be a @gmail.com address");
      return;
    }
    if (!altValid) {
      toast.error("Alternative Contact must be a valid BD number");
      return;
    }
    setSaving(true);
    try {
      await update({
        data: {
          full_name: form.legal_full_name,
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
          personal_gmail: form.personal_gmail,
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

          <Button
            onClick={save}
            disabled={!canSave || saving}
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
              <Field label="Display Name" hint="Shown across the app">
                <Input
                  className="h-9 rounded-sm"
                  value={form.full_name ?? ""}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="How your name appears in Branta Tech"
                />
              </Field>
              <Field label="Official Email" hint="Assigned by Branta Tech · read only">
                <Input
                  className="h-9 rounded-sm bg-muted font-mono text-[12px]"
                  value={email}
                  readOnly
                />
              </Field>
              <Field
                label="Personal Gmail *"
                hint="Used for Google Meet invites. Must be a @gmail.com address."
                className="md:col-span-2"
              >
                <Input
                  className="h-9 rounded-sm font-mono text-[12px]"
                  value={form.personal_gmail ?? ""}
                  onChange={(e) => set("personal_gmail", e.target.value.trim().toLowerCase() || null)}
                  type="email"
                  aria-invalid={!gmailValid}
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Primary Contact *">
              <BdPhoneInput
                value={form.phone_primary ?? ""}
                onChange={(v) => set("phone_primary", v || null)}
                invalid={!primaryValid}
              />
            </Field>
            <Field label="Alternative Contact">
              <BdPhoneInput
                value={form.phone_alt ?? ""}
                onChange={(v) => set("phone_alt", v || null)}
                invalid={!altValid}
              />
            </Field>
          </div>
        </Section>

        {/* Address */}
        <Section title="Address" description="Bangladesh only. Select from the cascading dropdowns; postcode fills in automatically.">
          <BdAddressBlock form={form} set={set} />
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
      </div>
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

// ---------- BD Phone Input ----------
const BENGALI_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

function normalizeBdDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    if (BENGALI_DIGITS[ch]) out += BENGALI_DIGITS[ch];
    else if (/[0-9]/.test(ch)) out += ch;
  }
  return out.slice(0, 11);
}

function BdPhoneInput({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center overflow-hidden rounded-sm border bg-background",
        invalid ? "border-red-500" : "border-input",
      )}
    >
      <span className="flex h-full select-none items-center gap-1.5 border-r border-input bg-muted px-2.5 font-mono text-[12px] text-muted-foreground">
        <svg
          aria-hidden
          viewBox="0 0 20 12"
          className="h-3 w-[18px] shrink-0 overflow-hidden rounded-[1px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.15)]"
        >
          <rect width="20" height="12" fill="#006A4E" />
          <circle cx="8.5" cy="6" r="3.4" fill="#F42A41" />
        </svg>
        <span>+88</span>
      </span>
      <input
        inputMode="numeric"
        autoComplete="tel-national"
        className="h-full flex-1 bg-transparent px-2.5 font-mono text-[12px] text-foreground outline-none"
        value={value}
        onChange={(e) => onChange(normalizeBdDigits(e.target.value))}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text");
          onChange(normalizeBdDigits(text));
        }}
        maxLength={11}
      />
    </div>
  );
}
