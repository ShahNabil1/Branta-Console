// Client-side helpers for admin impersonation.
// Session backup lives in sessionStorage — it survives reloads within the
// tab but never crosses tabs, matching the "impersonate for a moment"
// mental model.
export const IMP_BACKUP_KEY = "branta:imp:backup";
export const IMP_ACTIVE_KEY = "branta:imp:active";

export interface ImpersonationBackup {
  access_token: string;
  refresh_token: string;
  admin_user_id: string;
  admin_email: string;
  target_user_id: string;
  target_email: string;
  started_at: number;
}

export const isImpersonating = (): boolean => {
  try {
    return typeof window !== "undefined"
      ? sessionStorage.getItem(IMP_ACTIVE_KEY) === "1"
      : false;
  } catch {
    return false;
  }
};

export const readBackup = (): ImpersonationBackup | null => {
  try {
    const raw = sessionStorage.getItem(IMP_BACKUP_KEY);
    return raw ? (JSON.parse(raw) as ImpersonationBackup) : null;
  } catch {
    return null;
  }
};

export const writeBackup = (b: ImpersonationBackup) => {
  sessionStorage.setItem(IMP_BACKUP_KEY, JSON.stringify(b));
  sessionStorage.setItem(IMP_ACTIVE_KEY, "1");
};

export const clearBackup = () => {
  sessionStorage.removeItem(IMP_BACKUP_KEY);
  sessionStorage.removeItem(IMP_ACTIVE_KEY);
};
