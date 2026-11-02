import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Unlink } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CLIENT_ID = "437429798252-8hu096me780rb7vm072nfnqoadkvkpqq.apps.googleusercontent.com";

type GoogleId = {
  initialize: (o: Record<string, unknown>) => void;
  prompt: () => void;
  cancel: () => void;
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

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-label="Google">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
      <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function CloudflareLogo() {
  return (
    <svg viewBox="0 0 64 30" className="h-3.5 w-4" aria-label="Cloudflare">
      <path fill="#F38020" d="M44 27l.6-2c.7-2.4.4-4.6-.8-6.2-1.1-1.5-2.9-2.3-5-2.4l-20.6-.3c-.1 0-.3-.1-.3-.2-.1-.1-.1-.2 0-.4.1-.2.2-.3.4-.3l20.8-.3c2.5-.1 5.1-2.1 6-4.5l1.2-3.1c.1-.1.1-.3 0-.4C44.9 3 40 0 34.5 0 27.9 0 22.4 4.3 20.4 10.2c-1.3-1-2.9-1.5-4.7-1.3-3.1.3-5.6 2.8-5.9 5.9-.1.8 0 1.6.2 2.3C4.9 17.2 1 21.4 1 26.5c0 .5 0 .9.1 1.4 0 .2.2.4.4.4h41.9c.3 0 .5-.2.6-.4z"/>
      <path fill="#FAAE40" d="M51.2 12.6h-.6c-.1 0-.3.1-.3.3l-.9 3c-.7 2.4-.4 4.6.8 6.2 1.1 1.5 2.9 2.3 5 2.4l4.4.3c.1 0 .3.1.3.2.1.1.1.3 0 .4-.1.2-.2.3-.4.3l-4.6.3c-2.5.1-5.1 2.1-6 4.5l-.3.9c-.1.2.1.4.3.4h15.6c.2 0 .4-.1.4-.3.3-1 .4-2 .4-3.1 0-6.1-5-11.1-11.1-11.1"/>
    </svg>
  );
}

export function GoogleGmailConnect({
  email,
  source = "google",
  onConnect,
  onDisconnect,
}: {
  email: string | null;
  source?: "google" | "cloudflare" | null;
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
            gid.cancel();
            if (!res.credential) return;
            const p = decodeJwt(res.credential);
            const mail = String(p.email ?? "").toLowerCase();
            if (!p.email_verified || !/^[a-z0-9._%+-]+@gmail\.com$/.test(mail)) {
              toast.error("Must be a verified @gmail.com address");
              return;
            }
            cbRef.current(mail, typeof p.picture === "string" ? p.picture.replace(/=s\d+-c$/, "=s400-c") : null);
            
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
      const g = (window as unknown as { google?: { accounts?: { id?: GoogleId } } }).google;
      g?.accounts?.id?.cancel();
      if (btnRef.current) btnRef.current.innerHTML = "";
    };
  }, [email]);

  if (email) {
    return (
      <div className="flex min-h-10 items-center justify-between gap-2 rounded-sm border border-border bg-card px-3 py-1.5 shadow-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
            {source === "cloudflare" ? <CloudflareLogo /> : <GoogleG />}
          </span>
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-[12.5px] font-semibold text-foreground">{email}</span>
            <BadgeCheck
              className="h-4 w-4 shrink-0 fill-[#0866FF] text-white"
              aria-label={source === "cloudflare" ? "Verified via Cloudflare" : "Verified via Google"}
            />
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-destructive/30 bg-destructive/5 px-2.5 text-[11.5px] font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Unlink className="h-3.5 w-3.5" /> Disconnect
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect Gmail?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-mono">{email}</span> will be removed from your profile. Your profile photo stays unchanged.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Disconnect
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
