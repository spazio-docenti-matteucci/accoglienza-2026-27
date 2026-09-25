import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const SESSION_HOURS = 12;
const SIGNED_URL_SECONDS = 300;
const BUCKET = "orientamento-riservato";
const PRESENTATION_PREFIX = "presentazioni/";
const PRESENTATION_TITLE = "Residenti in età di ingresso alla prima superiore · coorti 2008–2013";
const PRESENTATION_DESCRIPTION = "Analisi demografica dei comuni di provenienza degli iscritti alla sede di Decimomannu dell’IIS Meucci-Mattei. Fonte: ISTAT POSAS.";
const VALID_LEVELS = new Set(["orientatore", "supporter", "funzione_strumentale"]);
type AccessLevel = "orientatore" | "supporter" | "funzione_strumentale";
const ALLOWED_FILES = new Map([
  ["application/pdf", "pdf"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["text/plain", "txt"],
]);
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_PRESENTATION_SIZE = 2 * 1024 * 1024;
const MAX_JSON_SIZE = 12000;
const MAX_PUBLIC_REQUESTS_PER_DAY = 40;
const PROPOSAL_TYPES = new Set(["laboratorio", "lezione_aperta", "esperienza_pratica", "dimostrazione", "interdisciplinare", "altro"]);
const PROPOSAL_DURATIONS = new Set([30, 45, 60, 90]);
const ACTIVITY_TYPES = new Set(["visita", "mattinee"]);
const LEADERBOARD_SIZE = 10;
const POINTS = {
  disponibilita: 5,
  proposta: 10,
  proposta_approvata: 10,
  visita: 20,
  mattinee: 30,
  apripista: 10,
};
const LEVELS: [number, string][] = [
  [120, "Leggenda dell’orientamento"],
  [60, "Mentore"],
  [25, "Guida"],
  [0, "Matricola"],
];
const ALLOWED_ORIGINS = new Set([
  "https://spazio-docenti-matteucci.github.io",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
]);

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "content-type, x-orientamento-session",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json; charset=utf-8" },
  });
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifySession(request: Request) {
  const token = request.headers.get("x-orientamento-session") ?? "";
  if (token.length < 32 || token.length > 128) return null;

  const tokenHash = await sha256(token);
  const { data, error } = await admin
    .from("orientamento_sessioni")
    .select("token_hash,expires_at,access_level")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data || !VALID_LEVELS.has(data.access_level)) return null;
  void admin
    .from("orientamento_sessioni")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  return { tokenHash, accessLevel: data.access_level as AccessLevel };
}

async function login(request: Request, payload: Record<string, unknown>) {
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!password || password.length > 200) {
    return json(request, { error: "Password non corretta." }, 401);
  }

  const { data: accessLevel, error } = await admin.rpc("verifica_orientamento_accesso", {
    p_password: password,
  });
  if (error || !VALID_LEVELS.has(accessLevel)) {
    return json(request, { error: "Password non corretta." }, 401);
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  await admin.from("orientamento_sessioni").delete().lt("expires_at", new Date().toISOString());
  const { error: insertError } = await admin.from("orientamento_sessioni").insert({
    token_hash: tokenHash,
    expires_at: expiresAt,
    access_level: accessLevel,
  });
  if (insertError) return json(request, { error: "Accesso temporaneamente non disponibile." }, 503);

  return json(request, { ok: true, token, access_level: accessLevel, expires_at: expiresAt });
}

async function listDocuments(request: Request, accessLevel: AccessLevel) {
  let query = admin
    .from("orientamento_documenti")
    .select("id,object_path,titolo,descrizione,visibilita,ordine,versione,updated_at")
    .eq("attivo", true)
    .order("ordine", { ascending: true })
    .order("updated_at", { ascending: false });

  if (accessLevel === "supporter") query = query.eq("visibilita", "tutti");
  const { data, error } = await query;
  if (error) return json(request, { error: "Impossibile caricare i documenti." }, 500);

  const documents = await Promise.all((data ?? []).map(async (document) => {
    const isPresentation = document.object_path.startsWith(PRESENTATION_PREFIX);
    if (isPresentation) {
      return {
        id: document.id,
        title: document.titolo,
        description: document.descrizione,
        visibility: document.visibilita,
        version: document.versione,
        updated_at: document.updated_at,
        kind: "presentation",
        url: null,
      };
    }
    const { data: signed, error: signedError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(document.object_path, SIGNED_URL_SECONDS);
    return {
      id: document.id,
      title: document.titolo,
      description: document.descrizione,
      visibility: document.visibilita,
      version: document.versione,
      updated_at: document.updated_at,
      kind: "document",
      url: signedError ? null : signed.signedUrl,
    };
  }));

  return json(request, { access_level: accessLevel, documents });
}

function cleanString(value: unknown, maxLength: number, required = false) {
  if (typeof value !== "string") {
    if (required) throw new Error("Campo obbligatorio non valido.");
    return "";
  }
  const cleaned = value.trim();
  if (required && !cleaned) throw new Error("Campo obbligatorio mancante.");
  if (cleaned.length > maxLength) throw new Error("Uno dei testi supera la lunghezza consentita.");
  return cleaned;
}

function publicText(value: unknown, minLength: number, maxLength: number) {
  if (typeof value !== "string") throw new Error("Controlla i campi obbligatori.");
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    throw new Error("Controlla la lunghezza dei campi compilati.");
  }
  return cleaned;
}

function publicName(value: unknown) {
  const name = publicText(value, 2, 80);
  if (!/^[\p{L}\p{M}\s'.’-]+$/u.test(name)) throw new Error("Inserisci nome e cognome validi.");
  return name;
}

function confirmationCode(id: string) {
  return id.slice(0, 8).toUpperCase();
}

class PublicServiceError extends Error {
  constructor() { super("Il modulo non è disponibile. Riprova più tardi."); }
}

async function publicQuota(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const fingerprint = await sha256(`${day}:${ip}:${serviceRoleKey}`);
  const { data, error } = await admin.rpc("orientamento_consuma_quota", {
    p_fingerprint: fingerprint,
    p_limite: MAX_PUBLIC_REQUESTS_PER_DAY,
  });
  if (error) throw new PublicServiceError();
  return data === true;
}

async function submitSupporter(request: Request, payload: Record<string, unknown>) {
  try {
    if (payload.website) return json(request, { ok: true, codice: "RICEVUTA" });
    const nome = publicName(payload.nome);
    const cognome = publicName(payload.cognome);
    const scuole = payload.scuole;
    if (!Array.isArray(scuole) || scuole.length < 1 || scuole.length > 5 ||
      scuole.some((id) => typeof id !== "string" || !/^[a-z0-9-]{3,80}$/.test(id)) ||
      new Set(scuole).size !== scuole.length) {
      throw new Error("Seleziona da una a cinque scuole.");
    }
    const nota = publicText(payload.nota ?? "", 0, 600);
    const { data: valid, error: schoolError } = await admin.from("orientamento_scuole")
      .select("id").in("id", scuole).eq("attiva", true);
    if (schoolError) throw new PublicServiceError();
    if (!valid || valid.length !== scuole.length) throw new Error("L’elenco delle scuole è cambiato. Ricarica la pagina.");
    if (!await publicQuota(request)) return json(request, { error: "Troppe richieste da questa connessione. Riprova domani." }, 429);
    const { data, error } = await admin.from("orientamento_disponibilita")
      .insert({ nome, cognome, scuole, nota, in_classifica: payload.in_classifica === true }).select("id").single();
    if (error || !data) throw new PublicServiceError();
    return json(request, { ok: true, codice: confirmationCode(data.id) }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Invio non riuscito." }, error instanceof PublicServiceError ? 503 : 400);
  }
}

async function submitProposal(request: Request, payload: Record<string, unknown>) {
  try {
    if (payload.website) return json(request, { ok: true, codice: "RICEVUTA" });
    const nome = publicName(payload.nome);
    const cognome = publicName(payload.cognome);
    const titolo = publicText(payload.titolo, 3, 160);
    const area = publicText(payload.area, 2, 120);
    const descrizione = publicText(payload.descrizione, 10, 1200);
    const esigenze = publicText(payload.esigenze ?? "", 0, 600);
    const nota = publicText(payload.nota ?? "", 0, 600);
    if (typeof payload.tipologia !== "string" || !PROPOSAL_TYPES.has(payload.tipologia)) throw new Error("Seleziona una tipologia di attività.");
    if (typeof payload.durata_minuti !== "number" || !PROPOSAL_DURATIONS.has(payload.durata_minuti)) throw new Error("Seleziona una durata indicativa.");
    const partecipanti = payload.partecipanti === null || payload.partecipanti === "" || payload.partecipanti === undefined ? null : payload.partecipanti;
    if (partecipanti !== null && (!Number.isInteger(partecipanti) || partecipanti < 1 || partecipanti > 200)) {
      throw new Error("Il numero di partecipanti non è valido.");
    }
    if (!await publicQuota(request)) return json(request, { error: "Troppe richieste da questa connessione. Riprova domani." }, 429);
    const { data, error } = await admin.from("orientamento_proposte")
      .insert({ nome, cognome, titolo, area, tipologia: payload.tipologia, descrizione,
        durata_minuti: payload.durata_minuti, partecipanti, esigenze, nota,
        in_classifica: payload.in_classifica === true })
      .select("id").single();
    if (error || !data) throw new PublicServiceError();
    return json(request, { ok: true, codice: confirmationCode(data.id) }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Invio non riuscito." }, error instanceof PublicServiceError ? 503 : 400);
  }
}

type Person = { nome: string; cognome: string; in_classifica: boolean };
type Supporter = Person & { scuole: string[]; stato: string; created_at: string };
type Proposal = Person & { stato: string; created_at: string };
type Activity = Person & { id: string; tipo: string; scuola_id: string | null; data: string; created_at: string };

function personKey(nome: string, cognome: string) {
  return `${nome} ${cognome}`.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function levelFor(points: number) {
  return LEVELS.find(([threshold]) => points >= threshold)?.[1] ?? "Matricola";
}

// Punteggi calcolati sempre lato server: la pagina pubblica riceve solo i docenti che hanno acconsentito.
function computeScores(supporters: Supporter[], proposals: Proposal[], activities: Activity[]) {
  const people = new Map<string, {
    nome: string; cognome: string; consenso: boolean; punti: number; disponibilita: boolean;
    proposte: number; approvate: number; visite: number; mattinee: number; scuole: Set<string>; apripista: number;
    ultimo: string;
  }>();
  const person = (item: Person, when: string) => {
    const key = personKey(item.nome, item.cognome);
    if (!people.has(key)) {
      people.set(key, { nome: item.nome, cognome: item.cognome, consenso: false, punti: 0, disponibilita: false,
        proposte: 0, approvate: 0, visite: 0, mattinee: 0, scuole: new Set(), apripista: 0, ultimo: when });
    }
    const entry = people.get(key)!;
    if (item.in_classifica) entry.consenso = true;
    if (when > entry.ultimo) entry.ultimo = when;
    return entry;
  };

  for (const item of supporters) {
    if (item.stato === "archiviata") continue;
    person(item, item.created_at).disponibilita = true;
  }
  for (const item of proposals) {
    if (item.stato === "archiviata") continue;
    const entry = person(item, item.created_at);
    entry.proposte += 1;
    if (item.stato === "approvata") entry.approvate += 1;
  }
  const firstVisit = new Map<string, string>();
  const ordered = [...activities].sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at));
  for (const item of ordered) {
    const entry = person(item, item.created_at);
    if (item.tipo === "mattinee") {
      entry.mattinee += 1;
      continue;
    }
    entry.visite += 1;
    if (item.scuola_id) {
      entry.scuole.add(item.scuola_id);
      if (!firstVisit.has(item.scuola_id)) {
        firstVisit.set(item.scuola_id, personKey(item.nome, item.cognome));
        entry.apripista += 1;
      }
    }
  }

  const ranking = [...people.values()].map((entry) => {
    const punti = (entry.disponibilita ? POINTS.disponibilita : 0) + entry.proposte * POINTS.proposta +
      entry.approvate * POINTS.proposta_approvata + entry.visite * POINTS.visita +
      entry.mattinee * POINTS.mattinee + entry.apripista * POINTS.apripista;
    const badge: string[] = [];
    if (entry.visite >= 1) badge.push("esploratore");
    if (entry.scuole.size >= 3) badge.push("ambasciatore");
    if (entry.apripista >= 1) badge.push("apripista");
    if (entry.proposte >= 1) badge.push("idee");
    if (entry.mattinee >= 1) badge.push("laboratorio");
    return { ...entry, punti, badge, livello: levelFor(punti), scuole_visitate: entry.scuole.size };
  }).filter((entry) => entry.punti > 0)
    .sort((a, b) => b.punti - a.punti || b.visite - a.visite || a.ultimo.localeCompare(b.ultimo));

  return { ranking, firstVisit };
}

async function loadScoreData() {
  const [schools, supporter, proposals, activities] = await Promise.all([
    admin.from("orientamento_scuole").select("id,comune,etichetta,area,verificata").eq("attiva", true).order("ordine"),
    admin.from("orientamento_disponibilita").select("id,nome,cognome,scuole,nota,stato,in_classifica,created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("orientamento_proposte").select("id,nome,cognome,titolo,area,tipologia,descrizione,durata_minuti,partecipanti,esigenze,nota,stato,in_classifica,created_at").order("created_at", { ascending: false }).limit(500),
    admin.from("orientamento_attivita").select("id,nome,cognome,tipo,scuola_id,titolo,data,nota,in_classifica,stato,created_at").eq("archiviata", false).order("data", { ascending: false }).limit(1000),
  ]);
  if (schools.error || supporter.error || proposals.error || activities.error) throw new PublicServiceError();
  // Solo le attività confermate dalla Funzione Strumentale contano per punti, mappa ed elenco.
  const allActivities = activities.data ?? [];
  return {
    schools: schools.data ?? [], supporters: supporter.data ?? [], proposals: proposals.data ?? [],
    activities: allActivities.filter((item) => item.stato === "confermata"),
    pendingActivities: allActivities.filter((item) => item.stato === "da_confermare"),
  };
}

function displayName(nome: string, cognome: string) {
  return `${nome.trim().charAt(0).toUpperCase()}. ${cognome.trim()}`;
}

async function leaderboard(request: Request) {
  try {
    const data = await loadScoreData();
    const { ranking } = computeScores(data.supporters as Supporter[], data.proposals as Proposal[], data.activities as Activity[]);
    const visited = new Set(data.activities.filter((item) => item.tipo === "visita" && item.scuola_id).map((item) => item.scuola_id));
    const offered = new Set(data.supporters.filter((item) => item.stato !== "archiviata").flatMap((item) => item.scuole as string[]));
    const publicRanking = ranking.filter((entry) => entry.consenso).slice(0, LEADERBOARD_SIZE).map((entry, index) => ({
      posizione: index + 1,
      nome: displayName(entry.nome, entry.cognome),
      punti: entry.punti,
      livello: entry.livello,
      badge: entry.badge,
      visite: entry.visite,
      mattinee: entry.mattinee,
    }));
    return json(request, {
      totali: {
        docenti: ranking.length,
        scuole: data.schools.length,
        scuole_visitate: visited.size,
        scuole_con_disponibilita: data.schools.filter((school) => offered.has(school.id)).length,
        visite: data.activities.filter((item) => item.tipo === "visita").length,
        mattinee_proposte: data.proposals.filter((item) => item.stato !== "archiviata").length,
        mattinee_svolte: data.activities.filter((item) => item.tipo === "mattinee").length,
        punti: ranking.reduce((sum, entry) => sum + entry.punti, 0),
      },
      scuole: data.schools.map((school) => ({
        id: school.id,
        comune: school.comune,
        etichetta: school.etichetta,
        stato: visited.has(school.id) ? "visitata" : offered.has(school.id) ? "in_arrivo" : "libera",
      })),
      classifica: publicRanking,
      punti: POINTS,
    });
  } catch {
    return json(request, { error: "Classifica non disponibile." }, 503);
  }
}

async function listContributions(request: Request) {
  try {
    const data = await loadScoreData();
    const { ranking } = computeScores(data.supporters as Supporter[], data.proposals as Proposal[], data.activities as Activity[]);
    return json(request, {
      scuole: data.schools,
      disponibilita: data.supporters,
      proposte: data.proposals,
      attivita: data.activities,
      da_confermare: data.pendingActivities,
      classifica: ranking.map((entry, index) => ({
        posizione: index + 1,
        nome: entry.nome,
        cognome: entry.cognome,
        consenso: entry.consenso,
        punti: entry.punti,
        livello: entry.livello,
        visite: entry.visite,
        mattinee: entry.mattinee,
        proposte: entry.proposte,
      })),
    });
  } catch {
    return json(request, { error: "Impossibile caricare le disponibilità." }, 500);
  }
}

async function activityFields(payload: Record<string, unknown>) {
  const nome = publicName(payload.nome);
  const cognome = publicName(payload.cognome);
  const tipo = typeof payload.tipo === "string" && ACTIVITY_TYPES.has(payload.tipo) ? payload.tipo : "";
  if (!tipo) throw new Error("Scegli il tipo di attività.");
  const data = typeof payload.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.data) ? payload.data : "";
  if (!data || Number.isNaN(Date.parse(data))) throw new Error("Indica la data dell’attività.");
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (data > tomorrow) throw new Error("La data non può essere nel futuro: registra l’attività dopo averla svolta.");
  const titolo = publicText(payload.titolo ?? "", 0, 160);
  const nota = publicText(payload.nota ?? "", 0, 600);
  let scuolaId: string | null = null;
  if (tipo === "visita") {
    scuolaId = typeof payload.scuola_id === "string" && /^[a-z0-9-]{3,80}$/.test(payload.scuola_id) ? payload.scuola_id : null;
    if (!scuolaId) throw new Error("Scegli la scuola visitata.");
    const { data: school, error } = await admin.from("orientamento_scuole").select("id").eq("id", scuolaId).maybeSingle();
    if (error) throw new PublicServiceError();
    if (!school) throw new Error("Scuola non valida.");
  }
  return { nome, cognome, tipo, scuola_id: scuolaId, titolo, data, nota, in_classifica: payload.in_classifica === true };
}

async function registerActivity(request: Request, payload: Record<string, unknown>) {
  try {
    const fields = await activityFields(payload);
    const { data: row, error } = await admin.from("orientamento_attivita")
      .insert({ ...fields, stato: "confermata" })
      .select("id").single();
    if (error || !row) throw new Error("Registrazione non riuscita.");
    return json(request, { ok: true, id: row.id }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Registrazione non riuscita." }, 400);
  }
}

// Segnalazione pubblica del docente: resta "da_confermare" finché la Funzione Strumentale non la conferma.
async function reportActivity(request: Request, payload: Record<string, unknown>) {
  try {
    if (payload.website) return json(request, { ok: true, codice: "RICEVUTA" });
    const fields = await activityFields(payload);
    if (!await publicQuota(request)) return json(request, { error: "Troppe richieste da questa connessione. Riprova domani." }, 429);
    const { data: row, error } = await admin.from("orientamento_attivita")
      .insert({ ...fields, stato: "da_confermare" })
      .select("id").single();
    if (error || !row) throw new PublicServiceError();
    return json(request, { ok: true, codice: confirmationCode(row.id) }, 201);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Invio non riuscito." }, error instanceof PublicServiceError ? 503 : 400);
  }
}

async function confirmActivity(request: Request, payload: Record<string, unknown>) {
  const id = payload.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return json(request, { error: "Voce non valida." }, 400);
  const { data, error } = await admin.from("orientamento_attivita").update({ stato: "confermata" })
    .eq("id", id).eq("archiviata", false).select("id").maybeSingle();
  if (error || !data) return json(request, { error: "Conferma non riuscita." }, 500);
  return json(request, { ok: true });
}

async function archiveActivity(request: Request, payload: Record<string, unknown>) {
  const id = payload.id;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return json(request, { error: "Voce non valida." }, 400);
  const { data, error } = await admin.from("orientamento_attivita").update({ archiviata: true })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) return json(request, { error: "Eliminazione non riuscita." }, 500);
  return json(request, { ok: true });
}

async function updateContribution(request: Request, payload: Record<string, unknown>) {
  const kind = payload.kind;
  const id = payload.id;
  const state = payload.stato;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return json(request, { error: "Voce non valida." }, 400);
  const allowed = kind === "supporter" ? ["ricevuta", "assegnata", "archiviata"] :
    kind === "proposta" ? ["ricevuta", "in_valutazione", "approvata", "archiviata"] : [];
  if (typeof state !== "string" || !allowed.includes(state)) return json(request, { error: "Stato non valido." }, 400);
  const table = kind === "supporter" ? "orientamento_disponibilita" : "orientamento_proposte";
  const { data, error } = await admin.from(table).update({ stato: state, updated_at: new Date().toISOString() })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) return json(request, { error: "Aggiornamento non riuscito." }, 500);
  return json(request, { ok: true });
}

function validateFile(value: unknown, presentation = false) {
  if (!(value instanceof File) || value.size === 0) throw new Error("Scegli un file da caricare.");
  if (presentation) {
    if (value.size > MAX_PRESENTATION_SIZE) throw new Error("Il file HTML supera il limite di 2 MB.");
    if (value.type !== "text/html" || !/\.html$/i.test(value.name)) {
      throw new Error("Scegli un file .html valido.");
    }
    return { file: value, extension: "html" };
  }
  if (value.size > MAX_FILE_SIZE) throw new Error("Il file supera il limite di 25 MB.");
  const extension = ALLOWED_FILES.get(value.type);
  if (!extension) throw new Error("Formato non consentito.");
  return { file: value, extension };
}

async function uploadObject(file: File, extension: string, presentation = false) {
  const objectPath = `${presentation ? PRESENTATION_PREFIX : ""}${crypto.randomUUID()}.${extension}`;
  const { error } = await admin.storage.from(BUCKET).upload(objectPath, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "0",
  });
  if (error) throw new Error("Caricamento del file non riuscito.");
  return objectPath;
}

async function logChange(documentId: string, action: string, details: Record<string, unknown>) {
  const { error } = await admin.from("orientamento_modifiche").insert({
    documento_id: documentId,
    azione: action,
    access_level: "orientatore",
    dettagli: details,
  });
  if (error) throw new Error("Registrazione della modifica non riuscita.");
}

async function uploadDocument(request: Request, payload: Record<string, unknown>, presentation = false) {
  try {
    const { file, extension } = validateFile(payload.file, presentation);
    const title = presentation ? PRESENTATION_TITLE : cleanString(payload.title, 300, true);
    const description = presentation ? PRESENTATION_DESCRIPTION : cleanString(payload.description, 2000);
    const visibility = presentation ? "tutti" : payload.visibility === "tutti" ? "tutti" : "orientatore";
    if (presentation) {
      const { data: existing, error: existingError } = await admin
        .from("orientamento_documenti")
        .select("id")
        .like("object_path", `${PRESENTATION_PREFIX}%`)
        .eq("attivo", true)
        .limit(1);
      if (existingError) throw new Error("Verifica della presentazione non riuscita.");
      if (existing?.length) throw new Error("La presentazione è già presente: usa Sostituisci.");
    }
    const objectPath = await uploadObject(file, extension, presentation);

    const { data: document, error: documentError } = await admin
      .from("orientamento_documenti")
      .insert({
        object_path: objectPath,
        titolo: title,
        descrizione: description,
        visibilita: visibility,
        created_by_level: "orientatore",
        updated_by_level: "orientatore",
      })
      .select("id,versione")
      .single();

    if (documentError || !document) {
      await admin.storage.from(BUCKET).remove([objectPath]);
      throw new Error("Registrazione del documento non riuscita.");
    }

    const { error: versionError } = await admin.from("orientamento_versioni").insert({
      documento_id: document.id,
      versione: document.versione,
      object_path: objectPath,
      original_name: cleanString(file.name, 500, true),
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by_level: "orientatore",
    });
    if (versionError) {
      await admin.from("orientamento_documenti").delete().eq("id", document.id);
      await admin.storage.from(BUCKET).remove([objectPath]);
      throw new Error("Registrazione della versione non riuscita.");
    }

    await logChange(document.id, "caricamento", { versione: document.versione, visibilita: visibility });
    return json(request, { ok: true, id: document.id });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Caricamento non riuscito." }, 400);
  }
}

async function replaceDocument(request: Request, payload: Record<string, unknown>, presentation = false) {
  try {
    const documentId = cleanString(payload.document_id, 50, true);
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("Documento non valido.");
    const { file, extension } = validateFile(payload.file, presentation);
    const { data: current, error: currentError } = await admin
      .from("orientamento_documenti")
      .select("id,versione,object_path")
      .eq("id", documentId)
      .eq("attivo", true)
      .maybeSingle();
    if (currentError || !current) throw new Error("Documento non disponibile.");
    if (presentation !== current.object_path.startsWith(PRESENTATION_PREFIX)) {
      throw new Error("Il tipo di documento non corrisponde.");
    }

    const objectPath = await uploadObject(file, extension, presentation);
    const nextVersion = current.versione + 1;
    const { error: updateError } = await admin
      .from("orientamento_documenti")
      .update({
        object_path: objectPath,
        versione: nextVersion,
        updated_by_level: "orientatore",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (updateError) {
      await admin.storage.from(BUCKET).remove([objectPath]);
      throw new Error("Sostituzione del documento non riuscita.");
    }

    const { error: versionError } = await admin.from("orientamento_versioni").insert({
      documento_id: documentId,
      versione: nextVersion,
      object_path: objectPath,
      original_name: cleanString(file.name, 500, true),
      content_type: file.type,
      size_bytes: file.size,
      uploaded_by_level: "orientatore",
    });
    if (versionError) {
      await admin
        .from("orientamento_documenti")
        .update({ object_path: current.object_path, versione: current.versione })
        .eq("id", documentId);
      await admin.storage.from(BUCKET).remove([objectPath]);
      throw new Error("Registrazione della versione non riuscita.");
    }

    await logChange(documentId, "sostituzione", { versione: nextVersion });
    return json(request, { ok: true, id: documentId, version: nextVersion });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Sostituzione non riuscita." }, 400);
  }
}

async function viewPresentation(
  request: Request,
  payload: Record<string, unknown>,
  accessLevel: AccessLevel,
) {
  const documentId = typeof payload.document_id === "string" ? payload.document_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return json(request, { error: "Presentazione non valida." }, 400);
  const { data: document, error } = await admin
    .from("orientamento_documenti")
    .select("object_path,visibilita")
    .eq("id", documentId)
    .eq("attivo", true)
    .maybeSingle();
  if (error || !document || !document.object_path.startsWith(PRESENTATION_PREFIX)) {
    return json(request, { error: "Presentazione non disponibile." }, 404);
  }
  if (accessLevel === "supporter" && document.visibilita !== "tutti") {
    return json(request, { error: "Accesso non consentito." }, 403);
  }
  const { data: file, error: downloadError } = await admin.storage.from(BUCKET).download(document.object_path);
  if (downloadError || !file || file.size > MAX_PRESENTATION_SIZE) {
    return json(request, { error: "Impossibile aprire la presentazione." }, 500);
  }
  return json(request, { html: await file.text() });
}

async function updateDocument(request: Request, payload: Record<string, unknown>) {
  try {
    const documentId = cleanString(payload.document_id, 50, true);
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error("Documento non valido.");
    const title = cleanString(payload.title, 300, true);
    const description = cleanString(payload.description, 2000);
    const visibility = payload.visibility === "tutti" ? "tutti" : "orientatore";
    const { data, error } = await admin
      .from("orientamento_documenti")
      .update({
        titolo: title,
        descrizione: description,
        visibilita: visibility,
        updated_by_level: "orientatore",
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId)
      .eq("attivo", true)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new Error("Aggiornamento non riuscito.");
    await logChange(documentId, "metadati", { visibilita: visibility });
    return json(request, { ok: true, id: documentId });
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : "Aggiornamento non riuscito." }, 400);
  }
}

async function archiveDocument(request: Request, payload: Record<string, unknown>) {
  const documentId = typeof payload.document_id === "string" ? payload.document_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) return json(request, { error: "Documento non valido." }, 400);
  const { data, error } = await admin
    .from("orientamento_documenti")
    .update({
      attivo: false,
      archived_at: new Date().toISOString(),
      updated_by_level: "orientatore",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("attivo", true)
    .select("id")
    .maybeSingle();
  if (error || !data) return json(request, { error: "Archiviazione non riuscita." }, 400);
  await logChange(documentId, "archiviazione", {});
  return json(request, { ok: true });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return json(request, { error: "Origine non autorizzata." }, 403);
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Metodo non consentito." }, 405);

  let payload: Record<string, unknown>;
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      payload = Object.fromEntries((await request.formData()).entries());
    } else {
      const body = await request.text();
      if (body.length > MAX_JSON_SIZE) return json(request, { error: "Richiesta troppo grande." }, 413);
      const parsed = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(request, { error: "Richiesta non valida." }, 400);
      payload = parsed;
    }
  } catch {
    return json(request, { error: "Richiesta non valida." }, 400);
  }

  const action = typeof payload.action === "string" ? payload.action : "";
  if (action === "login") return await login(request, payload);
  if (action === "submit_supporter") return await submitSupporter(request, payload);
  if (action === "submit_proposal") return await submitProposal(request, payload);
  if (action === "leaderboard") return await leaderboard(request);
  if (action === "report_activity") return await reportActivity(request, payload);

  const session = await verifySession(request);
  if (!session) return json(request, { error: "Sessione scaduta. Accedi di nuovo." }, 401);
  if (action === "session") return json(request, { ok: true, access_level: session.accessLevel });
  if (action === "list") return await listDocuments(request, session.accessLevel);
  if (action === "view_presentation") return await viewPresentation(request, payload, session.accessLevel);
  // La gestione di candidature, proposte e attività è riservata alla password personale della Funzione Strumentale.
  if (["list_contributions", "update_contribution", "register_activity", "archive_activity", "confirm_activity"].includes(action) && session.accessLevel !== "funzione_strumentale") {
    return json(request, { error: "Accesso riservato alla Funzione Strumentale." }, 403);
  }
  if (action === "list_contributions") return await listContributions(request);
  if (action === "update_contribution") return await updateContribution(request, payload);
  if (action === "register_activity") return await registerActivity(request, payload);
  if (action === "archive_activity") return await archiveActivity(request, payload);
  if (action === "confirm_activity") return await confirmActivity(request, payload);
  if (["upload", "replace", "upload_presentation", "replace_presentation", "update", "archive"].includes(action) && session.accessLevel === "supporter") {
    return json(request, { error: "Questa password consente soltanto la consultazione." }, 403);
  }
  if (action === "upload") return await uploadDocument(request, payload);
  if (action === "replace") return await replaceDocument(request, payload);
  if (action === "upload_presentation") return await uploadDocument(request, payload, true);
  if (action === "replace_presentation") return await replaceDocument(request, payload, true);
  if (action === "update") return await updateDocument(request, payload);
  if (action === "archive") return await archiveDocument(request, payload);
  if (action === "logout") {
    await admin.from("orientamento_sessioni").delete().eq("token_hash", session.tokenHash);
    return json(request, { ok: true });
  }
  return json(request, { error: "Azione non riconosciuta." }, 400);
});
