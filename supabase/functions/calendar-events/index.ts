const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN")!;
const GOOGLE_CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const accessToken = await getAccessToken();
    const reqUrl = new URL(req.url);
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
    const events = (data.items ?? []).map((ev: any) => ({
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

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
