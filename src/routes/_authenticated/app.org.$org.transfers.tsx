import { createFileRoute } from "@tanstack/react-router";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { TransfersPage } from "./app.transfers";

export const Route = createFileRoute("/_authenticated/app/org/$org/transfers")({
  head: () => ({
    meta: [
      { title: "Company Transfers · Branta Console" },
      { name: "description", content: "Lead transfer requests between this company's employees." },
      { property: "og:title", content: "Company Transfers · Branta Console" },
      { property: "og:description", content: "Lead transfer requests between this company's employees." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgTransfers,
});

function OrgTransfers() {
  const { org } = Route.useParams();
  return <RequireSuperAdmin><TransfersPage key={org} companySlug={org} /></RequireSuperAdmin>;
}
