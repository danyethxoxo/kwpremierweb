// Edge Function: calendar-events
//
// Dos trabajos, los dos contra el mismo Google Calendar de la cuenta:
//
//   1. GET  -> lee eventos (lo de siempre, para la agenda del Hub).
//   2. POST { accion: 'aceptar_reserva' } -> acepta una solicitud de
//      sala: crea el evento en el calendario de salas y marca la
//      reserva como aceptada en Supabase. Va aquí y no en un update
//      directo desde el sitio porque crear el evento necesita el
//      token de Google, que solo vive en esta función.
//
// "Rechazar" una reserva NO pasa por aquí: no toca Google, así que el
// sitio actualiza `reservas_salas` directo (ya cubierto por RLS).
//
// ── Variable nueva que hay que configurar ──
// GOOGLE_CALENDAR_SALAS_ID: el id del calendario donde se crean las
// reservas de salas (Ajustes del calendario > Integrar calendario >
// ID de calendario). Mientras no se configure, se usa el mismo
// GOOGLE_CALENDAR_ID de los eventos públicos como respaldo, para que
// esto no truene - pero lo normal es que sea uno aparte, porque las
// reservas de sala no son eventos para que vea todo el mundo.
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;
const GOOGLE_CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID")!;
const GOOGLE_CALENDAR_SALAS_ID = Deno.env.get("GOOGLE_CALENDAR_SALAS_ID") || GOOGLE_CALENDAR_ID;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const CALENDAR_TZ = "America/Mexico_City";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function respond(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo renovar el token de Google: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

async function listarEventos(reqUrl: URL) {
  const accessToken = await getAccessToken();
  const now = new Date();
  const timeMin = reqUrl.searchParams.get("timeMin") ?? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const timeMax = reqUrl.searchParams.get("timeMax") ?? new Date(now.getFullYear(), now.getMonth() + 3, 1).toISOString();

  const apiUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/events`);
  apiUrl.searchParams.set("timeMin", timeMin);
  apiUrl.searchParams.set("timeMax", timeMax);
  apiUrl.searchParams.set("singleEvents", "true");
  apiUrl.searchParams.set("orderBy", "startTime");
  apiUrl.searchParams.set("maxResults", "250");

  const eventsRes = await fetch(apiUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!eventsRes.ok) {
    throw new Error(`Google Calendar API error: ${eventsRes.status} ${await eventsRes.text()}`);
  }

  const data = await eventsRes.json();
  return (data.items ?? []).map((ev: any) => ({
    id: ev.id,
    title: ev.summary ?? "(Sin título)",
    description: ev.description ?? "",
    location: ev.location ?? "",
    start: ev.start?.dateTime ?? ev.start?.date,
    end: ev.end?.dateTime ?? ev.end?.date,
    allDay: !ev.start?.dateTime,
    htmlLink: ev.htmlLink,
    hangoutLink: ev.hangoutLink ?? null,
  }));
}

// ── Aceptar una reserva de sala ─────────────────────────────
// Crea el evento en Google Calendar y, solo si eso funciona, marca la
// reserva como aceptada. Si Google falla, la reserva se queda
// pendiente para poder reintentar - nunca queda "aceptada" sin evento
// de verdad, porque entonces la sala se vería libre en el calendario.
async function aceptarReserva(admin: any, reservaId: string, quienId: string) {
  const { data: reserva, error: errReserva } = await admin
    .from("reservas_salas")
    .select("id, sala_id, asesor_id, fecha, hora_inicio, hora_fin, motivo, estado")
    .eq("id", reservaId)
    .maybeSingle();
  if (errReserva) throw new Error(`No se pudo leer la reserva: ${errReserva.message}`);
  if (!reserva) throw new Error("Esa reserva no existe.");
  if (reserva.estado !== "pendiente") {
    throw new Error(`Esta reserva ya está "${reserva.estado}", no se puede volver a aceptar.`);
  }

  const [{ data: sala }, { data: asesor }] = await Promise.all([
    admin.from("salas_kw").select("nombre").eq("id", reserva.sala_id).maybeSingle(),
    admin.from("profiles").select("nombre, apellido, whatsapp, email").eq("id", reserva.asesor_id).maybeSingle(),
  ]);
  const salaNombre = sala?.nombre || reserva.sala_id;
  const asesorNombre = [asesor?.nombre, asesor?.apellido].filter(Boolean).join(" ") || "un asesor";

  // Choque de horario contra otras reservas YA aceptadas de la misma
  // sala. Se checa aquí, al aceptar, y no al pedir: puede haber varias
  // solicitudes pendientes para el mismo hueco (es normal, la gente no
  // se pone de acuerdo antes de pedir), y quien acepta la primera es
  // quien se queda con el horario; las demás se rechazan a mano.
  const { data: choques, error: errChoques } = await admin
    .from("reservas_salas")
    .select("id, asesor_id, hora_inicio, hora_fin")
    .eq("sala_id", reserva.sala_id)
    .eq("fecha", reserva.fecha)
    .eq("estado", "aceptada")
    .neq("id", reservaId)
    .lt("hora_inicio", reserva.hora_fin)
    .gt("hora_fin", reserva.hora_inicio);
  if (errChoques) throw new Error(`No se pudo revisar choques de horario: ${errChoques.message}`);
  if (choques && choques.length) {
    throw new Error(
      `${salaNombre} ya tiene una reserva aceptada ese día de ${choques[0].hora_inicio} a ${choques[0].hora_fin}. ` +
      `Rechaza esta solicitud o dile que pida otro horario.`
    );
  }

  const accessToken = await getAccessToken();
  const evento = {
    summary: `${salaNombre} - ${asesorNombre}`,
    description: reserva.motivo || undefined,
    location: salaNombre,
    start: { dateTime: `${reserva.fecha}T${reserva.hora_inicio}`, timeZone: CALENDAR_TZ },
    end: { dateTime: `${reserva.fecha}T${reserva.hora_fin}`, timeZone: CALENDAR_TZ },
  };
  const crearRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(GOOGLE_CALENDAR_SALAS_ID)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(evento),
    }
  );
  if (!crearRes.ok) {
    throw new Error(`No se pudo crear el evento en Google Calendar: ${crearRes.status} ${await crearRes.text()}`);
  }
  const eventoCreado = await crearRes.json();

  const { error: errUpdate } = await admin
    .from("reservas_salas")
    .update({
      estado: "aceptada",
      respondido_por: quienId,
      respondido_en: new Date().toISOString(),
      evento_calendar_id: eventoCreado.id,
    })
    .eq("id", reservaId)
    .eq("estado", "pendiente"); // por si dos personas le dieron aceptar casi al mismo tiempo
  if (errUpdate) throw new Error(`El evento se creó en Google, pero no se pudo guardar en la reserva: ${errUpdate.message}`);

  return {
    ok: true,
    evento_id: eventoCreado.id,
    evento_link: eventoCreado.htmlLink,
    asesor: { nombre: asesorNombre, whatsapp: asesor?.whatsapp || null, email: asesor?.email || null },
    sala_nombre: salaNombre,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method === "POST") {
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        return respond({ error: "Faltan variables de entorno del proyecto." }, 500);
      }

      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return respond({ error: "No autenticado" }, 401);

      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data: quien, error: errQuien } = await admin.auth.getUser(token);
      if (errQuien || !quien?.user) return respond({ error: "Sesión inválida" }, 401);

      const { data: perfil } = await admin.from("profiles").select("role").eq("id", quien.user.id).single();
      if (!perfil || !["master", "admin", "staff"].includes(String(perfil.role))) {
        return respond({ error: "Aceptar reservas es solo para el equipo de liderazgo." }, 403);
      }

      const body = await req.json().catch(() => ({}));
      if (body.accion === "aceptar_reserva") {
        if (!body.reserva_id) return respond({ error: "Falta el id de la reserva." }, 400);
        const resultado = await aceptarReserva(admin, String(body.reserva_id), quien.user.id);
        return respond(resultado);
      }
      return respond({ error: "Acción no reconocida." }, 400);
    }

    // GET: lectura de eventos, como siempre.
    const events = await listarEventos(new URL(req.url));
    return respond({ events }, 200, { "Cache-Control": "public, max-age=120" });
  } catch (err) {
    return respond({ error: (err as Error).message || String(err) }, 500);
  }
});
