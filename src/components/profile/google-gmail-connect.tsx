import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, X } from "lucide-react";

const CLIENT_ID = "437429798252-8hu096me780rb7vm072nfnqoadkvkpqq.apps.googleusercontent.com";

type GoogleId = {
  initialize: (o: Record<string, unknown>) => void;
  prompt: () => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
};

function loadGis(): Promise<GoogleId> {
  const w = window as unknown as { google?: { accounts?: { id?: GoogleId } } };
  if (w.google?.accounts?.id) return Promise.resolve(w.google.accounts.id);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google?.accounts?.id ? resolve(w.google.accounts.id) : reject(new Error("GIS unavailable")));
    s.onerror = () => reject(new Error("Could not load Google"));
    document.head.appendChild(s);
  });
}

function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(part).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
  );
  return JSON.parse(json);
}

export function GoogleGmailConnect({
  email,
  onConnect,
  onDisconnect,
}: {
  email: string | null;
  onConnect: (email: string, picture: string | null) => void;
  onDisconnect: () => void;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onConnect);
  cbRef.current = onConnect;
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (email) return;
    let cancelled = false;
    loadGis()
      .then((gid) => {
        if (cancelled || !btnRef.current) return;
        gid.initialize({
          client_id: CLIENT_ID,
          use_fedcm_for_prompt: true,
          auto_select: false,
          cancel_on_tap_outside: true,
          context: "use",
          callback: (res: { credential?: string }) => {
            if (!res.credential) return;
            const p = decodeJwt(res.credential);
            const mail = String(p.email ?? "").toLowerCase();
            if (!p.email_verified || !/^[a-z0-9._%+-]+@gmail\.com$/.test(mail)) {
              toast.error("Must be a verified @gmail.com address");
              return;
            }
            cbRef.current(mail, typeof p.picture === "string" ? p.picture.replace(/=s\d+-c$/, "=s400-c") : null);
            toast.success("Gmail connected — click Save changes");
          },
        });
        gid.renderButton(btnRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
        gid.prompt();
      })
      .catch((e: Error) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  }, [email]);

  if (email) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-sm border border-border bg-muted/40 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-mono text-[12px]">{email}</span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Verified via Google</span>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" /> Disconnect
        </button>
      </div>
    );
  }
  return (
    <div>
      <div ref={btnRef} className="min-h-10" />
      {err && <p className="mt-1 text-[11px] text-destructive">{err}</p>}
    </div>
  );
}
