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
    const error = new Error(result.error || 'Non è stato possibile completare l’operazione. Riprova.');
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
  roleBadge.textContent = level === 'funzione_strumentale' ? 'Funzione Strumentale' : level === 'orientatore' ? 'Orientatore' : 'Componente';
  roleBadge.className = `role-badge ${level}`;
  document.getElementById('workspaceTitle').focus({ preventScroll: true });
}

function resetSession() {
  sessionToken = '';
  accessLevel = '';
  sessionStorage.removeItem(SESSION_KEY);
  resourceGrid.replaceChildren();
  workspacePanel.hidden = true;
  loginPanel.hidden = false;
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
  if (item.url) {
    const openLink = document.createElement('a');
    openLink.href = item.url;
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.textContent = 'Apri documento ↗';
    actions.append(openLink);
  } else {
    const unavailable = document.createElement('span');
    unavailable.textContent = 'Il file non è disponibile.';
    actions.append(unavailable);
  }

  card.append(actions);
  return card;
}

async function loadDocuments() {
  resourceGrid.textContent = 'Caricamento dei documenti…';
  try {
    const result = await api('list');
    const internalDocuments = result.documents.filter((item) => item.kind !== 'presentation');
    resourceGrid.replaceChildren();
    if (!internalDocuments.length) {
      const empty = document.createElement('p');
      empty.className = 'resource-empty';
      empty.textContent = 'Al momento non ci sono documenti interni disponibili.';
      resourceGrid.append(empty);
      return;
    }
    internalDocuments.forEach((item) => resourceGrid.append(renderDocument(item)));
  } catch (error) {
    if (error.status === 401) resetSession();
    else resourceGrid.textContent = error.message;
  }
}

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
    await loadDocuments();
  } catch (error) {
    accessMessage.textContent = error.message;
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
  }
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
      await loadDocuments();
    })
    .catch(() => resetSession());
}
