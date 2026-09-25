const API_URL = 'https://ruplzgcnheddmqqdephp.supabase.co/functions/v1/orientamento';
const SESSION_KEY = 'mattei-gestione-session';

const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('managePassword');
const loginPanel = document.getElementById('loginPanel');
const workspacePanel = document.getElementById('workspacePanel');
const accessMessage = document.getElementById('accessMessage');
const globalMessage = document.getElementById('globalMessage');
const refreshButton = document.getElementById('refreshButton');
const activityForm = document.getElementById('activityForm');
const activityType = document.getElementById('activityType');
const activitySchool = document.getElementById('activitySchool');
const activityMessage = document.getElementById('activityMessage');

const PROPOSAL_TYPES = { laboratorio: 'Laboratorio', lezione_aperta: 'Lezione aperta', esperienza_pratica: 'Esperienza pratica', dimostrazione: 'Dimostrazione', interdisciplinare: 'Attività interdisciplinare', altro: 'Altro' };
const SUPPORTER_STATES = { ricevuta: 'Da valutare', assegnata: 'Accettata', archiviata: 'Rimossa' };
const PROPOSAL_STATES = { ricevuta: 'Da valutare', in_valutazione: 'In valutazione', approvata: 'Approvata', archiviata: 'Rimossa' };

let sessionToken = sessionStorage.getItem(SESSION_KEY) || '';
let data = null;
const filters = { candidature: 'ricevuta', proposte: 'aperte' };

async function api(action, payload = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['x-orientamento-session'] = sessionToken;
  const response = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'Operazione non riuscita.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value, withTime = true) {
  const options = withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' };
  return new Intl.DateTimeFormat('it-IT', options).format(new Date(value));
}

function line(label, value) {
  const p = el('p');
  p.append(el('strong', '', `${label}: `), document.createTextNode(value || '—'));
  return p;
}

function showWorkspace() {
  loginPanel.hidden = true;
  workspacePanel.hidden = false;
  document.getElementById('workspaceTitle').focus({ preventScroll: true });
}

function resetSession() {
  sessionToken = '';
  data = null;
  sessionStorage.removeItem(SESSION_KEY);
  workspacePanel.hidden = true;
  loginPanel.hidden = false;
}

function handleError(error, target = globalMessage) {
  target.textContent = error.message;
  if (error.status === 401 || error.status === 403) resetSession();
  if (error.status === 403) accessMessage.textContent = 'Questa password non dà accesso alla gestione orientamento.';
}

async function setState(kind, item, stato, button) {
  button.disabled = true;
  globalMessage.textContent = 'Salvataggio…';
  try {
    await api('update_contribution', { kind, id: item.id, stato });
    globalMessage.textContent = `Fatto: ${item.nome} ${item.cognome} → ${(kind === 'supporter' ? SUPPORTER_STATES : PROPOSAL_STATES)[stato]}.`;
    await load();
  } catch (error) {
    button.disabled = false;
    handleError(error);
  }
}

function actionButton(label, className, handler) {
  const button = el('button', `act ${className}`, label);
  button.type = 'button';
  button.addEventListener('click', () => handler(button));
  return button;
}

function stateTag(text, state) {
  return el('span', `state state-${state}`, text);
}

function renderSummary() {
  const summary = document.getElementById('summary');
  summary.replaceChildren();
  const pendingSupporters = data.disponibilita.filter((item) => item.stato === 'ricevuta').length;
  const pendingProposals = data.proposte.filter((item) => ['ricevuta', 'in_valutazione'].includes(item.stato)).length;
  const visited = new Set(data.attivita.filter((item) => item.tipo === 'visita').map((item) => item.scuola_id));
  for (const [value, label, hot] of [
    [pendingSupporters, 'candidature da valutare', pendingSupporters > 0],
    [pendingProposals, 'proposte da valutare', pendingProposals > 0],
    [`${visited.size}/${data.scuole.length}`, 'scuole visitate', false],
    [data.attivita.length, 'attività registrate', false],
  ]) {
    const box = el('div', hot ? 'hot' : '');
    box.append(el('strong', '', String(value)), el('span', '', label));
    summary.append(box);
  }
  document.getElementById('countCandidature').textContent = pendingSupporters ? String(pendingSupporters) : '';
  document.getElementById('countProposte').textContent = pendingProposals ? String(pendingProposals) : '';
}

function renderSupporters(schoolNames) {
  const list = document.getElementById('supporterList');
  list.replaceChildren();
  const items = data.disponibilita.filter((item) => filters.candidature === 'tutte' || item.stato === filters.candidature);
  if (!items.length) list.append(el('p', 'empty', 'Nessuna candidatura in questa sezione.'));
  for (const item of items) {
    const card = el('article', 'review-card');
    const head = el('div', 'review-head');
    head.append(el('h4', '', `${item.nome} ${item.cognome}`), stateTag(SUPPORTER_STATES[item.stato], item.stato));
    card.append(head, el('small', '', `${formatDate(item.created_at)} · Codice ${item.id.slice(0, 8).toUpperCase()} · ${item.in_classifica ? 'in classifica pubblica' : 'non in classifica pubblica'}`));
    const chips = el('div', 'chips');
    for (const id of item.scuole) chips.append(el('span', '', schoolNames.get(id) || id));
    card.append(chips);
    if (item.nota) card.append(line('Nota', item.nota));
    const actions = el('div', 'review-actions');
    if (item.stato !== 'assegnata') actions.append(actionButton('✓ Accetta', 'ok', (b) => setState('supporter', item, 'assegnata', b)));
    if (item.stato !== 'archiviata') actions.append(actionButton('✕ Rimuovi', 'no', (b) => setState('supporter', item, 'archiviata', b)));
    if (item.stato !== 'ricevuta') actions.append(actionButton('↺ Rimetti da valutare', 'neutral', (b) => setState('supporter', item, 'ricevuta', b)));
    card.append(actions);
    list.append(card);
  }
}

function renderProposals() {
  const list = document.getElementById('proposalList');
  list.replaceChildren();
  const items = data.proposte.filter((item) => filters.proposte === 'tutte' ||
    (filters.proposte === 'aperte' ? ['ricevuta', 'in_valutazione'].includes(item.stato) : item.stato === filters.proposte));
  if (!items.length) list.append(el('p', 'empty', 'Nessuna proposta in questa sezione.'));
  for (const item of items) {
    const card = el('article', 'review-card');
    const head = el('div', 'review-head');
    head.append(el('h4', '', item.titolo), stateTag(PROPOSAL_STATES[item.stato], item.stato));
    card.append(head, el('small', '', `${item.nome} ${item.cognome} · ${formatDate(item.created_at)} · Codice ${item.id.slice(0, 8).toUpperCase()}`),
      line('Area', item.area),
      line('Tipologia e durata', `${PROPOSAL_TYPES[item.tipologia] || item.tipologia} · ${item.durata_minuti} minuti`),
      line('Che cosa fanno i ragazzi', item.descrizione));
    if (item.partecipanti) card.append(line('Partecipanti indicativi', String(item.partecipanti)));
    if (item.esigenze) card.append(line('Spazi e attrezzature', item.esigenze));
    if (item.nota) card.append(line('Note', item.nota));
    const actions = el('div', 'review-actions');
    if (item.stato !== 'approvata') actions.append(actionButton('✓ Approva', 'ok', (b) => setState('proposta', item, 'approvata', b)));
    if (item.stato === 'ricevuta') actions.append(actionButton('⏳ In valutazione', 'neutral', (b) => setState('proposta', item, 'in_valutazione', b)));
    if (item.stato !== 'archiviata') actions.append(actionButton('✕ Rimuovi', 'no', (b) => setState('proposta', item, 'archiviata', b)));
    if (item.stato === 'archiviata' || item.stato === 'approvata') actions.append(actionButton('↺ Rimetti da valutare', 'neutral', (b) => setState('proposta', item, 'ricevuta', b)));
    card.append(actions);
    list.append(card);
  }
}

function renderSchools() {
  const board = document.getElementById('schoolBoard');
  board.replaceChildren();
  for (const school of data.scuole) {
    const candidates = data.disponibilita.filter((item) => item.stato !== 'archiviata' && item.scuole.includes(school.id));
    const visits = data.attivita.filter((item) => item.tipo === 'visita' && item.scuola_id === school.id);
    const accepted = candidates.filter((item) => item.stato === 'assegnata');
    const card = el('article', `school-card ${visits.length ? 'visited' : accepted.length ? 'accepted' : candidates.length ? 'offered' : ''}`);
    card.append(el('h4', '', school.comune), el('small', '', school.etichetta));
    const status = visits.length ? `✅ Visitata (${visits.length})` : accepted.length ? '👍 Docente accettato' : candidates.length ? '🔥 Candidature da valutare' : '— Nessun candidato';
    card.append(el('p', 'school-status', status));
    const names = el('ul');
    for (const item of candidates) names.append(el('li', item.stato === 'assegnata' ? 'accepted' : '', `${item.nome} ${item.cognome}${item.stato === 'assegnata' ? ' ✓' : ''}`));
    if (candidates.length) card.append(names);
    board.append(card);
  }
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

function renderActivities(schoolNames) {
  const current = activitySchool.value;
  activitySchool.replaceChildren();
  for (const school of data.scuole) {
    const option = document.createElement('option');
    option.value = school.id;
    option.textContent = `${school.comune} · ${school.etichetta}`;
    activitySchool.append(option);
  }
  if (current) activitySchool.value = current;
  const people = [...data.disponibilita, ...data.proposte, ...data.attivita];
  fillDatalist('teacherNames', people.map((item) => item.nome));
  fillDatalist('teacherSurnames', people.map((item) => item.cognome));

  const list = document.getElementById('activityList');
  list.replaceChildren();
  if (!data.attivita.length) list.append(el('p', 'empty', 'Nessuna attività registrata.'));
  for (const item of data.attivita) {
    const card = el('article', 'review-card');
    card.append(el('h4', '', `${item.tipo === 'visita' ? '🧭 Visita' : '🔬 Mattinée'} · ${item.nome} ${item.cognome}`),
      el('small', '', formatDate(`${item.data}T12:00:00`, false)));
    if (item.tipo === 'visita') card.append(line('Scuola', schoolNames.get(item.scuola_id) || item.scuola_id));
    if (item.titolo) card.append(line('Titolo', item.titolo));
    if (item.nota) card.append(line('Nota', item.nota));
    const actions = el('div', 'review-actions');
    actions.append(actionButton('Annulla registrazione', 'no', async (button) => {
      if (!window.confirm('Annullare questa registrazione? I punti verranno tolti dalla classifica.')) return;
      button.disabled = true;
      try {
        await api('archive_activity', { id: item.id });
        activityMessage.textContent = 'Registrazione annullata.';
        await load();
      } catch (error) {
        button.disabled = false;
        handleError(error, activityMessage);
      }
    }));
    card.append(actions);
    list.append(card);
  }
}

function renderRanking() {
  const list = document.getElementById('adminRanking');
  list.replaceChildren();
  if (!data.classifica.length) list.append(el('p', 'empty', 'Ancora nessun punto assegnato.'));
  for (const entry of data.classifica) {
    const row = el('li');
    row.append(el('strong', '', `${entry.nome} ${entry.cognome}`),
      el('span', '', `${entry.punti} pt · ${entry.livello} · ${entry.visite} visite · ${entry.mattinee} Mattinée · ${entry.proposte} proposte${entry.consenso ? '' : ' · non in classifica pubblica'}`));
    list.append(row);
  }
}

function render() {
  const schoolNames = new Map(data.scuole.map((school) => [school.id, `${school.comune} · ${school.etichetta}`]));
  renderSummary();
  renderSupporters(schoolNames);
  renderProposals();
  renderSchools();
  renderActivities(schoolNames);
  renderRanking();
}

async function load() {
  refreshButton.disabled = true;
  try {
    const result = await api('list_contributions');
    data = { ...result, attivita: result.attivita || [], classifica: result.classifica || [] };
    render();
    if (globalMessage.textContent === 'Caricamento…') globalMessage.textContent = '';
  } catch (error) {
    handleError(error);
  } finally {
    refreshButton.disabled = false;
  }
}

async function enter() {
  const session = await api('session');
  if (session.access_level !== 'orientatore') {
    try { await api('logout'); } catch { /* sessione chiusa comunque */ }
    const error = new Error('Questa password non dà accesso alla gestione orientamento.');
    error.status = 403;
    throw error;
  }
  showWorkspace();
  globalMessage.textContent = 'Caricamento…';
  await load();
}

for (const tab of document.querySelectorAll('[role="tab"]')) {
  tab.addEventListener('click', () => {
    for (const other of document.querySelectorAll('[role="tab"]')) other.setAttribute('aria-selected', String(other === tab));
    for (const panel of document.querySelectorAll('.tab-panel')) panel.hidden = panel.dataset.panel !== tab.dataset.tab;
  });
}

for (const group of document.querySelectorAll('.filters')) {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    for (const other of group.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
    filters[group.dataset.filterFor] = button.dataset.filter;
    if (!data) return;
    if (group.dataset.filterFor === 'candidature') renderSupporters(new Map(data.scuole.map((s) => [s.id, `${s.comune} · ${s.etichetta}`])));
    else renderProposals();
  });
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
  const payload = Object.fromEntries(new FormData(activityForm).entries());
  payload.in_classifica = activityForm.elements.in_classifica.checked;
  if (payload.tipo !== 'visita') delete payload.scuola_id;
  const button = activityForm.querySelector('button[type="submit"]');
  button.disabled = true;
  activityMessage.textContent = 'Registrazione in corso…';
  try {
    await api('register_activity', payload);
    activityMessage.textContent = `Registrato: punti assegnati a ${payload.nome} ${payload.cognome}.`;
    for (const name of ['nome', 'cognome', 'nota', 'titolo']) activityForm.elements[name].value = '';
    activityForm.elements.in_classifica.checked = false;
    await load();
  } catch (error) {
    handleError(error, activityMessage);
  } finally {
    button.disabled = false;
  }
});

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
    await enter();
  } catch (error) {
    resetSession();
    accessMessage.textContent = error.message;
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener('click', load);
document.getElementById('logoutButton').addEventListener('click', async () => {
  try { await api('logout'); } catch { /* la sessione locale viene chiusa comunque */ }
  resetSession();
  passwordInput.focus();
});

if (sessionToken) enter().catch(() => resetSession());
