// Shared Bangladesh phone + address fields (reused by profile and company pages).
import { useEffect, useMemo, useState } from "react";
import bdTree from "@/lib/bd-postcodes.json";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type AddrFields = {
  address_line1: string | null; division: string | null; district: string | null;
  upazila: string | null; post_office: string | null; postcode: string | null;
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
export const pickAddr = (r: AddrFields): AddrFields => ({
  address_line1: r.address_line1 ?? null,
  division: r.division ?? null,
  district: r.district ?? null,
  upazila: r.upazila ?? null,
  post_office: r.post_office ?? null,
  postcode: r.postcode ?? null,
});
export const NON_EN = /[^A-Za-z0-9\s,./#()'&:-]/g;
export const isEnglishAddr = (v: string) => !/[^A-Za-z0-9\s,./#()'&:-]/.test(v);
export const OTHER_PO = "Other (not listed)";
export const addrValid = (r: AddrFields) =>
  !!(
    r.address_line1?.trim() &&
    isEnglishAddr(r.address_line1) &&
    r.division &&
    r.district &&
    r.upazila &&
    r.post_office?.trim() &&
    /^\d{4}$/.test(r.postcode ?? "")
  );
// Bangladesh standard: "<address>, <PostOffice>-<Postcode>, <Upazila>, <District>, <Division>."
export const fmtAddr = (r: AddrFields) => {
  const po = [r.post_office, r.postcode].filter(Boolean).join("-");
  const s = [r.address_line1?.trim().replace(/[,.\s]+$/, ""), po, r.upazila, r.district, r.division]
    .filter(Boolean)
    .join(", ");
  return s ? `${s}.` : "Not added yet";
};
// ---------- BD Phone Input ----------
const BENGALI_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

export function normalizeBdDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    if (BENGALI_DIGITS[ch]) out += BENGALI_DIGITS[ch];
    else if (/[0-9]/.test(ch)) out += ch;
  }
  return out.slice(0, 11);
}

export function BdPhoneInput({
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

export function BdFlag({ className }: { className?: string }) {
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

export function BdAddressBlock({
  form,
  set,
}: {
  form: AddrFields;
  set: <K extends keyof AddrFields>(k: K, v: AddrFields[K]) => void;
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
  const [manual, setManual] = useState(false);
  const [nonEn, setNonEn] = useState(false);
  useEffect(() => {
    setManual(false);
  }, [form.division, form.district, form.upazila]);

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
    if (manual) return;
    if (form.post_office && !postOffices.includes(form.post_office)) {
      if (postOffices.length) {
        setManual(true);
        return;
      }
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
        <textarea
          rows={3}
          maxLength={200}
          className="w-full resize-y rounded-sm border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand"
          value={form.address_line1 ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setNonEn(!isEnglishAddr(v));
            set("address_line1", v.replace(NON_EN, ""));
          }}
          placeholder="House 12, Road 4, Block C / Village name"
        />
        {nonEn && (
          <p className="mt-1 text-[11px] text-destructive">
            Only English letters, numbers and , . - / # ( ) are allowed.
          </p>
        )}
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
            value={manual ? OTHER_PO : form.post_office}
            onChange={(v) => {
              if (v === OTHER_PO) {
                setManual(true);
                set("post_office", null);
                set("postcode", null);
              } else {
                setManual(false);
                set("post_office", v);
              }
            }}
            options={postOffices.length ? [...postOffices, OTHER_PO] : []}
            placeholder="Select post office"
            disabled={postOffices.length === 0}
          />
          {manual && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Not listed? Type the exact post office name and its 4-digit postcode.
            </p>
          )}
        </Field>

        {manual && (
          <Field label="Post Office name *">
            <Input
              className="h-9 rounded-sm text-[13px]"
              value={form.post_office ?? ""}
              onChange={(e) => set("post_office", e.target.value.replace(/[^A-Za-z .'-]/g, "") || null)}
              placeholder="e.g. Banaichhat"
            />
          </Field>
        )}
        <Field label="Postcode *">
          <Input
            className={`h-9 rounded-sm font-mono text-[12px] ${manual ? "" : "bg-muted"}`}
            value={form.postcode ?? ""}
            readOnly={!manual}
            inputMode="numeric"
            maxLength={4}
            onChange={(e) => manual && set("postcode", e.target.value.replace(/\D/g, "").slice(0, 4) || null)}
            placeholder={manual ? "4 digits" : "—"}
          />
          {manual && form.postcode && form.postcode.length !== 4 && (
            <p className="mt-1 text-[11px] text-destructive">Postcode must be 4 digits.</p>
          )}
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

