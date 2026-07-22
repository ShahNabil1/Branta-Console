import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestLeadTransfer } from "@/lib/lead-transfers.functions";

export function RequestTransferDialog({
  leadId,
  currentOwnerId,
  users,
  open,
  onOpenChange,
}: {
  leadId: string;
  currentOwnerId: string | null;
  users: { user_id: string; full_name: string | null }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const reqFn = useServerFn(requestLeadTransfer);
  const [toUser, setToUser] = useState("");
  const [note, setNote] = useState("");

  const candidates = users.filter((u) => u.user_id !== currentOwnerId);

  const m = useMutation({
    mutationFn: () =>
      reqFn({
        data: {
          leadId,
          toUserId: toUser,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Transfer request sent to super admins");
      setToUser("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["leads", "activities"] });
      qc.invalidateQueries({ queryKey: ["transfers", "mine"] });
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Request failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-sm">
        <DialogHeader>
          <DialogTitle>Request lead transfer</DialogTitle>
          <DialogDescription className="text-[12px]">
            Pick a teammate to hand this lead over to. A super admin will
            approve or reject the request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Transfer to
            </div>
            <Select value={toUser} onValueChange={setToUser}>
              <SelectTrigger className="h-9 rounded-sm text-[12.5px]">
                <SelectValue placeholder="Select a teammate" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name || u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Note (optional)
            </div>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why should this lead be reassigned?"
              className="min-h-[72px] rounded-sm text-[12.5px]"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-sm text-[12px]"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!toUser || m.isPending}
            onClick={() => m.mutate()}
            className="h-8 rounded-sm bg-primary text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            Send request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
