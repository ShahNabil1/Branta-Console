export type LeadStatus =
  | "new"
  | "contacted"
  | "viewed"
  | "meeting"
  | "converted";

export type Lead = {
  id: string;
  name: string;
  company: string;
  status: LeadStatus;
  ownerName: string;
  ownerInitials: string;
  lastActivity: string; // relative
  nextAction: string;
};

export const LEADS: Lead[] = [
  {
    id: "L-4821",
    name: "Sarah Jenkins",
    company: "Metatech Solutions",
    status: "new",
    ownerName: "Marcus C.",
    ownerInitials: "MC",
    lastActivity: "2h ago",
    nextAction: "Call",
  },
  {
    id: "L-4820",
    name: "Robert D'Angelo",
    company: "Vortex Industries",
    status: "meeting",
    ownerName: "Anna L.",
    ownerInitials: "AL",
    lastActivity: "5h ago",
    nextAction: "Prep deck",
  },
  {
    id: "L-4819",
    name: "Elena Rodriguez",
    company: "Lumina Research",
    status: "converted",
    ownerName: "Marcus C.",
    ownerInitials: "MC",
    lastActivity: "1d ago",
    nextAction: "Onboard",
  },
  {
    id: "L-4818",
    name: "David Kwong",
    company: "Cloudscale Systems",
    status: "contacted",
    ownerName: "Jordan K.",
    ownerInitials: "JK",
    lastActivity: "3d ago",
    nextAction: "Follow up",
  },
  {
    id: "L-4817",
    name: "Priya Ramanathan",
    company: "Northwind Labs",
    status: "viewed",
    ownerName: "Anna L.",
    ownerInitials: "AL",
    lastActivity: "3d ago",
    nextAction: "Send brief",
  },
  {
    id: "L-4816",
    name: "Thomas Okafor",
    company: "Halcyon Freight",
    status: "new",
    ownerName: "Jordan K.",
    ownerInitials: "JK",
    lastActivity: "4d ago",
    nextAction: "Qualify",
  },
];

export const KPIS = [
  { label: "Open Leads", value: "1,284", delta: "+12%", positive: true },
  { label: "Meetings This Week", value: "42", delta: "-2", positive: false },
  { label: "Reply Rate", value: "18.4%", delta: "+0.8", positive: true },
  { label: "Converted MTD", value: "89", delta: "TARGET", positive: null },
];

export const ACTIVITY = [
  {
    id: "a1",
    dot: "brand" as const,
    body: "Marcus C. moved Sarah Jenkins to New",
    meta: "2 hours ago · Automated Import",
  },
  {
    id: "a2",
    dot: "converted" as const,
    body: "Anna L. completed discovery with Robert D'Angelo",
    meta: "5 hours ago · CRM Sync",
  },
  {
    id: "a3",
    dot: "muted" as const,
    body: "System notification: Monthly lead report generated",
    meta: "Yesterday at 09:00 · Reporting Engine",
  },
  {
    id: "a4",
    dot: "converted" as const,
    body: "Elena Rodriguez marked Converted by Marcus C.",
    meta: "1 day ago · Manual",
  },
];
