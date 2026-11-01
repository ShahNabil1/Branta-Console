// Step-by-step employee offboarding. Each step is a separate call so the UI shows real progress.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const [su, ad] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (su.error || ad.error) throw new Error(su.error?.message ?? ad.error?.message ?? "Role check failed");
  if (!su.data && !ad.data) throw new Error("Forbidden: admin role required");
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function target(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: u }, { data: p }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from("profiles").select("full_name, employee_code, personal_gmail, deactivated_at").eq("user_id", userId).maybeSingle(),
  ]);
  return { admin: supabaseAdmin, email: u?.user?.email?.toLowerCase() ?? null, profile: p };
}

export type Blocker = { label: string; count: number; refs: string[] };

export const offboardPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't remove your own account.");
    const { admin, email, profile } = await target(data.userId);
    if (!email) throw new Error("This employee's login account no longer exists.");
    const sb = context.supabase as never as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message: string } | null }> };
    const { data: blk, error } = await sb.rpc("employee_delete_blockers", { _user_id: data.userId });
    if (error) throw dbError(error);
    const counts = (blk ?? {}) as Record<string, number>;
    const id = data.userId;
    // Real identifiers so admins see exactly which records keep this person in history.
    const refsFor: Record<string, () => Promise<string[]>> = {
      "Invoices created": async () => ((await admin.from("invoices").select("slug,title").eq("created_by", id).limit(8)).data ?? []).map((r) => r.slug || r.title),
      Expenses: async () => ((await admin.from("expenses").select("voucher_no,vendor").or(`requested_by.eq.${id},created_by.eq.${id},paid_by.eq.${id}`).limit(8)).data ?? []).map((r) => r.voucher_no || r.vendor || "Expense"),
      "Salary slips": async () => ((await admin.from("salary_slips").select("slip_no,period_month").or(`user_id.eq.${id},created_by.eq.${id}`).limit(8)).data ?? []).map((r) => r.slip_no || String(r.period_month)),
      "Projects created": async () => ((await admin.from("client_projects").select("title").eq("created_by", id).limit(8)).data ?? []).map((r) => r.title),
      Leads: async () => ((await admin.from("leads").select("lead_code,name").or(`owner_id.eq.${id},created_by.eq.${id}`).limit(8)).data ?? []).map((r) => r.lead_code || r.name),
      Customers: async () => ((await admin.from("customers").select("customer_code,name").or(`owner_id.eq.${id},created_by.eq.${id}`).limit(8)).data ?? []).map((r) => r.customer_code || r.name),
    };
    const blockers: Blocker[] = await Promise.all(
      Object.entries(counts).map(async ([label, count]) => ({
        label, count, refs: refsFor[label] ? await refsFor[label]().catch(() => []) : [],
      })),
    );
    const { cloudflareConfigured } = await import("@/lib/cloudflare-email.server");
    return {
      name: profile?.full_name ?? email, brantaId: profile?.employee_code ?? null, email,
      gmail: profile?.personal_gmail?.toLowerCase() ?? null,
      alreadyDeactivated: !!profile?.deactivated_at,
      canHardDelete: blockers.length === 0, blockers, cloudflare: cloudflareConfigured(),
    };
  });

export type StepResult = { status: "done" | "already" | "skipped" | "failed"; detail: string };
const STEPS = ["routing", "destination", "sessions", "account", "apps"] as const;

export const offboardStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid(), step: z.enum(STEPS) }).parse(i))
  .handler(async ({ data, context }): Promise<StepResult & { result?: "deleted" | "deactivated" }> => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You can't remove your own account.");
    const { admin, email, profile } = await target(data.userId);
    const cf = await import("@/lib/cloudflare-email.server");
    try {
      switch (data.step) {
        case "routing": {
          if (!email) return { status: "skipped", detail: "No work email on record." };
          if (!cf.cloudflareConfigured()) return { status: "skipped", detail: "Cloudflare Email Routing is not configured." };
          const n = await cf.deleteRulesFor(email);
          return n ? { status: "done", detail: `Removed ${n} routing rule${n > 1 ? "s" : ""} for ${email}.` }
            : { status: "already", detail: `No routing rule for ${email} existed in Cloudflare — already removed, nothing to delete.` };
        }
        case "destination": {
          const gmail = profile?.personal_gmail?.toLowerCase();
          if (!gmail) return { status: "skipped", detail: "No personal Gmail destination on record." };
          if (!cf.cloudflareConfigured()) return { status: "skipped", detail: "Cloudflare Email Routing is not configured." };
          const others = (await cf.forwardSourcesFor(gmail)).filter((s) => s !== email);
          if (others.length) return { status: "skipped", detail: `Kept ${gmail}: still receives mail for ${others.join(", ")}.` };
          return (await cf.deleteDestination(gmail))
            ? { status: "done", detail: `Removed destination ${gmail}.` }
            : { status: "already", detail: `${gmail} was not in Cloudflare — already removed, nothing to delete.` };
        }
        case "sessions": {
          if (!email) return { status: "already", detail: "Login account no longer exists." };
          const { error } = await admin.auth.admin.updateUserById(data.userId, { ban_duration: "876000h" });
          if (error) throw new Error(`Supabase Auth refused to block sign-in: ${error.message}`);
          // A banned user can no longer refresh tokens, so every device session ends at its next refresh.
          await admin.from("passkey_sessions" as never).delete().eq("user_id" as never, data.userId as never).then(() => null, () => null);
          return { status: "done", detail: "Sign-in blocked on every device; existing sessions can no longer refresh." };
        }
        case "account": {
          const sb = context.supabase as never as { rpc: (f: string, a: object) => Promise<{ data: unknown; error: { message: string; code?: string } | null }> };
          const { data: blk, error: bErr } = await sb.rpc("employee_delete_blockers", { _user_id: data.userId });
          if (bErr) throw dbError(bErr);
          if (Object.keys((blk ?? {}) as object).length === 0) {
            const { error } = await admin.auth.admin.deleteUser(data.userId);
            if (!error) return { status: "done", detail: "Account and profile permanently deleted (no business history).", result: "deleted" };
          }
          if (profile?.deactivated_at) return { status: "already", detail: "Already deactivated — history kept for audit.", result: "deactivated" };
          const { error } = await sb.rpc("deactivate_employee", { _user_id: data.userId, _reason: "Removed from employee directory" });
          if (error) throw dbError(error);
          return { status: "done", detail: "Deactivated: roles and access removed; all records kept for audit.", result: "deactivated" };
        }
        case "apps": {
          const { syncEmployeeAppsSafe } = await import("@/lib/employee-app-sync.server");
          await syncEmployeeAppsSafe(data.userId);
          return { status: "done", detail: "Branta Tracker and Admakai access revoked." };
        }
      }
    } catch (e) {
      return { status: "failed", detail: msg(e) };
    }
  });
