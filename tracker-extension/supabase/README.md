# Tracker database

Apply `migrations/20261026_init_tracker_schema.sql` to a fresh Supabase project using the SQL Editor, or use `supabase db push` after configuring and linking the Supabase CLI to the intended project. The migration is transactional and intentionally fails if the tables already exist.

All six tables use RLS. Authenticated users can select, insert, and update their own records; no delete policy is provided. Activity log ownership is resolved through its shift. Breaks and screenshots must reference a shift owned by the same employee. Unique constraints already index profile and settings identities; additional indexes cover employee IDs, shift IDs, and shift dates.

`updated_at` is maintained automatically on profiles, employee settings, and shifts. Date defaults follow the database session timezone; choose the business date explicitly when using Asia/Dhaka attendance dates.

The requested permissions let employees edit their own settings (including pay rates and screenshot controls), profile fields, and recorded totals. Before using these fields for payroll or administrative enforcement, implement trusted server-side writes and restrict employee column privileges as a separate authorization change.

Screenshot paths are R2 object keys, not public URLs. This migration does not provision R2, upload assets, or authorize access to objects. Keep the bucket private and implement authorized upload/download endpoints separately. Activity logs store counts only, never captured key text.
