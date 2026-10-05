-- El reporte debe conservar el corte exacto para no omitir cambios entre envíos.
alter table public.propiedades_reportes add column if not exists periodo_desde timestamptz;
alter table public.propiedades_reportes add column if not exists periodo_hasta timestamptz;
alter table public.propiedades_reportes add column if not exists modificadas integer not null default 0;
notify pgrst,'reload schema';
