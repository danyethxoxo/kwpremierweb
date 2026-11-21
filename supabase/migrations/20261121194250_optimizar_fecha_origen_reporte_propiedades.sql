-- Evita descomprimir y ordenar todo el JSON de origen al preparar cada reporte.
create index if not exists propiedades_fuente_estatus_fecha_origen_idx
on public.propiedades (fuente, estatus, ((datos_origen -> 'listado') ->> 'Property_Status_Updated_Date') desc nulls last);
