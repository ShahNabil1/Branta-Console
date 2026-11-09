# Branta Hub

Act as a Senior Enterprise Frontend Architect and Expert UI/UX Designer. We are building a fully internal, highly secure ERP & CRM system for "Branta Tech". 

The tech stack includes React, Tailwind CSS, Supabase (Auth, Database, Realtime, Storage), and external APIs (Resend, Gmail, Google Calendar). 

CRITICAL UI/UX REQUIREMENT (NO "AI-VIBE" DESIGN):
Strictly avoid the generic "AI-generated app" look (e.g., overused default Shadcn components with excessive padding, generic rounded corners, and empty white spaces). We need a highly professional, data-dense, "human-crafted" enterprise application vibe similar to Linear, Stripe, or Vercel dashboards. 
- Use sophisticated, custom-styled UI components. 
- Typography: Use a premium sans-serif font like 'Inter' or 'Plus Jakarta Sans'. Ensure crisp font rendering, varied font weights for hierarchy, and tight tracking for data tables.
- Color Palette: The brand's primary color is a Vibrant Orange (derive from the Branta Tech logo). Use this orange for primary actions, active states, and accents. Backgrounds should be subtle cool grays (e.g., #F9FAFB) with crisp white panels. Use subtle, refined drop shadows (not blurry default ones) and 1px borders (#E5E7EB) to separate data sections.
- Layout: Implement a collapsible sidebar, a top navigation bar with a Command Palette (Cmd+K), and breadcrumb navigation.

SYSTEM MODULES & ARCHITECTURE:

1. STRICT AUTHENTICATION (Supabase):
- Build a custom, premium Login screen. NO "Sign Up" option.
- Form validation: Strictly allow ONLY "@brantatech.com" domains. Show strict inline error if otherwise.
- Auth Flow: Email + Password login. Must include a Passkey (WebAuthn) login alternative.
- Post-Login 2FA Enforcement: Immediately redirect to a forced 2FA setup/verify screen. If canceled, trigger `supabase.auth.signOut()`. 
- Session Management: Add an invisible idle timer (30 mins inactivity = auto logout).

2. DASHBOARD & LEADS MANAGEMENT:
- Leads Page: Build a high-density Data Grid (not just bulky cards) to list leads from Google Sheets. Include sortable columns, status badges (New, Contacted, Viewed, Meeting Scheduled, Converted), and a robust filter bar.
- Lead Detail View: Clicking a lead opens a sophisticated "Right Drawer" (Side Panel) or a dedicated nested route.
- Inside Lead View:
  * Top header with Lead Name, Company, and quick action buttons (Send Email, Schedule Meeting, Edit Status).
  * 3-Column Layout: Left (Contact details & assigned employee), Middle (Activity Timeline/Audit Log showing precise timestamps and user avatars), Right (Private internal notes section).

3. COMMUNICATION & EMAIL MODULE (Resend + Gmail):
- Build a "Rich Text Email Composer" within the Lead view.
- Template System: Include a dropdown to select predefined templates. 
- Dynamic Variables: Add a button/menu to insert tags like {{company_name}}, {{contact_person}}, {{employee_name}}. 
- Attachments: UI for drag-and-drop file/image/video uploads.
- Thread View: Design an email thread UI (similar to modern Gmail/Front app) to display routed replies from brantatech@gmail.com clearly tagged with the assigned employee.

4. CALENDAR & SCHEDULING:
- "Schedule Meeting" modal that integrates Google Calendar. Fields for Date, Time, Meet Link generation, and auto-sending invite via Resend.

5. EMPLOYEE PROFILE & SETTINGS:
- Profile page UI allowing Avatar upload, Legal Name, NID upload, CV upload, and Bank/MFS details. 
- Read-only field for the official Branta Tech email.
- Device & Session Management UI: A list showing active sessions (Device name, IP address, Geolocation) with a red "Revoke Access" button that triggers real-time sign-out for that specific device.

Build the UI components first with mocked data to establish the design language. Ensure the routing and layouts are modular and scalable for future modules like Finance and Project Management.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://branta-nexus.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0b934a6f-9f9d-47f8-b76c-960a68b43f5a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
