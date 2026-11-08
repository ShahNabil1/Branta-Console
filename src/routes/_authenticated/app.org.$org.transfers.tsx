import { createFileRoute } from "@tanstack/react-router";
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
  // Access is checked by TransfersPage (and again on the server) so a sister
  // company's C.E.O/C.O.O is not bounced by the global-role-only gate.
  return <TransfersPage key={org} companySlug={org} />;
}
