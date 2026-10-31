// Turns raw WebAuthn/browser errors into clear, human messages.
export function passkeyErrorMessage(err: unknown, action: "signin" | "verify" | "add" = "signin"): string {
  const e = err as { name?: string; code?: string; message?: string; cause?: { name?: string } };
  const name = e?.cause?.name || e?.name || "";
  const code = e?.code || "";
  const msg = e?.message || "";

  if (name === "NotAllowedError" || /timed out or was not allowed/i.test(msg)) {
    if (action === "add") return "Passkey setup was cancelled or timed out. Try again and complete the prompt.";
    return "No passkey was used — the prompt was closed, timed out, or no saved Branta passkey was found on this device. Try again, or use another method.";
  }
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || name === "InvalidStateError")
    return "This device already has a passkey for your account.";
  if (code === "ERROR_CEREMONY_ABORTED" || name === "AbortError") return "Passkey request was cancelled.";
  if (code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID" || name === "SecurityError")
    return "Passkeys don't work on this address. Open console.brantatech.com and try again.";
  if (name === "NotSupportedError" || /not supported/i.test(msg))
    return "This browser or device doesn't support passkeys.";
  if (code === "ERROR_AUTHENTICATOR_GENERAL_ERROR" || name === "UnknownError")
    return "Your device couldn't use the passkey. Try again or use another method.";
  if (/network|fetch/i.test(msg)) return "Connection problem. Check your internet and try again.";
  if (msg && !/w3\.org|webauthn/i.test(msg)) return msg; // server errors are already readable
  return action === "add" ? "Could not add the passkey. Try again." : "Passkey check failed. Try again.";
}
