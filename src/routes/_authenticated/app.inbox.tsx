import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Inbox as InboxIcon,
  Mail,
  RefreshCw,
  Send,
  Loader2,
  ExternalLink,
  Link as LinkIcon,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import DOMPurify from "isomorphic-dompurify";
import { supabase } from "@/integrations/supabase/client";
import {
  listInbox,
  syncInbox,
  getInboxThread,
  markThreadRead,
  type InboxRow,
} from "@/lib/inbox.functions";
import { sendInboxReply } from "@/lib/inbox-reply.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox · Branta Tech Console" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InboxPage,
});

type FilterKey = "all" | "unread" | "mine" | "linked" | "unlinked";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "mine", label: "Assigned to me" },
  { key: "linked", label: "Linked to lead" },
  { key: "unlinked", label: "Unlinked" },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay)
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function InboxPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInbox);
  const syncFn = useServerFn(syncInbox);
  const markReadFn = useServerFn(markThreadRead);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedThread, setSelectedThread] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["inbox", "list", filter],
    queryFn: () => listFn({ data: { filter, limit: 200 } }),
    staleTime: 15_000,
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: { maxResults: 50 } }),
    onSuccess: (r) => {
      toast.success(`Synced ${r.synced} messages`);
      qc.invalidateQueries({ queryKey: ["inbox"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-sync on mount, then every 60s.
  useEffect(() => {
    syncMut.mutate();
    const t = setInterval(() => syncMut.mutate(), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime — refresh list on any inbox_messages change.
  useEffect(() => {
    const ch = supabase
      .channel("inbox-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inbox_messages" },
        () => qc.invalidateQueries({ queryKey: ["inbox"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // Group cache rows by thread — one row per thread with unread count.
  const threads = useMemo(() => {
    const rows = listQ.data ?? [];
    const byThread = new Map<
      string,
      { latest: InboxRow; unread: number; count: number }
    >();
    for (const r of rows) {
      const cur = byThread.get(r.gmail_thread_id);
      if (!cur) {
        byThread.set(r.gmail_thread_id, {
          latest: r,
          unread: r.is_unread ? 1 : 0,
          count: 1,
        });
      } else {
        cur.count += 1;
        if (r.is_unread) cur.unread += 1;
        if (new Date(r.received_at) > new Date(cur.latest.received_at))
          cur.latest = r;
      }
    }
    return Array.from(byThread.values()).sort(
      (a, b) =>
        new Date(b.latest.received_at).getTime() -
        new Date(a.latest.received_at).getTime(),
    );
  }, [listQ.data]);

  const handleSelect = (threadId: string) => {
    setSelectedThread(threadId);
    // Mark read optimistically after opening.
    setTimeout(() => {
      markReadFn({ data: { threadId } })
        .then(() => qc.invalidateQueries({ queryKey: ["inbox"] }))
        .catch(() => null);
    }, 400);
  };

  return (
    <div className="flex h-full">
      {/* Left pane: list */}
      <div className="hairline-r flex w-[380px] shrink-0 flex-col bg-card">
        <div className="hairline-b flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <InboxIcon className="size-4 text-brand" strokeWidth={1.75} />
            <div>
              <div className="text-[13px] font-semibold">Inbox</div>
              <div className="text-[11px] text-muted-foreground">
                hello@brantatech.com
              </div>
            </div>
          </div>
          <button
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
            className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw
              className={cn("size-3.5", syncMut.isPending && "animate-spin")}
            />
          </button>
        </div>
        <div className="hairline-b flex flex-wrap gap-1 px-3 py-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-sm px-2 py-0.5 text-[11px] font-medium",
                filter === f.key
                  ? "bg-brand-50 text-brand"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {listQ.isLoading && (
            <div className="grid place-items-center p-8 text-[12px] text-muted-foreground">
              <Loader2 className="mb-2 size-4 animate-spin" />
              Loading…
            </div>
          )}
          {!listQ.isLoading && threads.length === 0 && (
            <div className="grid place-items-center p-10 text-center text-[12px] text-muted-foreground">
              <Mail className="mb-2 size-6 opacity-50" />
              No messages yet. Click refresh to sync from Gmail.
            </div>
          )}
          {threads.map(({ latest, unread, count }) => {
            const active = selectedThread === latest.gmail_thread_id;
            return (
              <button
                key={latest.gmail_thread_id}
                onClick={() => handleSelect(latest.gmail_thread_id)}
                className={cn(
                  "hairline-b block w-full border-b px-4 py-3 text-left transition-colors",
                  active
                    ? "bg-brand-50"
                    : unread > 0
                      ? "bg-white hover:bg-muted/50"
                      : "bg-muted/20 hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12.5px]",
                      unread > 0
                        ? "font-semibold text-foreground"
                        : "font-medium text-foreground/80",
                    )}
                  >
                    {latest.from_name || latest.from_email}
                  </div>
                  <div className="shrink-0 text-[10.5px] text-muted-foreground">
                    {formatTime(latest.received_at)}
                  </div>
                </div>
                <div
                  className={cn(
                    "mt-0.5 truncate text-[12px]",
                    unread > 0 ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {latest.subject || "(no subject)"}
                  {count > 1 && (
                    <span className="ml-1 text-[10.5px] text-muted-foreground">
                      ({count})
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {latest.snippet}
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  {latest.lead_slug ? (
                    <Link
                      to="/app/leads/$slug"
                      params={{ slug: latest.lead_slug }}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-sm bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand hover:underline"
                    >
                      <LinkIcon className="size-2.5" />
                      {latest.lead_slug}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Unlinked
                    </span>
                  )}
                  {unread > 0 && (
                    <span className="inline-flex items-center rounded-sm bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right pane: thread */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-background">
        {selectedThread ? (
          <ThreadView threadId={selectedThread} />
        ) : (
          <div className="grid h-full place-items-center text-center text-[12.5px] text-muted-foreground">
            <div>
              <Mail className="mx-auto mb-3 size-8 opacity-40" />
              Select a message to read
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadView({ threadId }: { threadId: string }) {
  const getFn = useServerFn(getInboxThread);
  const replyFn = useServerFn(sendInboxReply);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["inbox", "thread", threadId],
    queryFn: () => getFn({ data: { threadId } }),
    staleTime: 10_000,
  });

  const [replyOpen, setReplyOpen] = useState(false);
  const [provider, setProvider] = useState<"resend" | "brevo">("resend");
  const [replyBody, setReplyBody] = useState("");

  const replyMut = useMutation({
    mutationFn: (payload: {
      to: string[];
      subject: string;
      inReplyTo: string | null;
      references: string | null;
      leadId: string | null;
    }) =>
      replyFn({
        data: {
          threadId,
          to: payload.to,
          cc: [],
          subject: payload.subject,
          body: replyBody,
          contentType: "text",
          provider,
          inReplyTo: payload.inReplyTo,
          references: payload.references,
          leadId: payload.leadId,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Reply sent via ${r.provider}`);
      setReplyBody("");
      setReplyOpen(false);
      // Give Gmail a moment, then re-sync.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["inbox"] }), 2000);
    },
    onError: (e: Error) => {
      if (provider === "resend") {
        // Auto-retry with Brevo on Resend failure.
        toast.error(`Resend failed: ${e.message}. Retrying via Brevo…`);
        setProvider("brevo");
      } else {
        toast.error(e.message);
      }
    },
  });

  if (q.isLoading)
    return (
      <div className="grid place-items-center p-16 text-[12.5px] text-muted-foreground">
        <Loader2 className="mb-2 size-5 animate-spin" />
        Loading thread…
      </div>
    );
  if (q.isError || !q.data)
    return (
      <div className="p-10 text-center text-[12.5px] text-muted-foreground">
        <AlertTriangle className="mx-auto mb-2 size-5 text-brand" />
        Failed to load thread.
        {q.error instanceof Error && (
          <div className="mx-auto mt-2 max-w-xl text-[11.5px] text-muted-foreground">
            {q.error.message}
          </div>
        )}
      </div>
    );

  const thread = q.data;
  const last = thread.messages[thread.messages.length - 1];
  const replyTo = last ? [last.from_email] : [];
  const replySubject = last?.subject
    ? last.subject.startsWith("Re:")
      ? last.subject
      : `Re: ${last.subject}`
    : "Re:";

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-[16px] font-semibold text-foreground">
            {thread.subject || "(no subject)"}
          </h1>
          {thread.lead_slug ? (
            <Link
              to="/app/leads/$slug"
              params={{ slug: thread.lead_slug }}
              className="inline-flex items-center gap-1 rounded-sm bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand hover:underline"
            >
              <ExternalLink className="size-3" />
              {thread.lead_slug} · {thread.lead_name}
            </Link>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Not linked to any lead
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {thread.messages.length} message
          {thread.messages.length !== 1 && "s"}
        </div>
        {thread.warning && (
          <div className="mt-3 flex items-start gap-2 rounded-sm border border-brand/20 bg-brand-50 px-3 py-2 text-[11.5px] font-medium text-brand">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{thread.warning}</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {thread.messages.map((m) => (
          <MessageCard key={m.id} m={m} />
        ))}
      </div>

      {/* Reply composer */}
      <div className="mt-6">
        {!replyOpen ? (
          <button
            onClick={() => setReplyOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-sm bg-brand px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-brand/90"
          >
            <Send className="size-3.5" />
            Reply
          </button>
        ) : (
          <div className="hairline rounded-sm bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11.5px] text-muted-foreground">
                To: <span className="font-medium text-foreground">{replyTo.join(", ")}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">Send via</span>
                <button
                  onClick={() => setProvider("resend")}
                  className={cn(
                    "rounded-sm px-2 py-0.5 text-[11px] font-semibold",
                    provider === "resend"
                      ? "bg-brand text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  Resend
                </button>
                <button
                  onClick={() => setProvider("brevo")}
                  className={cn(
                    "rounded-sm px-2 py-0.5 text-[11px] font-semibold",
                    provider === "brevo"
                      ? "bg-brand text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  Brevo
                </button>
              </div>
            </div>
            <div className="mb-2 text-[11.5px] text-muted-foreground">
              Subject: <span className="font-medium text-foreground">{replySubject}</span>
            </div>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={8}
              placeholder="Write your reply…"
              className="hairline w-full resize-y rounded-sm bg-background px-3 py-2 text-[13px] outline-none focus:border-brand"
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setReplyOpen(false);
                  setReplyBody("");
                }}
                className="rounded-sm px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  replyMut.mutate({
                    to: replyTo,
                    subject: replySubject,
                    inReplyTo: last?.message_id_header ?? null,
                    references: last?.references ?? last?.message_id_header ?? null,
                    leadId: thread.lead_id,
                  })
                }
                disabled={!replyBody.trim() || replyMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-sm bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {replyMut.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageCard({
  m,
}: {
  m: import("@/lib/inbox.functions").InboxThreadMessage;
}) {
  const [expanded, setExpanded] = useState(true);
  const safeHtml = useMemo(() => {
    if (!m.html) return null;
    return DOMPurify.sanitize(m.html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "style"],
    });
  }, [m.html]);

  return (
    <div className="hairline rounded-sm bg-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="hairline-b flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold">
            {m.from_name || m.from_email}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              &lt;{m.from_email}&gt;
            </span>
          </div>
          {!expanded && (
            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {m.snippet}
            </div>
          )}
        </div>
        <div className="shrink-0 pl-3 text-[11px] text-muted-foreground">
          {new Date(m.date).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-3">
          {safeHtml ? (
            <div
              className="prose prose-sm max-w-none text-[13px]"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-[13px] text-foreground">
              {m.text || m.snippet || "(empty)"}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
