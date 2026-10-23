-- Dos lecturas: 00:00 y 12:00 en America/Mexico_City, 06:00 y 18:00 UTC.
-- Los reintentos comprueban el mismo periodo y no repiten una lectura completada.
select cron.alter_job(jobid, active := false)
from cron.job where jobname = 'kw-inventario-diario-3am';
select cron.schedule(
  'kw-inventario-medianoche-mediodia',
  '0,10,20,30,40,50 6,18 * * *',
  'select private.propiedades_inventario_diario()'
);
