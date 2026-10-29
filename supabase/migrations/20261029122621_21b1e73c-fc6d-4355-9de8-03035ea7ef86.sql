ALTER TABLE public.connected_apps DROP CONSTRAINT connected_apps_app_check;
ALTER TABLE public.connected_apps ADD CONSTRAINT connected_apps_app_check CHECK (app IN ('tracker_extension', 'admakai'));