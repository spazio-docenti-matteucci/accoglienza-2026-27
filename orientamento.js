const API_URL = 'https://ruplzgcnheddmqqdephp.supabase.co/functions/v1/orientamento';
const SESSION_KEY = 'mattei-orientamento-session';

const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('orientationPassword');
const loginPanel = document.getElementById('loginPanel');
const workspacePanel = document.getElementById('workspacePanel');
const accessMessage = document.getElementById('accessMessage');
const logoutButton = document.getElementById('logoutButton');
const resourceGrid = document.getElementById('resourceGrid');
const roleBadge = document.getElementById('roleBadge');
const presentationViewer = document.getElementById('presentationViewer');
const presentationFrame = document.getElementById('presentationFrame');
const presentationViewerTitle = document.getElementById('presentationViewerTitle');
const presentationViewerMessage = document.getElementById('presentationViewerMessage');
const closePresentationButton = document.getElementById('closePresentation');
const contributionPanel = document.getElementById('contributionPanel');
const contributionMessage = document.getElementById('contributionMessage');
const contributionSummary = document.getElementById('contributionSummary');
const coverageGrid = document.getElementById('coverageGrid');
const supporterList = document.getElementById('supporterList');
const proposalList = document.getElementById('proposalList');
const refreshContributionsButton = document.getElementById('refreshContributions');
const activityForm = document.getElementById('activityForm');
const activityType = document.getElementById('activityType');
const activitySchool = document.getElementById('activitySchool');
const activityMessage = document.getElementById('activityMessage');
const activityList = document.getElementById('activityList');
const adminRanking = document.getElementById('adminRanking');

let sessionToken = sessionStorage.getItem(SESSION_KEY) || '';
let accessLevel = '';

async function api(action, payload = {}, formData = null) {
  const headers = {};
  let body;
  if (sessionToken) headers['x-orientamento-session'] = sessionToken;

  if (formData) {
    formData.set('action', action);
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ action, ...payload });
  }

  const response = await fetch(API_URL, { method: 'POST', headers, body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Operazione non riuscita.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function setAuthenticated(level) {
  accessLevel = level;
  loginPanel.hidden = true;
  workspacePanel.hidden = false;
  roleBadge.textContent = level === 'orientatore' ? 'Orientatore' : 'Componente';
  roleBadge.className = `role-badge ${level}`;
  contributionPanel.hidden = level !== 'orientatore';
  document.getElementById('workspaceTitle').focus({ preventScroll: true });
}

function resetSession() {
  closePresentation();
  sessionToken = '';
  accessLevel = '';
  sessionStorage.removeItem(SESSION_KEY);
  resourceGrid.replaceChildren();
  contributionPanel.hidden = true;
  contributionSummary.replaceChildren();
  coverageGrid.replaceChildren();
  supporterList.replaceChildren();
  proposalList.replaceChildren();
  activityList.replaceChildren();
  adminRanking.replaceChildren();
  workspacePanel.hidden = true;
  loginPanel.hidden = false;
}

function closePresentation() {
  presentationFrame.removeAttribute('srcdoc');
  presentationViewer.hidden = true;
}

async function openPresentation(item) {
  presentationViewerTitle.textContent = item.title;
  presentationViewerMessage.textContent = 'Caricamento della presentazione…';
  presentationFrame.removeAttribute('srcdoc');
  presentationViewer.hidden = false;
  closePresentationButton.focus();
  try {
    const result = await api('view_presentation', { document_id: item.id });
    if (presentationViewer.hidden) return;
    presentationFrame.srcdoc = result.html;
    presentationViewerMessage.textContent = '';
  } catch (error) {
    presentationViewerMessage.textContent = error.message;
    if (error.status === 401) resetSession();
  }
}

function createActionButton(label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

function renderDocument(item) {
  const card = document.createElement('article');
  card.className = 'resource-card';

  const title = document.createElement('h3');
  title.textContent = item.title;
  const description = document.createElement('p');
  description.textContent = item.description || 'Documento condiviso dalla Commissione Orientamento.';
  const meta = document.createElement('p');
  meta.className = 'resource-meta';
  meta.textContent = `Versione ${item.version} · ${formatDate(item.updated_at)}`;
  card.append(title, description, meta);

  const actions = document.createElement('div');
  actions.className = 'document-actions';
  if (item.kind === 'presentation') {
    const openButton = createActionButton('Apri presentazione', 'presentation-open', () => openPresentation(item));
    actions.append(openButton);
  } else if (item.url) {
    const openLink = document.createElement('a');
    openLink.href = item.url;
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.textContent = 'Apri documento ↗';
    actions.append(openLink);
  } else {
    const unavailable = document.createElement('span');
    unavailable.textContent = 'File non disponibile';
    actions.append(unavailable);
  }

  card.append(actions);
  return card;
}

async function loadDocuments() {
  resourceGrid.textContent = 'Caricamento della presentazione…';
  try {
    const result = await api('list');
    resourceGrid.replaceChildren();
    if (!result.documents.length) {
      const empty = document.createElement('p');
      empty.className = 'resource-empty';
      empty.textContent = 'La presentazione non è disponibile.';
      resourceGrid.append(empty);
      return;
    }
    result.documents.forEach((item) => resourceGrid.append(renderDocument(item)));
    const presentation = result.documents.find((item) => item.kind === 'presentation');
    if (presentation) await openPresentation(presentation);
  } catch (error) {
    if (error.status === 401) resetSession();
    else resourceGrid.textContent = error.message;
  }
}

function contributionText(label, value) {
  const line = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  line.append(strong, document.createTextNode(value || '—'));
  return line;
}

function statusControl(kind, item, options) {
  const label = document.createElement('label');
  label.className = 'contribution-status';
  label.textContent = 'Stato';
  const select = document.createElement('select');
  for (const [value, text] of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = item.stato;
  select.addEventListener('change', async () => {
    const previous = item.stato;
    select.disabled = true;
    contributionMessage.textContent = 'Salvataggio in corso…';
    try {
      await api('update_contribution', { kind, id: item.id, stato: select.value });
      item.stato = select.value;
      contributionMessage.textContent = 'Stato aggiornato.';
      await loadContributions();
    } catch (error) {
      select.value = previous;
      contributionMessage.textContent = error.message;
      if (error.status === 401) resetSession();
    } finally {
      select.disabled = false;
    }
  });
  label.append(select);
  return label;
}

function renderContributions(data) {
  const schoolNames = new Map(data.scuole.map((school) => [school.id, `${school.comune} · ${school.etichetta}`]));
  contributionSummary.replaceChildren();
  for (const [value, label] of [
    [data.scuole.length, 'scuole e sedi nell’elenco'],
    [data.disponibilita.length, 'disponibilità ricevute'],
    [data.proposte.length, 'proposte Mattinée diffuse'],
    [(data.attivita || []).length, 'attività svolte registrate'],
  ]) {
    const metric = document.createElement('div');
    const number = document.createElement('strong');
    number.textContent = String(value);
    const caption = document.createElement('span');
    caption.textContent = label;
    metric.append(number, caption);
    contributionSummary.append(metric);
  }

  coverageGrid.replaceChildren();
  for (const school of data.scuole) {
    const matches = data.disponibilita.filter((item) => item.stato !== 'archiviata' && item.scuole.includes(school.id));
    const assigned = matches.some((item) => item.stato === 'assegnata');
    const card = document.createElement('div');
    card.className = `coverage-card ${assigned ? 'assigned' : matches.length ? 'offered' : ''}`;
    const title = document.createElement('strong');
    title.textContent = `${school.comune} · ${school.etichetta}`;
    const state = document.createElement('span');
    state.textContent = assigned ? 'Supporter assegnato' : matches.length ? `${matches.length} disponibilità` : 'Nessuna disponibilità';
    card.append(title, state);
    coverageGrid.append(card);
  }

  supporterList.replaceChildren();
  if (!data.disponibilita.length) supporterList.textContent = 'Nessuna disponibilità ricevuta.';
  for (const item of data.disponibilita) {
    const card = document.createElement('article');
    card.className = 'contribution-card';
    const title = document.createElement('h5');
    title.textContent = `${item.nome} ${item.cognome}`;
    const meta = document.createElement('small');
    meta.textContent = `${formatDate(item.created_at)} · Codice ${item.id.slice(0, 8).toUpperCase()}`;
    card.append(title, meta,
      contributionText('Scuole', item.scuole.map((id) => schoolNames.get(id) || id).join('; ')));
    if (item.nota) card.append(contributionText('Nota', item.nota));
    card.append(statusControl('supporter', item, [
      ['ricevuta', 'Disponibilità ricevuta'], ['assegnata', 'Supporter assegnato'], ['archiviata', 'Archiviata'],
    ]));
    supporterList.append(card);
  }

  proposalList.replaceChildren();
  if (!data.proposte.length) proposalList.textContent = 'Nessuna proposta ricevuta.';
  const types = { laboratorio: 'Laboratorio', lezione_aperta: 'Lezione aperta', esperienza_pratica: 'Esperienza pratica', dimostrazione: 'Dimostrazione', interdisciplinare: 'Attività interdisciplinare', altro: 'Altro' };
  for (const item of data.proposte) {
    const card = document.createElement('article');
    card.className = 'contribution-card';
    const title = document.createElement('h5');
    title.textContent = item.titolo;
    const meta = document.createElement('small');
    meta.textContent = `${item.nome} ${item.cognome} · ${formatDate(item.created_at)} · Codice ${item.id.slice(0, 8).toUpperCase()}`;
    card.append(title, meta,
      contributionText('Area', item.area),
      contributionText('Tipologia e durata', `${types[item.tipologia] || item.tipologia} · ${item.durata_minuti} minuti`),
      contributionText('Attività', item.descrizione));
    if (item.partecipanti) card.append(contributionText('Partecipanti indicativi', String(item.partecipanti)));
    if (item.esigenze) card.append(contributionText('Spazi e attrezzature', item.esigenze));
    if (item.nota) card.append(contributionText('Note', item.nota));
    card.append(statusControl('proposta', item, [
      ['ricevuta', 'Proposta ricevuta'], ['in_valutazione', 'In valutazione'],
      ['approvata', 'Approvata'], ['archiviata', 'Archiviata'],
    ]));
    proposalList.append(card);
  }

  renderActivities(data, schoolNames);
}

function fillDatalist(id, values) {
  const list = document.getElementById(id);
  list.replaceChildren();
  for (const value of [...new Set(values)].sort((a, b) => a.localeCompare(b, 'it'))) {
    const option = document.createElement('option');
    option.value = value;
    list.append(option);
  }
}

function renderActivities(data, schoolNames) {
  const current = activitySchool.value;
  activitySchool.replaceChildren();
  for (const school of data.scuole) {
    const option = document.createElement('option');
    option.value = school.id;
    option.textContent = `${school.comune} · ${school.etichetta}`;
    activitySchool.append(option);
  }
  if (current) activitySchool.value = current;

  const people = [...data.disponibilita, ...data.proposte, ...(data.attivita || [])];
  fillDatalist('teacherNames', people.map((item) => item.nome));
  fillDatalist('teacherSurnames', people.map((item) => item.cognome));

  adminRanking.replaceChildren();
  if (!data.classifica?.length) adminRanking.textContent = 'Ancora nessun punto assegnato.';
  for (const entry of data.classifica || []) {
    const row = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = `${entry.nome} ${entry.cognome}`;
    const detail = document.createElement('span');
    detail.textContent = `${entry.punti} pt · ${entry.livello} · ${entry.visite} visite · ${entry.mattinee} Mattinée${entry.consenso ? '' : ' · non in classifica pubblica'}`;
    row.append(name, detail);
    adminRanking.append(row);
  }

  activityList.replaceChildren();
  if (!data.attivita?.length) activityList.textContent = 'Nessuna attività registrata.';
  for (const item of data.attivita || []) {
    const card = document.createElement('article');
    card.className = 'contribution-card';
    const title = document.createElement('h5');
    title.textContent = `${item.tipo === 'visita' ? '🧭 Visita' : '🔬 Mattinée'} · ${item.nome} ${item.cognome}`;
    const meta = document.createElement('small');
    meta.textContent = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(`${item.data}T12:00:00`));
    card.append(title, meta);
    if (item.tipo === 'visita') card.append(contributionText('Scuola', schoolNames.get(item.scuola_id) || item.scuola_id));
    if (item.titolo) card.append(contributionText('Titolo', item.titolo));
    if (item.nota) card.append(contributionText('Nota', item.nota));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'activity-remove';
    remove.textContent = 'Annulla registrazione';
    remove.addEventListener('click', async () => {
      if (!window.confirm('Annullare questa registrazione? I punti verranno tolti dalla classifica.')) return;
      remove.disabled = true;
      try {
        await api('archive_activity', { id: item.id });
        activityMessage.textContent = 'Registrazione annullata.';
        await loadContributions();
      } catch (error) {
        activityMessage.textContent = error.message;
        remove.disabled = false;
        if (error.status === 401) resetSession();
      }
    });
    card.append(remove);
    activityList.append(card);
  }
}

function syncActivityType() {
  const isVisit = activityType.value === 'visita';
  document.getElementById('activitySchoolField').hidden = !isVisit;
  document.getElementById('activityTitleField').hidden = isVisit;
  activitySchool.required = isVisit;
}

activityType.addEventListener('change', syncActivityType);
activityForm.elements.data.value = new Date().toISOString().slice(0, 10);
syncActivityType();

activityForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!activityForm.reportValidity()) return;
  const data = Object.fromEntries(new FormData(activityForm).entries());
  data.in_classifica = activityForm.elements.in_classifica.checked;
  if (data.tipo !== 'visita') delete data.scuola_id;
  const button = activityForm.querySelector('button[type="submit"]');
  button.disabled = true;
  activityMessage.textContent = 'Registrazione in corso…';
  try {
    await api('register_activity', data);
    activityMessage.textContent = `Registrato: punti assegnati a ${data.nome} ${data.cognome}.`;
    for (const name of ['nome', 'cognome', 'nota', 'titolo']) activityForm.elements[name].value = '';
    activityForm.elements.in_classifica.checked = false;
    await loadContributions();
  } catch (error) {
    activityMessage.textContent = error.message;
    if (error.status === 401) resetSession();
  } finally {
    button.disabled = false;
  }
});

async function loadContributions() {
  if (accessLevel !== 'orientatore') return;
  refreshContributionsButton.disabled = true;
  contributionMessage.textContent = 'Caricamento delle disponibilità…';
  try {
    const data = await api('list_contributions');
    renderContributions(data);
    contributionMessage.textContent = '';
  } catch (error) {
    contributionMessage.textContent = error.message;
    if (error.status === 401) resetSession();
  } finally {
    refreshContributionsButton.disabled = false;
  }
}

refreshContributionsButton.addEventListener('click', loadContributions);

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = passwordForm.querySelector('button');
  submitButton.disabled = true;
  accessMessage.textContent = 'Verifica in corso…';
  try {
    const result = await api('login', { password: passwordInput.value });
    sessionToken = result.token;
    sessionStorage.setItem(SESSION_KEY, sessionToken);
    passwordInput.value = '';
    accessMessage.textContent = '';
    setAuthenticated(result.access_level);
    await Promise.all([loadDocuments(), loadContributions()]);
  } catch (error) {
    accessMessage.textContent = error.message;
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
  }
});

closePresentationButton.addEventListener('click', closePresentation);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !presentationViewer.hidden) closePresentation();
});

logoutButton.addEventListener('click', async () => {
  try { await api('logout'); } catch { /* La sessione locale viene chiusa comunque. */ }
  resetSession();
  passwordInput.focus();
});

if (sessionToken) {
  api('session')
    .then(async (result) => {
      setAuthenticated(result.access_level);
      await Promise.all([loadDocuments(), loadContributions()]);
    })
    .catch(() => resetSession());
}
