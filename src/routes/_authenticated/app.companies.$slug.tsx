import { createFileRoute } from "@tanstack/react-router";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { CompanyProfile } from "@/components/pages/company-profile-page";

export const Route = createFileRoute("/_authenticated/app/companies/$slug")({
  head: () => ({
    meta: [
      { title: "Company profile · Branta Tech Group" },
      { name: "description", content: "Company profile, identity, contact, address and leadership." },
      { property: "og:title", content: "Company profile · Branta Tech Group" },
      { property: "og:description", content: "Company profile, identity, contact, address and leadership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CompanyRoute,
});

function CompanyRoute() {
  const { slug } = Route.useParams();
  return (
    <RequireSuperAdmin>
      <CompanyProfile slug={slug} />
    </RequireSuperAdmin>
  );
}
