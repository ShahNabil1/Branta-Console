import { createFileRoute } from "@tanstack/react-router";
import { RecycleBinPage } from "@/components/pages/finance-recycle-bin-page";

export const Route = createFileRoute("/_authenticated/app/finance/recycle-bin")({
  head: () => ({
    meta: [
      { title: "Recycle Bin · Finance · Branta" },
      { name: "description", content: "Recently deleted expense vouchers — recover within 30 days." },
      { property: "og:title", content: "Recycle Bin · Finance · Branta" },
      { property: "og:description", content: "Recently deleted expense vouchers — recover within 30 days." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecycleBinPage,
});
