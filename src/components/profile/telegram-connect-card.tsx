import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, Unlink } from "lucide-react";
import {
  getMyTelegramStatus,
  startTelegramLink,
  unlinkMyTelegram,
} from "@/lib/telegram.functions";
import { TelegramIcon } from "@/components/social/telegram-icon";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

const TG_BLUE = "#229ED9";

export function TelegramConnectCard() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const statusFn = useServerFn(getMyTelegramStatus);
  const startFn = useServerFn(startTelegramLink);
  const unlinkFn = useServerFn(unlinkMyTelegram);
  const [polling, setPolling] = useState(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => statusFn(),
    refetchInterval: polling ? 3000 : false,
  });

  // Stop polling once linked, or after 3 minutes.
  useEffect(() => {
    if (polling && status.data?.linked) {
      setPolling(false);
      toast.success("Telegram connected");
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    }
  }, [polling, status.data]);

  const start = useMutation({
    mutationFn: () => startFn(),
    onSuccess: (res) => {
      window.open(res.deepLink, "_blank", "noopener,noreferrer");
      setPolling(true);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = setTimeout(() => setPolling(false), 3 * 60 * 1000);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to start link");
    },
  });

  const unlink = useMutation({
    mutationFn: () => unlinkFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram-status"] });
      toast.success("Telegram unlinked");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
    },
  });

  const linked = status.data?.linked === true;

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className="grid size-10 shrink-0 place-items-center rounded-md"
          style={{ backgroundColor: `${TG_BLUE}14` }}
        >
          <TelegramIcon className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-[13px] font-semibold text-foreground">
              Telegram notifications
            </div>
            {linked && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <CheckCircle2 className="size-3" /> Connected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Receive real-time Branta Tech alerts directly on Telegram. Event
            triggers will be added later — connect now to be ready.
          </p>

          {status.isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </div>
          ) : linked ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-sm border border-border bg-muted/40 p-2.5 text-[12px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-muted-foreground">Telegram:</span>
                  <span className="font-medium text-foreground">
                    {status.data?.username
                      ? `@${status.data.username}`
                      : (status.data?.firstName ?? "Linked account")}
                  </span>
                  <span className="text-muted-foreground">Chat ID:</span>
                  <span className="font-mono text-[11px] text-foreground">
                    {status.data?.chatId}
                  </span>
                </div>
                {status.data?.linkedAt && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Linked{" "}
                    {new Date(status.data.linkedAt).toLocaleString("en-GB")}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={unlink.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Unlink Telegram?",
                    description:
                      "You will stop receiving Branta Tech notifications on this Telegram chat. You can reconnect any time.",
                    confirmText: "Unlink",
                    tone: "danger",
                  });
                  if (ok) unlink.mutate();
                }}
              >
                {unlink.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Unlink className="mr-1.5 size-3.5" />
                )}
                Unlink Telegram
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => start.mutate()}
                disabled={start.isPending}
                className="inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
                style={{ backgroundColor: TG_BLUE }}
              >
                {start.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <TelegramIcon className="size-4" />
                )}
                Connect with Telegram
                <ExternalLink className="size-3.5 opacity-80" />
              </button>
              {polling && (
                <div className="flex items-center gap-2 rounded-sm border border-sky-200 bg-sky-50 px-2.5 py-2 text-[12px] text-sky-800">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>
                    Waiting for you to press <b>Start</b> in Telegram… this
                    card will update automatically.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
