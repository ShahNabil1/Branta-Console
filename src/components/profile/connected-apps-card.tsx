import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, Info, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { disconnectMyApp, getMyAppAccess, listMyConnectedApps } from "@/lib/tracker-sso.functions";
import trackerLogo from "@/assets/apps/tracker.png";
import admakaiLogo from "@/assets/apps/admakai.png";

type AppKey = "tracker_extension" | "admakai";

/** Single source of truth for the current Branta Tracker release. Bump with each new ZIP in public/downloads. */
export const TRACKER_VERSION = "0.7.2";
const TRACKER_ZIP = `/downloads/branta-tracker-extension-v${TRACKER_VERSION}.zip`;
const TRACKER_STEPS = [
  "Click “Download Extension” to save the ZIP file.",
  "Unzip it — you get one folder named “branta-tracker-extension”. Keep this folder; don’t delete or move it later.",
  "Open Chrome and go to chrome://extensions",
  "Turn on “Developer mode” (top-right corner).",
  "Click “Load unpacked” and select the “branta-tracker-extension” folder.",
  "Pin Branta Tracker from the puzzle icon, open it and choose “Sign in with Branta Console”.",
  "Updating: download the new ZIP, replace the old folder’s contents, then press Reload on the Branta Tracker card in chrome://extensions.",
];

const APPS: Record<
  AppKey,
  { name: string; logo: string; tagline: string; about: string[]; connectLabel: string; connectUrl: string; connectHint: string }
> = {
  tracker_extension: {
    name: "Branta Tracker",
    logo: trackerLogo,
    tagline: "Shift time, breaks and activity from your Chrome browser.",
    about: [
      "Signs in with your Branta ID — no separate password.",
      "Records Shift time, breaks, Active/Idle status and periodic screenshots.",
      "Disconnecting stops new sign-ins; sign out inside the extension to end its current session.",
    ],
    connectLabel: "How to connect",
    connectUrl: "",
    connectHint: "Open the Branta Tracker extension in Chrome and choose “Sign in with Branta Console”.",
  },
  admakai: {
    name: "Admakai",
    logo: admakaiLogo,
    tagline: "Branta’s marketing workspace, signed in with your Branta ID.",
    about: [
      "Uses single sign-on from this Console — your role is mirrored automatically.",
      "Access ends automatically if your employee account is deactivated.",
      "Disconnecting removes this link; you can reconnect any time.",
    ],
    connectLabel: "Connect",
    connectUrl: "https://admakai.com",
    connectHint: "Opens Admakai — sign in with Branta Console to connect.",
  },
};

const ORDER: AppKey[] = ["tracker_extension", "admakai"];

export function ConnectedAppsCard() {
  const list = useServerFn(listMyConnectedApps);
  const disconnect = useServerFn(disconnectMyApp);
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [info, setInfo] = useState<AppKey | null>(null);
  const q = useQuery({ queryKey: ["connected-apps"], queryFn: () => list() });
  const accessFn = useServerFn(getMyAppAccess);
  const access = useQuery({ queryKey: ["connected-apps", "access"], queryFn: () => accessFn() });
  const admakaiAllowed = !!access.data && (access.data.isSuperAdmin || access.data.allowedApps.includes("admakai"));
  const m = useMutation({
    mutationFn: (app: AppKey) => disconnect({ data: { app } }),
    onSuccess: (_d, app) => {
      toast.success(`${APPS[app].name} disconnected`);
      qc.invalidateQueries({ queryKey: ["connected-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  const byApp = new Map(rows.map((r) => [r.app, r]));

  const onDisconnect = async (app: AppKey) => {
    const ok = await confirm({
      title: `Disconnect ${APPS[app].name}?`,
      description: `${APPS[app].name} will no longer be able to sign in with your Branta ID until you connect it again.`,
      confirmLabel: "Disconnect",
      tone: "danger",
    });
    if (ok) m.mutate(app);
  };

  const onConnect = (app: AppKey) => {
    const a = APPS[app];
    if (a.connectUrl) window.open(a.connectUrl, "_blank", "noopener,noreferrer");
    else setInfo(app);
  };

  return (
    <div className="space-y-3">
      {ORDER.map((key) => {
        const a = APPS[key];
        const r = byApp.get(key);
        const connected = !!r;
        return (
          <div key={key} className="rounded-md border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <img src={a.logo} alt={`${a.name} logo`} className="size-10 shrink-0 rounded-md border border-border object-contain" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[13px] font-semibold text-foreground">{a.name}</div>
                  {key === "tracker_extension" && (
                    <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">v{TRACKER_VERSION}</span>
                  )}
                  {connected ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                      <CheckCircle2 className="size-3" /> Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Not connected
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setInfo(key)}
                    className="ml-auto rounded-sm p-1 text-muted-foreground hover:text-foreground"
                    aria-label={`About ${a.name}`}
                  >
                    <Info className="size-4" />
                  </button>
                </div>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{a.tagline}</p>

                {q.isLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Loading…
                  </div>
                ) : connected ? (
                  <div className="mt-3 space-y-2">
                    <div className="rounded-sm border border-border bg-muted/40 p-2.5 text-[12px] text-muted-foreground">
                      Connected {new Date(r.connected_at).toLocaleDateString("en-GB")} · Last sign-in{" "}
                      {new Date(r.last_authorized_at).toLocaleString("en-GB")}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={m.isPending}
                      onClick={() => onDisconnect(key)}
                    >
                      {m.isPending && m.variables === key ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <Unlink className="mr-1.5 size-3.5" />
                      )}
                      Disconnect
                    </Button>
                    {key === "tracker_extension" && (
                      <Button asChild type="button" variant="outline" size="sm" className="ml-2">
                        <a href={TRACKER_ZIP} download><Download className="mr-1.5 size-3.5" /> Download Extension</a>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3">
                    {key === "tracker_extension" ? (
                      <Button asChild type="button" size="sm">
                        <a href={TRACKER_ZIP} download><Download className="mr-1.5 size-3.5" /> Download Extension</a>
                      </Button>
                    ) : (
                      <>
                        <Button type="button" size="sm" disabled={key === "admakai" && !admakaiAllowed} onClick={() => onConnect(key)}>
                          {a.connectLabel}
                          {a.connectUrl ? <ExternalLink className="ml-1.5 size-3.5 opacity-80" /> : null}
                        </Button>
                        {key === "admakai" && access.data && !admakaiAllowed ? (
                          <p className="mt-1.5 text-[12px] text-muted-foreground">Access not granted by administrator.</p>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Dialog open={info !== null} onOpenChange={(o) => !o && setInfo(null)}>
        <DialogContent className="max-w-md">
          {info && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <img src={APPS[info].logo} alt="" className="size-9 rounded-md border border-border object-contain" />
                  <DialogTitle>{APPS[info].name}</DialogTitle>
                </div>
                <DialogDescription>{APPS[info].tagline}</DialogDescription>
              </DialogHeader>
              <ul className="list-disc space-y-1.5 pl-5 text-[12.5px] text-foreground">
                {APPS[info].about.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {info === "tracker_extension" ? (
                <div className="rounded-sm border border-border bg-muted/40 p-3">
                  <div className="mb-2 text-[12px] font-semibold text-foreground">How to install (v{TRACKER_VERSION})</div>
                  <ol className="list-decimal space-y-1.5 pl-5 text-[12px] text-muted-foreground">
                    {TRACKER_STEPS.map((t) => <li key={t}>{t}</li>)}
                  </ol>
                  <Button asChild size="sm" className="mt-3 w-full">
                    <a href={TRACKER_ZIP} download><Download className="mr-1.5 size-3.5" /> Download Extension</a>
                  </Button>
                </div>
              ) : (
                <p className="rounded-sm border border-border bg-muted/40 p-2.5 text-[12px] text-muted-foreground">
                  <b className="text-foreground">How to connect:</b> {APPS[info].connectHint}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
