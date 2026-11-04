import { z } from "zod";

// Historical print rows remain readable, but new print events are retired.
export const expenseReadActionSchema = z.enum([
  "voucher_viewed",
  "voucher_downloaded",
  "receipt_viewed",
  "receipt_downloaded",
]);