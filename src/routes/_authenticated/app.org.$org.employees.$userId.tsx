import { createFileRoute } from "@tanstack/react-router";
import { EmployeeDetailBySegment } from "./app.employees.$userId";

export const Route = createFileRoute("/_authenticated/app/org/$org/employees/$userId")({
  head: () => ({
    meta: [
      { title: "Company Employee Profile · Branta Console" },
      { name: "description", content: "Employee profile inside this company workspace." },
      { property: "og:title", content: "Company Employee Profile · Branta Console" },
      { property: "og:description", content: "Employee profile inside this company workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgEmployeeDetail,
});

function OrgEmployeeDetail() {
  const { org, userId } = Route.useParams();
  return <EmployeeDetailBySegment key={org + userId} segment={userId} />;
}
