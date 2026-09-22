import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const SESSION_HOURS = 12;
const SIGNED_URL_SECONDS = 300;
const BUCKET = "orientamento-riservato";
const PRESENTATION_PREFIX = "presentazioni/";
const PRESENTATION_TITLE = "Residenti in età di ingresso alla prima superiore · coorti 2008–2013";
const PRESENTATION_DESCRIPTION = "Analisi demografica dei comuni di provenienza degli iscritti alla sede di Decimomannu dell’IIS Meucci-Mattei. Fonte: ISTAT POSAS.";
const VALID_LEVELS = new Set(["orientatore", "supporter"]);
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
  return { tokenHash, accessLevel: data.access_level as "orientatore" | "supporter" };
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

async function listDocuments(request: Request, accessLevel: "orientatore" | "supporter") {
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
  accessLevel: "orientatore" | "supporter",
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
      payload = await request.json();
    }
  } catch {
    return json(request, { error: "Richiesta non valida." }, 400);
  }

  const action = typeof payload.action === "string" ? payload.action : "";
  if (action === "login") return await login(request, payload);

  const session = await verifySession(request);
  if (!session) return json(request, { error: "Sessione scaduta. Accedi di nuovo." }, 401);
  if (action === "session") return json(request, { ok: true, access_level: session.accessLevel });
  if (action === "list") return await listDocuments(request, session.accessLevel);
  if (action === "view_presentation") return await viewPresentation(request, payload, session.accessLevel);
  if (["upload", "replace", "upload_presentation", "replace_presentation", "update", "archive"].includes(action) && session.accessLevel !== "orientatore") {
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
