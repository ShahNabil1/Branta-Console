# Today’s Operations Dashboard

## Goal
একটি management-only global page যোগ হবে, যেখানে Dhaka time অনুযায়ী আজকের client work, assigned tasks, team progress, review queue, revisions এবং completions এক জায়গায় দেখা যাবে। Existing task, update, submission ও tracking flow অপরিবর্তিত থাকবে।

## Page and access
- নতুন route: `/app/operations` এবং Workspace menu-তে **Today’s Operations**।
- শুধু `super_admin`, `admin`, ও `manager` role পেজ এবং server data access পাবে; অন্যদের menu-তে দেখাবে না এবং direct URL-ও blocked থাকবে।
- Route-specific title, description, Open Graph, এবং Twitter metadata থাকবে।

## Dashboard layout
- Header: **Today’s Operations**, Dhaka date, last refreshed time, manual refresh action।
- Summary tiles:
  - Active Clients
  - Tasks Assigned Today
  - Work Completed Today
  - Awaiting Review
  - Revision Required
  - Completed Tasks Today
- Quick filters: All, In Progress, Awaiting Review, Revision Required, Completed; সঙ্গে Client ও Team Member filter এবং task search।
- Main work list client অনুযায়ী grouped হবে। প্রতিটি task row/card-এ থাকবে:
  - Client এবং project/job name
  - Task title, current status, priority, due date
  - Assigned team avatars, names ও responsibilities
  - Completed quantity / total output এবং progress bar
  - Latest work update বা submission time
- Task চাপলে existing task detail sheet খুলবে, তাই Tracking, Updates, Submission, Team ও Details একই জায়গা থেকে দেখা ও management action নেওয়া যাবে।
- Phone-এ stacked cards ও sticky filters; tablet/desktop-এ dense grouped rows; wide screen-এ bounded readable layout। Empty, loading, denied ও error states স্পষ্ট থাকবে।

## “Today” rules
- Dhaka calendar day (`00:00–23:59 Asia/Dhaka`) ব্যবহার হবে।
- Dashboard work list-এ থাকবে non-archived task যেগুলো আজ created/assigned/updated/submitted/completed হয়েছে, অথবা এখনো active এবং আজ due।
- **Tasks Assigned Today:** আজ নতুন team assignment তৈরি হয়েছে।
- **Work Completed Today:** আজ team members-এর reported completed quantity (`items_done`)।
- **Awaiting Review:** current task status `review` বা latest submission `submitted`।
- **Revision Required:** current task status `revision_requested` বা latest submission revision requested/rejected।
- **Completed Tasks Today:** আজ tracking event দিয়ে `completed` হয়েছে।
- একই task একাধিক activity থাকলেও task/client count duplicate হবে না।

## Data and implementation
- নতুন authenticated server function current user-এর management role verify করে task, customer, project, assignee, today’s events, updates এবং submissions একত্র করে sanitized dashboard result দেবে। Finance values এই response-এ থাকবে না।
- Existing `ClientTask`/task detail UI reuse করা হবে; task detail component প্রয়োজনমতো export করা হবে।
- React Query cache + existing Supabase realtime events দিয়ে updates, submissions, assignments ও task events বদলালে dashboard refresh হবে।
- Existing database tables যথেষ্ট; migration বা current task-writing flow পরিবর্তন প্রয়োজন নেই।

## Verification
- Role access এবং direct URL denial যাচাই।
- Summary counts, filters, search, client grouping, task detail opening এবং refresh behavior যাচাই।
- Phone, tablet এবং desktop viewport-এ overflow/scroll/layout পরীক্ষা।
- Build diagnostics এবং page runtime errors clean নিশ্চিত করা।
