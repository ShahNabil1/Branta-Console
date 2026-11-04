import { confirmAction } from "@/components/ui/confirm-dialog";
// Shown on Converted leads: creates (or opens) the linked Client Profile.
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Building2, Loader2 } from "lucide-react";
import { convertLeadToClient, getLeadClientCode } from "@/lib/client-projects.functions";

export function ConvertToClientButton({ leadId, status }: { leadId: string; status: string }) {
  const navigate = useNavigate();
  const getCode = useServerFn(getLeadClientCode);
  const convert = useServerFn(convertLeadToClient);
  const q = useQuery({
    queryKey: ["lead-client", leadId],
    queryFn: () => getCode({ data: { leadId } }),
    enabled: status === "converted",
  });
  const m = useMutation({
    mutationFn: () => convert({ data: { leadId } }),
    onSuccess: (r) => {
      toast.success(r.created ? "Client profile created" : "Opening client profile");
      navigate({ to: "/app/customers/$code", params: { code: r.code } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (status !== "converted") return null;
  const code = q.data?.code;
  return (
    <button
      disabled={m.isPending || q.isLoading}
      onClick={() => {
        if (code) navigate({ to: "/app/customers/$code", params: { code } });
        else void confirmAction({ tone: "info", icon: Building2, title: "Convert this lead to a client?", subject: "A client profile will be created", points: ["Name, company and contact person are copied.", "Phone, WhatsApp, email and owner are copied.", "The lead and its history stay unchanged."], confirmLabel: "Convert to client" }).then((ok) => ok && m.mutate());
      }}
      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-[14px] font-semibold text-primary-foreground shadow-sm transition active:scale-[.98] disabled:opacity-60"
    >
      {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
      {code ? "Open Client Profile" : "Convert Lead to Client"}
      <ArrowRight className="size-4" />
    </button>
  );
}
