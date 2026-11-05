import { createFileRoute } from "@tanstack/react-router";
import { EmployeesPage } from "./app.employees.index";

export const Route = createFileRoute("/_authenticated/app/org/$org/employees/")({
  head: () => ({
    meta: [
      { title: "Company Employees · Branta Console" },
      { name: "description", content: "Employees switched on for this company workspace." },
      { property: "og:title", content: "Company Employees · Branta Console" },
      { property: "og:description", content: "Employees switched on for this company workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgEmployees,
});

function OrgEmployees() {
  const { org } = Route.useParams();
  return <EmployeesPage key={org} companySlug={org} />;
}
