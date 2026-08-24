-- Fase 66: Ingreso de asesores, capturado desde el sitio.
--
-- El alta de un asesor (o de alguien de back office) hoy se anota nada
-- más en el Excel del Market Center, a mano. Esta tabla es el primer
-- paso para que ese expediente empiece a vivir en el sitio: por ahora
-- SOLO guarda lo que se captura desde el formulario "Nuevo Asesor" del
-- Panel, aparte de lo que ya se lee del Excel (las pestañas Activos,
-- Bajas, Células, Back Office siguen jalando de ahí, sin tocarse). El
-- día que el Excel deje de ser la fuente, este es el lugar donde ya se
-- estaría guardando de verdad.
--
-- Quién puede ver esto: Master y Admin, igual que altas_procesadas. El
-- candado real de quién puede CREAR un registro vive en la Edge
-- Function proceso-alta (mismo criterio que el resto de Asesores): solo
-- ella escribe aquí, con la llave de servicio.
--
-- Ejecutar completo en Supabase Dashboard > SQL Editor. Se puede volver
-- a correr sin problema: no pisa nada de lo que ya haya capturado la
-- gente.

create table if not exists public.ingreso_asesores (
  id uuid primary key default gen_random_uuid(),

  -- 'asesor' o 'back_office': con qué grupo se le da seguimiento
  -- después (misma idea que las pestañas de Asesores en el Panel).
  tipo text not null default 'asesor',

  nombre text not null,
  correo_personal text,
  celular text,
  curp text,
  cumpleanos date,
  tipo_asociado text,
  sponsor text,
  usuario_command text,
  correo_kw text,
  -- Ojo: esto guarda la contraseña de la cuenta KW en texto plano,
  -- igual que hoy vive en el Excel. Se decidió a propósito, sabiendo el
  -- riesgo: Master y Admin ya la ven en el Excel, y aquí queda con el
  -- mismo candado (RLS + Edge Function). Si el día de mañana se quiere
  -- más cuidado, aquí es donde habría que cifrarla o sacarla a otro
  -- lado.
  contrasena text,
  kwid text,
  -- Día y mes nada más ("1 Septiembre"): el aniversario KW no lleva año
  -- fijo de cumpleaños, así que no es una fecha real de Postgres.
  aniversario text,
  clasificacion text,
  coach_asignado text,

  emergencia_nombre text,
  emergencia_celular text,
  emergencia_correo text,
  emergencia_parentesco text,

  capturado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ingreso_tipo_valido check (tipo in ('asesor', 'back_office')),
  constraint ingreso_nombre_largo check (char_length(nombre) between 2 and 200)
);

create index if not exists idx_ingreso_asesores_created on public.ingreso_asesores(created_at desc);
create index if not exists idx_ingreso_asesores_tipo on public.ingreso_asesores(tipo);

alter table public.ingreso_asesores enable row level security;

-- Solo lectura desde el cliente, y solo para liderazgo - igual que
-- altas_procesadas. Quien escribe es la Edge Function con la llave de
-- servicio, que además comprueba el rol (o el correo de ALTA_EMAILS)
-- de quien la llama.
drop policy if exists "select_liderazgo" on public.ingreso_asesores;
create policy "select_liderazgo" on public.ingreso_asesores
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('master', 'admin')
    )
  );
