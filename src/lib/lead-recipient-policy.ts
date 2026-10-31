type LeadContactEmails = { email: string | null; alt_email: string | null };

/** Only addresses stored on this lead or its contacts belong in its allow-list. */
export function leadRecipientEmails(
  leadAltEmail: string | null,
  contacts: readonly LeadContactEmails[],
): Set<string> {
  const emails = [leadAltEmail, ...contacts.flatMap((c) => [c.email, c.alt_email])];
  return new Set(
    emails.flatMap((email) => {
      const normalized = email?.trim().toLowerCase();
      return normalized ? [normalized] : [];
    }),
  );
}