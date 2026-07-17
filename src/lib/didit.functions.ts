/**
 * Didit KYC session server functions.
 *
 * `createDiditSession` creates a Didit verification session for the current
 * signed-in user via POST /v3/session/ and returns the hosted `verification_url`
 * the client can open. The Didit session id is persisted on the user's
 * profile so the webhook can correlate incoming events.
 *
 * Env: DIDIT_API_KEY, DIDIT_WORKFLOW_ID
 * Docs: https://docs.didit.me/sessions-api/create-session
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DIDIT_BASE = "https://verification.didit.me";

export const createDiditSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const apiKey = process.env.DIDIT_API_KEY;
    const workflowId = process.env.DIDIT_WORKFLOW_ID;
    if (!apiKey || !workflowId) {
      throw new Error("Didit is not configured (DIDIT_API_KEY / DIDIT_WORKFLOW_ID missing)");
    }

    const callbackUrl = "https://console.brantatech.com/app/profile?kyc=success";

    const res = await fetch(`${DIDIT_BASE}/v3/session/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: context.userId,
        callback: callbackUrl,
        metadata: { app: "branta-console", user_id: context.userId },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Didit session create failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as {
      session_id?: string;
      url?: string;
      verification_url?: string;
    };

    const sessionId = json.session_id ?? null;
    const url = json.url ?? json.verification_url ?? null;
    if (!sessionId || !url) {
      throw new Error("Didit response missing session_id or url");
    }

    // Persist the session id + flip status to under_review immediately.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({
        didit_session_id: sessionId,
        kyc_status: "under_review",
        kyc_submitted_at: now,
        kyc_rejection_reason: null,
        updated_at: now,
      } as any)
      .eq("user_id", context.userId);

    return { sessionId, url };
  });
