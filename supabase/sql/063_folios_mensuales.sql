-- ═════════════════════════════════════════════════════════════
-- 063 · Un solo formato de folio para todo lo que se folia
-- ═════════════════════════════════════════════════════════════
--
-- Como todos los de esta carpeta, se puede volver a correr sin romper
-- nada ni tocar lo que ya se haya capturado.
--
-- El folio pasa a ser: consecutivo del mes + mes + año + iniciales del
-- documento. Por ejemplo 010826DE es el primer expediente dictaminado de
-- agosto de 2026 (DE = Dictaminación de Expedientes).
--
-- El consecutivo se reinicia cada mes a propósito: así el propio folio
-- dice cuántos de ese documento se llevan en el mes, que es la pregunta
-- que se venía contestando a mano. Con un contador corrido de toda la
-- vida (el de antes, "CT 0001") ese dato no se puede leer del folio.
--
-- Los folios viejos se quedan como están. No se recalculan: un folio ya
-- entregado aparece en documentos impresos y firmados, y cambiarlo aquí
-- no los cambia allá. Los dos formatos conviven sin chocar, porque el
-- viejo lleva un espacio y prefijo al frente ("CT 0001") y el nuevo no.

-- ─────────────────────────────────────────────────────────────
-- 1) El contador, ahora por mes
-- ─────────────────────────────────────────────────────────────
-- Tabla aparte y no una columna más en folio_contadores: ahí vive UN
-- renglón por tipo de documento, y aquí hace falta uno por tipo Y mes.
-- folio_contadores se queda como el catálogo de qué iniciales le tocan a
-- cada documento, que es lo único suyo que se sigue usando.
create table if not exists public.folio_contadores_mes (
  tipo_documento text not null,
  -- El primer día del mes al que pertenece el contador.
  periodo date not null,
  siguiente int not null default 1,
  primary key (tipo_documento, periodo)
);

-- Las iniciales de cada documento. Las de los acuerdos ya estaban
-- registradas como "prefijo" desde el archivo 008; se reusan tal cual,
-- nada más que ahora van al final del folio en vez de al principio.
insert into public.folio_contadores (tipo_documento, prefijo) values
  ('dictamen', 'DE')
on conflict (tipo_documento) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 2) La función que arma el folio
-- ─────────────────────────────────────────────────────────────
create or replace function public.folio_del_mes(p_tipo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_iniciales text;
  v_periodo date := date_trunc('month', now())::date;
  v_num int;
begin
  select prefijo into v_iniciales
  from public.folio_contadores where tipo_documento = p_tipo;

  if v_iniciales is null then
    raise exception 'El documento % no tiene iniciales de folio registradas en folio_contadores', p_tipo;
  end if;

  -- Reservar el número y leerlo va en un solo enunciado a propósito: si
  -- fueran dos (leer y luego sumar), dos personas finalizando al mismo
  -- tiempo alcanzarían a leer el mismo número y se llevarían el mismo
  -- folio. Así el que llega segundo espera y se lleva el siguiente.
  insert into public.folio_contadores_mes (tipo_documento, periodo, siguiente)
  values (p_tipo, v_periodo, 2)
  on conflict (tipo_documento, periodo)
    do update set siguiente = public.folio_contadores_mes.siguiente + 1
  returning siguiente - 1 into v_num;

  -- Dos dígitos, pero sin cortar: si un mes se pasara de 99, lpad deja
  -- pasar el tercer dígito en vez de recortarlo. Un folio de más se lee
  -- raro; uno repetido rompe la serie.
  return lpad(v_num::text, 2, '0')
       || to_char(v_periodo, 'MMYY')
       || v_iniciales;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 3) Los documentos que ya foliaban
-- ─────────────────────────────────────────────────────────────
-- obtener_siguiente_folio conserva su nombre y su firma para no tener que
-- tocar finalizar_documento ni ninguna pantalla: por dentro ya nada más
-- llama a la función de arriba. Los acuerdos y contratos empiezan a
-- foliarse con el formato nuevo desde la próxima vez que se finalice uno.
create or replace function public.obtener_siguiente_folio(p_tipo text)
returns text
language sql
security definer
set search_path = public
as $$
  select public.folio_del_mes(p_tipo);
$$;

-- Los documentos armados con plantilla traían su propio folio por dentro
-- (KWP-2026-0001, consecutivo del año). Pasan al mismo formato que los
-- demás para que la cuenta del mes se lea igual en todos.
insert into public.folio_contadores (tipo_documento, prefijo) values
  ('plantilla', 'KWP')
on conflict (tipo_documento) do nothing;

create or replace function public.finalizar_documento_plantilla(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documentos_plantilla%rowtype;
  v_bloques jsonb;
  v_folio text;
begin
  select * into v_doc from public.documentos_plantilla where id = p_id;
  if not found then raise exception 'Documento no encontrado'; end if;
  if v_doc.user_id <> auth.uid() then raise exception 'No es tu documento'; end if;
  if v_doc.estado = 'finalizado' then return v_doc.folio; end if;

  select bloques into v_bloques from public.plantillas_documento where id = v_doc.plantilla_id;

  v_folio := public.folio_del_mes('plantilla');

  update public.documentos_plantilla
  set estado = 'finalizado',
      folio = v_folio,
      bloques_congelados = coalesce(v_bloques, bloques_congelados),
      finalizado_at = now(),
      updated_at = now()
  where id = p_id;

  return v_folio;
end;
$$;
