import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  ExternalLink,
  Search,
  Check,
  Plus,
  Trash2,
  Star,
  Landmark,
  Smartphone,
} from "lucide-react";
import {
  getMyProfile,
  updateMyProfile,
  type ProfileRow,
  type PaymentMethod,
} from "@/lib/profile.functions";
import bdTree from "@/lib/bd-postcodes.json";
import { BD_BANKS, BD_MFS_PROVIDERS } from "@/lib/bd-banks";


import { requestR2Upload } from "@/lib/r2.functions";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Cropper, { type Area } from "react-easy-crop";
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
  const addressValid =
    !!form.address_line1?.trim() &&
    !!form.division &&
    !!form.district &&
    !!form.upazila &&
    !!form.post_office &&
    !!form.postcode;
  const canSave = dirty && primaryValid && altValid && gmailValid && addressValid;

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
    if (!addressValid) {
      toast.error("Address is required — fill every field");
      return;
    }
    setSaving(true);
    try {
      await update({
        data: {
          full_name: form.full_name,
          legal_full_name: form.legal_full_name,
          phone_primary: form.phone_primary,
          phone_alt: form.phone_alt,
          address_line1: form.address_line1,
          address_line2: null,
          division: form.division,
          district: form.district,
          upazila: form.upazila,
          post_office: form.post_office,
          city: form.upazila,
          postcode: form.postcode,
          country: "Bangladesh",
          bank_name: null,
          bank_account_name: null,
          bank_account_number: null,
          bank_routing: null,
          mfs_provider: null,
          mfs_number: null,
          payment_methods: form.payment_methods ?? [],
          avatar_url: form.avatar_url,
          nid_url: form.nid_url,
          cv_url: form.cv_url,
          identity_doc_type: form.identity_doc_type,
          nid_front_url: form.nid_front_url,
          nid_back_url: form.nid_back_url,
          passport_photo_url: form.passport_photo_url,
          passport_address_url: form.passport_address_url,
          birth_certificate_url: form.birth_certificate_url,
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

        {/* Payment methods */}
        <Section
          title="Payment Methods"
          description="Add one or more bank or mobile-financial accounts. Mark one as primary — payroll and reimbursements will use it first."
        >
          <PaymentMethodsBlock
            methods={form.payment_methods ?? []}
            onChange={(next) => set("payment_methods", next)}
          />
        </Section>

        {/* Identity Documents */}
        <Section
          title="Identity Document"
          description="Choose your identity document type and upload it. Files are stored privately."
        >
          <IdentityDocumentsBlock
            form={form}
            onChange={(patch) => setForm((p) => ({ ...p, ...patch }))}
            presign={presign}
          />
        </Section>

        {/* CV */}
        <Section
          title="CV / Résumé"
          description="Upload your latest CV in PDF format."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DocumentSlot
              label="CV / Résumé (PDF only)"
              url={form.cv_url}
              onChange={(u) => set("cv_url", u)}
              presign={presign}
              scope="document"
              accept="application/pdf"
            />
          </div>
        </Section>
      </div>
    </div>
  );
}


// ---------- Identity Documents (NID / Passport / Birth Certificate) ----------
type IdDocType = "nid" | "passport" | "birth_certificate";

const ID_DOC_OPTIONS: { value: IdDocType; label: string }[] = [
  { value: "nid", label: "NID (National ID)" },
  { value: "passport", label: "Passport" },
  { value: "birth_certificate", label: "Birth Certificate (Online)" },
];

// Standard document aspect ratios for cropping
// NID: ISO/IEC 7810 ID-1 → 85.6 × 53.98 mm ≈ 1.586
// Passport photo/data page ≈ 125 × 88 mm ≈ 1.42
const NID_ASPECT = 85.6 / 53.98;
const PASSPORT_ASPECT = 125 / 88;

function IdentityDocumentsBlock({
  form,
  onChange,
  presign,
}: {
  form: ProfileRow;
  onChange: (patch: Partial<ProfileRow>) => void;
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>;
}) {
  const type = form.identity_doc_type;

  return (
    <div className="space-y-5">
      {/* Document type selector */}
      <Field label="Document Type">
        <div className="flex flex-wrap gap-2">
          {ID_DOC_OPTIONS.map((opt) => {
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ identity_doc_type: opt.value })}
                className={cn(
                  "h-9 rounded-sm border px-3 text-[12px] font-medium transition-colors",
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-input bg-background text-foreground hover:bg-muted",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      {!type && (
        <p className="text-[12px] text-muted-foreground">
          Select a document type above to upload.
        </p>
      )}

      {type === "nid" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CropUploadSlot
            label="NID — Front Side"
            url={form.nid_front_url}
            onChange={(u) => onChange({ nid_front_url: u })}
            presign={presign}
            aspect={NID_ASPECT}
          />
          <CropUploadSlot
            label="NID — Back Side"
            url={form.nid_back_url}
            onChange={(u) => onChange({ nid_back_url: u })}
            presign={presign}
            aspect={NID_ASPECT}
          />
        </div>
      )}

      {type === "passport" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CropUploadSlot
            label="Passport — Photo Page"
            url={form.passport_photo_url}
            onChange={(u) => onChange({ passport_photo_url: u })}
            presign={presign}
            aspect={PASSPORT_ASPECT}
          />
          <CropUploadSlot
            label="Passport — Address Page"
            url={form.passport_address_url}
            onChange={(u) => onChange({ passport_address_url: u })}
            presign={presign}
            aspect={PASSPORT_ASPECT}
          />
        </div>
      )}

      {type === "birth_certificate" && (
        <div className="space-y-2">
          <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Only the <strong>online</strong> Birth Certificate (issued via
            bdris.gov.bd) is accepted. Handwritten certificates will be rejected.
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <DocumentSlot
              label="Birth Certificate (PDF or Image)"
              url={form.birth_certificate_url}
              onChange={(u) => onChange({ birth_certificate_url: u })}
              presign={presign}
              scope="document"
              accept="image/*,application/pdf"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Cropping upload slot (image only, with fixed aspect crop) ----------
function CropUploadSlot({
  label,
  url,
  onChange,
  presign,
  aspect,
}: {
  label: string;
  url: string | null;
  onChange: (u: string) => void;
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>;
  aspect: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>("document.jpg");
  const upload = useR2Upload(presign, "document");

  const openPicker = () => inputRef.current?.click();

  const onFile = (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Only image files are allowed (JPG, PNG)");
      return;
    }
    setSourceName(f.name.replace(/\.[^.]+$/, ".jpg"));
    const reader = new FileReader();
    reader.onload = () => setSourceUrl(reader.result as string);
    reader.readAsDataURL(f);
  };

  const onCropped = async (blob: Blob) => {
    const file = new File([blob], sourceName, { type: "image/jpeg" });
    try {
      const publicUrl = await upload.mutateAsync(file);
      onChange(publicUrl);
      toast.success("Uploaded");
      setSourceUrl(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="rounded-sm border border-dashed border-border bg-muted/30 p-4">
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>

      {url ? (
        <div className="mt-2 space-y-2">
          <div
            className="overflow-hidden rounded-sm border border-border bg-background"
            style={{ aspectRatio: aspect }}
          >
            <img src={url} alt={label} className="size-full object-cover" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-sm text-[12px]"
              onClick={openPicker}
              disabled={upload.isPending}
            >
              <Upload className="mr-1.5 size-3" />
              Replace
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
            >
              View <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-[12px]"
            onClick={openPicker}
            disabled={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Upload className="mr-1.5 size-3" />
            )}
            Upload or take photo
          </Button>
          <span className="text-[11px] text-muted-foreground">
            JPG / PNG ·
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {sourceUrl && (
        <CropDialog
          src={sourceUrl}
          aspect={aspect}
          title={label}
          onCancel={() => setSourceUrl(null)}
          onConfirm={onCropped}
          busy={upload.isPending}
        />
      )}
    </div>
  );
}

// ---------- Crop Dialog ----------
function CropDialog({
  src,
  aspect,
  title,
  onCancel,
  onConfirm,
  busy,
}: {
  src: string;
  aspect: number;
  title: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  busy?: boolean;
}) {
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pixels, setPixels] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const confirm = async () => {
    if (!pixels) return;
    const blob = await cropImageToBlob(src, pixels, rotation);
    onConfirm(blob);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Crop · {title}</DialogTitle>
        </DialogHeader>
        <div className="relative h-[420px] w-full overflow-hidden rounded-sm bg-black">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={(_a: Area, area: Area) => setPixels(area)}
            showGrid
            objectFit="contain"
          />
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center gap-3">
            <span className="w-14 text-[11px] uppercase tracking-wider text-muted-foreground">
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-[hsl(var(--brand))]"
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-14 text-[11px] uppercase tracking-wider text-muted-foreground">
              Rotate
            </span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="flex-1 accent-[hsl(var(--brand))]"
            />
            <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">
              {rotation}°
            </span>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-sm text-[12px]"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-sm text-[12px]"
            onClick={confirm}
            disabled={busy || !pixels}
          >
            {busy ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Check className="mr-1.5 size-3" />
            )}
            Crop & Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function cropImageToBlob(
  src: string,
  area: { x: number; y: number; width: number; height: number },
  rotation: number,
): Promise<Blob> {
  const img = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const bBoxW = img.width * cos + img.height * sin;
  const bBoxH = img.width * sin + img.height * cos;

  // Draw rotated source onto an offscreen canvas
  const rotCanvas = document.createElement("canvas");
  rotCanvas.width = bBoxW;
  rotCanvas.height = bBoxH;
  const rctx = rotCanvas.getContext("2d")!;
  rctx.translate(bBoxW / 2, bBoxH / 2);
  rctx.rotate(rad);
  rctx.drawImage(img, -img.width / 2, -img.height / 2);

  // Extract the crop area
  const out = document.createElement("canvas");
  out.width = area.width;
  out.height = area.height;
  const octx = out.getContext("2d")!;
  octx.drawImage(
    rotCanvas,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );

  return await new Promise<Blob>((resolve, reject) =>
    out.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas encode failed"))),
      "image/jpeg",
      0.92,
    ),
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
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
  accept = "image/*,application/pdf",
}: {
  label: string;
  url: string | null;
  onChange: (u: string) => void;
  presign: ReturnType<typeof useServerFn<typeof requestR2Upload>>;
  scope: "avatar" | "document";
  accept?: string;
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
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (accept === "application/pdf" && f.type !== "application/pdf") {
            toast.error("Only PDF files are allowed");
            e.target.value = "";
            return;
          }
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

// ---------- BD Address (Division → District → Upazila → Post Office → Postcode) ----------
type BdTree = Record<
  string,
  Record<string, Record<string, Record<string, string>>>
>;
const BD_TREE = bdTree as BdTree;

function BdFlag({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 12"
      className={cn(
        "h-3 w-[18px] shrink-0 overflow-hidden rounded-[1px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.15)]",
        className,
      )}
    >
      <rect width="20" height="12" fill="#006A4E" />
      <circle cx="8.5" cy="6" r="3.4" fill="#F42A41" />
    </svg>
  );
}

function BdSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-[13px] text-foreground outline-none",
        "focus-visible:ring-2 focus-visible:ring-brand",
        disabled && "cursor-not-allowed bg-muted text-muted-foreground",
      )}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{disabled ? "—" : placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function BdAddressBlock({
  form,
  set,
}: {
  form: ProfileRow;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set: <K extends keyof ProfileRow>(k: K, v: ProfileRow[K]) => void;
}) {
  const divisions = useMemo(() => Object.keys(BD_TREE).sort(), []);
  const districts = useMemo(
    () => (form.division ? Object.keys(BD_TREE[form.division] ?? {}).sort() : []),
    [form.division],
  );
  const upazilas = useMemo(
    () =>
      form.division && form.district
        ? Object.keys(BD_TREE[form.division]?.[form.district] ?? {}).sort()
        : [],
    [form.division, form.district],
  );
  const postOffices = useMemo(
    () =>
      form.division && form.district && form.upazila
        ? Object.keys(
            BD_TREE[form.division]?.[form.district]?.[form.upazila] ?? {},
          ).sort()
        : [],
    [form.division, form.district, form.upazila],
  );

  const autoPostcode =
    form.division && form.district && form.upazila && form.post_office
      ? BD_TREE[form.division]?.[form.district]?.[form.upazila]?.[form.post_office] ?? null
      : null;

  // Prune stale/orphaned selections that no longer match the cascading tree.
  // Without this, a previously-saved value (e.g. postcode 5800) sticks around
  // even though the visible dropdown shows nothing, and downstream selects
  // wrongly become enabled because their parent is truthy but invalid.
  useEffect(() => {
    if (form.division && !divisions.includes(form.division)) {
      set("division", null);
      set("district", null);
      set("upazila", null);
      set("post_office", null);
      set("postcode", null);
      return;
    }
    if (form.district && !districts.includes(form.district)) {
      set("district", null);
      set("upazila", null);
      set("post_office", null);
      set("postcode", null);
      return;
    }
    if (form.upazila && !upazilas.includes(form.upazila)) {
      set("upazila", null);
      set("post_office", null);
      set("postcode", null);
      return;
    }
    if (form.post_office && !postOffices.includes(form.post_office)) {
      set("post_office", null);
      set("postcode", null);
      return;
    }
    if (!form.post_office && form.postcode) {
      set("postcode", null);
      return;
    }
    if (autoPostcode && autoPostcode !== form.postcode) {
      set("postcode", autoPostcode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.division,
    form.district,
    form.upazila,
    form.post_office,
    autoPostcode,
  ]);

  return (
    <div className="grid grid-cols-1 gap-4">
      <Field label="Address *" className="md:col-span-2">
        <Input
          className="h-9 rounded-sm"
          value={form.address_line1 ?? ""}
          onChange={(e) => set("address_line1", e.target.value)}
          placeholder="House 12 / Road 4 / Block C / Village name"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Division *">
          <BdSelect
            value={form.division}
            onChange={(v) => {
              set("division", v);
              set("district", null);
              set("upazila", null);
              set("post_office", null);
              set("postcode", null);
            }}
            options={divisions}
            placeholder="Select division"
          />
        </Field>

        <Field label="District *">
          <BdSelect
            value={form.district}
            onChange={(v) => {
              set("district", v);
              set("upazila", null);
              set("post_office", null);
              set("postcode", null);
            }}
            options={districts}
            placeholder="Select district"
            disabled={districts.length === 0}
          />
        </Field>

        <Field label="Upazila / Thana *">
          <BdSelect
            value={form.upazila}
            onChange={(v) => {
              set("upazila", v);
              set("post_office", null);
              set("postcode", null);
            }}
            options={upazilas}
            placeholder="Select upazila"
            disabled={upazilas.length === 0}
          />
        </Field>

        <Field label="Post Office *">
          <BdSelect
            value={form.post_office}
            onChange={(v) => {
              set("post_office", v);
            }}
            options={postOffices}
            placeholder="Select post office"
            disabled={postOffices.length === 0}
          />
        </Field>

        <Field label="Postcode *">
          <Input
            className="h-9 rounded-sm bg-muted font-mono text-[12px]"
            value={form.postcode ?? ""}
            readOnly
            placeholder="—"
          />
        </Field>

        <Field label="Country *">
          <div className="flex h-9 items-center gap-2 rounded-sm border border-input bg-muted px-2.5 text-[13px] text-foreground">
            <BdFlag />
            <span>Bangladesh</span>
          </div>
        </Field>
      </div>
    </div>
  );
}

// ---------- Payment methods ----------
function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function PaymentMethodsBlock({
  methods,
  onChange,
}: {
  methods: PaymentMethod[];
  onChange: (next: PaymentMethod[]) => void;
}) {
  const update = (id: string, patch: Partial<PaymentMethod>) =>
    onChange(methods.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const remove = (id: string) => {
    const next = methods.filter((m) => m.id !== id);
    // If we removed the primary, promote the first remaining to primary.
    if (next.length > 0 && !next.some((m) => m.is_primary)) {
      next[0] = { ...next[0], is_primary: true };
    }
    onChange(next);
  };

  const setPrimary = (id: string) =>
    onChange(methods.map((m) => ({ ...m, is_primary: m.id === id })));

  const add = (kind: "bank" | "mfs") => {
    const method: PaymentMethod = {
      id: newId(),
      kind,
      is_primary: methods.length === 0,
      bank_name: null,
      account_holder: null,
      account_number: null,
      branch: null,
      mfs_provider: null,
      mfs_number: null,
    };
    onChange([...methods, method]);
  };

  return (
    <div className="space-y-3">
      {methods.length === 0 && (
        <div className="rounded-sm border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-[12px] text-muted-foreground">
          No payment methods yet. Add a bank account or an MFS wallet below.
        </div>
      )}

      {methods.map((m) => (
        <PaymentMethodCard
          key={m.id}
          method={m}
          onPatch={(p) => update(m.id, p)}
          onRemove={() => remove(m.id)}
          onMakePrimary={() => setPrimary(m.id)}
          canDelete={methods.length > 0}
        />
      ))}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add("bank")}
          className="h-8 rounded-sm text-[12px]"
        >
          <Plus className="mr-1.5 size-3" />
          <Landmark className="mr-1.5 size-3.5" />
          Add Bank
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => add("mfs")}
          className="h-8 rounded-sm text-[12px]"
        >
          <Plus className="mr-1.5 size-3" />
          <Smartphone className="mr-1.5 size-3.5" />
          Add MFS
        </Button>
      </div>
    </div>
  );
}

function PaymentMethodCard({
  method,
  onPatch,
  onRemove,
  onMakePrimary,
  canDelete,
}: {
  method: PaymentMethod;
  onPatch: (patch: Partial<PaymentMethod>) => void;
  onRemove: () => void;
  onMakePrimary: () => void;
  canDelete: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-card p-4 transition-colors",
        method.is_primary
          ? "border-brand ring-1 ring-brand/30"
          : "border-border",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {method.kind === "bank" ? (
              <>
                <Landmark className="size-3" /> Bank
              </>
            ) : (
              <>
                <Smartphone className="size-3" /> MFS
              </>
            )}
          </div>
          {/* Kind switch (in case user picked the wrong one) */}
          <div className="inline-flex items-center gap-1 rounded-sm border border-border p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => onPatch({ kind: "bank" })}
              className={cn(
                "rounded-[3px] px-2 py-0.5",
                method.kind === "bank"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Bank
            </button>
            <button
              type="button"
              onClick={() => onPatch({ kind: "mfs" })}
              className={cn(
                "rounded-[3px] px-2 py-0.5",
                method.kind === "mfs"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              MFS
            </button>
          </div>
          {method.is_primary && (
            <span className="inline-flex items-center gap-1 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand">
              <Star className="size-3 fill-current" /> Primary
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!method.is_primary && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMakePrimary}
              className="h-7 rounded-sm text-[11px]"
            >
              <Star className="mr-1 size-3" /> Make primary
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-7 rounded-sm text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {method.kind === "bank" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Bank Name *">
            <SearchableSelect
              value={method.bank_name ?? null}
              onChange={(v) => onPatch({ bank_name: v })}
              options={BD_BANKS}
              placeholder="Search Bangladeshi banks…"
            />
          </Field>
          <Field label="Account Holder Name *">
            <Input
              className="h-9 rounded-sm"
              value={method.account_holder ?? ""}
              onChange={(e) => onPatch({ account_holder: e.target.value })}
              placeholder="As printed on the cheque book"
            />
          </Field>
          <Field label="Account Number *">
            <Input
              className="h-9 rounded-sm font-mono text-[12px]"
              value={method.account_number ?? ""}
              onChange={(e) => onPatch({ account_number: e.target.value })}
            />
          </Field>
          <Field label="Branch *">
            <Input
              className="h-9 rounded-sm"
              value={method.branch ?? ""}
              onChange={(e) => onPatch({ branch: e.target.value })}
              placeholder="e.g. Gulshan, Dhaka"
            />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="MFS Provider *">
            <SearchableSelect
              value={method.mfs_provider ?? null}
              onChange={(v) => onPatch({ mfs_provider: v })}
              options={BD_MFS_PROVIDERS}
              placeholder="Select MFS provider…"
            />
          </Field>
          <Field label="Account Holder Name *">
            <Input
              className="h-9 rounded-sm"
              value={method.account_holder ?? ""}
              onChange={(e) => onPatch({ account_holder: e.target.value })}
              placeholder="Registered wallet holder name"
            />
          </Field>
          <Field label="MFS Number *" className="md:col-span-2">
            <Input
              className="h-9 rounded-sm font-mono text-[12px]"
              value={method.mfs_number ?? ""}
              onChange={(e) => onPatch({ mfs_number: e.target.value })}
              placeholder="01XXXXXXXXX"
              inputMode="numeric"
            />
          </Field>
        </div>
      )}
    </div>
  );
}

// ---------- Searchable single-select ----------
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: string[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [q, options]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-sm border border-input bg-background px-2.5 text-left text-[13px] outline-none",
          "focus-visible:ring-2 focus-visible:ring-brand",
        )}
      >
        <span className={cn(!value && "text-muted-foreground")}>
          {value ?? placeholder}
        </span>
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-sm border border-border bg-popover shadow-md">
          <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Type to search…"
              className="h-7 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[12px] text-muted-foreground">
                No matches
              </div>
            )}
            {filtered.map((o) => {
              const selected = o === value;
              return (
                <button
                  type="button"
                  key={o}
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                    setQ("");
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-accent",
                    selected && "bg-accent",
                  )}
                >
                  <span>{o}</span>
                  {selected && <Check className="size-3.5 text-brand" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
