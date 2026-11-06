import { createFileRoute } from "@tanstack/react-router";
import { MyCompanyPage } from "@/components/pages/my-company-page";

export const Route = createFileRoute("/_authenticated/app/my-company")({
  head: () => ({ meta: [{ title: "My Company · Branta Console" }, { name: "description", content: "Manage your own company's profile, integrations and settings." }, { property: "og:title", content: "My Company · Branta Console" }, { property: "og:description", content: "Manage your own company's profile, integrations and settings." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <MyCompanyPage />,
});
