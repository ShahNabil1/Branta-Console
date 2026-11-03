import { ToolError } from "@lovable.dev/mcp-js";

export function assertAgentClaims(claims: Record<string, unknown>) {
  if (typeof claims.sub !== "string" || typeof claims.client_id !== "string" || !claims.client_id) throw new ToolError("Sign in through the OAuth connection dialog.");
  if (typeof claims.email !== "string" || !claims.email.endsWith("@brantatech.com")) throw new ToolError("A Branta employee account is required.");
  if (claims.aal !== "aal2") throw new ToolError("Complete two-factor verification before connecting.");
}

export function assertAgentEmployee(active: boolean, mustChangePassword: boolean, resetPending: boolean) {
  if (!active) throw new ToolError("This employee account is inactive.");
  if (mustChangePassword || resetPending) throw new ToolError("Complete your required password change in Branta Hub first.");
}