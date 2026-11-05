import { useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Row = { id: string; value: string };
let seq = 0;
export const toRows = (xs: string[]): Row[] => xs.map((value) => ({ id: `s${++seq}`, value }));

/** Ordered, drag-to-reorder list editor for a company's services. */
export function ServicesEditor({ rows, onChange }: { rows: Row[]; onChange: (r: Row[]) => void }) {
  const [draft, setDraft] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dup = (v: string, id?: string) => rows.some((r) => r.id !== id && r.value.trim().toLowerCase() === v.trim().toLowerCase());
  const add = () => {
    const v = draft.trim();
    if (!v || dup(v)) return;
    onChange([...rows, ...toRows([v])]);
    setDraft("");
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rows.findIndex((r) => r.id === e.active.id), to = rows.findIndex((r) => r.id === e.over!.id);
    onChange(arrayMove(rows, from, to));
  };
  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {rows.map((r, i) => (
            <SortRow key={r.id} id={r.id}>
              <span className="w-5 shrink-0 text-center font-mono text-[11px] font-bold text-muted-foreground">{i + 1}</span>
              <Input value={r.value} maxLength={80} onChange={(e) => onChange(rows.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)))}
                className={cn("min-w-0 flex-1", (!r.value.trim() || dup(r.value, r.id)) && "border-destructive")} />
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${r.value}`} onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90">
                <Trash2 className="size-3.5" />
              </Button>
            </SortRow>
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-2">
        <Input value={draft} maxLength={80} placeholder="e.g. Web Development" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className={cn("min-w-0 flex-1", draft && dup(draft) && "border-destructive")} />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim() || dup(draft)}
          className="h-9 gap-1 border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-95">
          <Plus className="size-3.5" /> Add service
        </Button>
      </div>
      {draft && dup(draft) && <p className="text-[11.5px] text-destructive">This service is already in the list.</p>}
    </div>
  );
}

function SortRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-lg border border-transparent bg-card", isDragging && "z-10 border-brand/40 shadow-lg ring-2 ring-brand/10")}>
      <button type="button" aria-label="Drag to reorder" {...attributes} {...listeners}
        className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing">
        <GripVertical className="size-4" />
      </button>
      {children}
    </div>
  );
}
