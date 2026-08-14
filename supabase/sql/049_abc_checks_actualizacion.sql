-- Fase 49: actualiza los checks de 5 asesores contra la hoja más
-- reciente. Los otros 91 de la hoja siguen exactamente igual a como
-- quedaron en la 046; estos 5 son los únicos con diferencias:
--
--   GUADALUPE PARTIDA               28% -> 48%
--   MARTIN RODRIGUEZ VILLARREAL     48% -> 64%
--   Socorro Badillo                 84% -> 88%
--   Juana Chavez Chavez             76% -> 84%
--   NADIA KARINA CERVANTES MONDRAGÓN 76% -> 80%
--
-- Nadie nuevo en la hoja y nadie salió de ella - se comprobó
-- comparando los 96 KW ID contra la corrida anterior antes de escribir
-- esto, no a ojo.
--
-- Se puede volver a correr sin daño: dos veces seguidas dejan el mismo
-- resultado. Ejecutar después de 046_abc_checks_desde_hoja.sql.

with hoja (kwid, temas) as (values
  ('2000133182', 'TTTTTTTTTTTFFFFFFFFFFFTFF'),  -- GUADALUPE PARTIDA
  ('2000147243', 'TTTTTTTTTTTTTFFFFFFFFTTTF'),  -- MARTIN RODRIGUEZ VILLARREAL
  ('2000150355', 'TTTTTTTFTTTTTTTTTTTFTTTTF'),  -- Socorro Badillo
  ('2000150419', 'TTTTTTTTTTTTTTFTTTTTTFFTF'),  -- Juana Chavez Chavez
  ('2000156643', 'TTTTTTTTTTTTTTFTTTTTFFTFF')   -- NADIA KARINA CERVANTES MONDRAGÓN
)
insert into public.abc_avance (kwid, tema_id, completado)
select h.kwid, t.id, substr(h.temas, t.id::int, 1) = 'T'
from hoja h
cross join public.abc_temas t
where t.id between 1 and 25
on conflict (kwid, tema_id) do update
  set completado = excluded.completado,
      marcado_en = now();

-- Comprobación: debe salir 48, 64, 88, 84 y 80.
select a.kwid, a.nombre,
       round(count(*) filter (where v.completado) * 100.0 / 25) as porcentaje
from public.abc_asesores a
join public.abc_avance v on v.kwid = a.kwid
where a.kwid in ('2000133182', '2000147243', '2000150355', '2000150419', '2000156643')
group by a.kwid, a.nombre
order by a.nombre;
