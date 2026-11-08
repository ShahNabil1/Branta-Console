ALTER TABLE public.company_task_assets ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'asset';
ALTER TABLE public.company_task_assets DROP CONSTRAINT IF EXISTS company_task_assets_kind_check;
ALTER TABLE public.company_task_assets ADD CONSTRAINT company_task_assets_kind_check CHECK (kind IN ('asset', 'reference'));