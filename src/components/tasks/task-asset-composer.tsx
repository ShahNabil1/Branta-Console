// Shared "add assets & references" composer for New Task and Task detail:
// pick Asset/Reference and the subtask first (its assignee is applied
// automatically), then paste links and/or upload images, PDFs and ZIPs (R2).
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ListChecks, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { MAX_SUBMISSION_FILE_BYTES, parseAssetLinks, submissionFileKind } from "@/lib/company-task-rules";
import { AREA, LABEL, AssetKindToggle, type AssetKind } from "./task-ui";

export type ComposerSubtask = { value: string; label: string; assignee_id: string | null };
export type ComposedItem = { url?: string; file?: File; kind: AssetKind; subtask: string; assignee_id: string };

export const ASSET_ACCEPT = "image/*,.pdf,application/pdf,.zip,application/zip,application/x-zip-compressed";

/** Filters a FileList to valid task files (image/PDF/ZIP, ≤ 50 MB), toasting rejects. */
export function validTaskFiles(list: FileList | File[] | null): File[] {
  const out: File[] = [];
  for (const f of Array.from(list ?? [])) {
    if (!submissionFileKind(f.name, f.type)) { toast.error(`${f.name}: only images, PDFs and ZIP files`); continue; }
    if (f.size > MAX_SUBMISSION_FILE_BYTES) { toast.error(`${f.name} is larger than 50 MB`); continue; }
    out.push(f);
  }
  return out;
}

export function TaskAssetComposer({ subtasks, room, busy, existingUrls, onAdd }: {
  subtasks: ComposerSubtask[]; room: number; busy?: boolean; existingUrls: string[];
  onAdd: (items: ComposedItem[]) => void;
}) {
  const [kind, setKind] = useState<AssetKind>("asset");
  const [subtask, setSubtask] = useState("");
  const [links, setLinks] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const st = subtasks.find((s) => s.value === subtask);
  const base = () => ({ kind, subtask, assignee_id: st?.assignee_id ?? "" });

  const fit = <T,>(arr: T[]) => {
    if (arr.length > room) toast.error(`Only ${room} more item${room === 1 ? "" : "s"} fit.`);
    return arr.slice(0, Math.max(0, room));
  };
  const addLinks = () => {
    const urls = parseAssetLinks(links).filter((u) => !existingUrls.includes(u));
    if (!urls.length) return toast.error("Paste one or more http(s) links");
    onAdd(fit(urls).map((url) => ({ url, ...base() })));
    setLinks("");
  };
  const addFiles = (list: FileList | null) => {
    const files = validTaskFiles(list);
    if (files.length) onAdd(fit(files).map((file) => ({ file, ...base() })));
    if (input.current) input.current.value = "";
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border bg-card p-2.5">
      <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
        <div><div className={LABEL}>Type</div><AssetKindToggle value={kind} onChange={setKind} className="mt-1" /></div>
        <div>
          <div className={`${LABEL} flex items-center gap-1`}><ListChecks className="size-3" />For subtask</div>
          <div className="mt-1"><SearchableSelect clearable searchable={subtasks.length > 6} items={subtasks.map((s, i) => ({ value: s.value, label: `${i + 1}. ${s.label}` }))} value={subtask} onChange={(v) => setSubtask(v ?? "")} placeholder="Whole task" emptyText="No subtasks yet" /></div>
        </div>
      </div>
      {st && <p className="text-[11px] font-semibold text-muted-foreground">New items go to this subtask{st.assignee_id ? " and its assignee" : ""} — you can change each one below.</p>}
      <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={3} aria-label="Paste links" placeholder="Paste links, one per line" className={`${AREA} font-mono text-[12px]`} />
      <input ref={input} type="file" multiple hidden accept={ASSET_ACCEPT} onChange={(e) => addFiles(e.target.files)} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy || room <= 0} onClick={() => input.current?.click()} className="h-9 gap-1 rounded-md"><Upload className="size-4" />Upload files</Button>
        <Button type="button" variant="outline" disabled={busy || room <= 0 || !links.trim()} onClick={addLinks} className="h-9 gap-1 rounded-md"><Plus className="size-4" />Add links</Button>
      </div>
      <p className="text-[10.5px] text-muted-foreground">Images, PDFs or ZIP · up to 50 MB each</p>
    </div>
  );
}
