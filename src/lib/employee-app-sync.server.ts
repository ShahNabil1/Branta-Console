import { syncTrackerEmployeeSafe } from "./tracker.server";
import { syncAdmakaiEmployeeSafe } from "./admakai.server";

/** Independent mirrors: failure in one connected app never prevents the other sync. */
export async function syncEmployeeAppsSafe(userId: string): Promise<void> {
  await Promise.all([syncTrackerEmployeeSafe(userId), syncAdmakaiEmployeeSafe(userId)]);
}