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
  document.getElementById('workspaceTitle').focus({ preventScroll: true });
}

function resetSession() {
  closePresentation();
  sessionToken = '';
  accessLevel = '';
  sessionStorage.removeItem(SESSION_KEY);
  resourceGrid.replaceChildren();
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
      await loadDocuments();
    })
    .catch(() => resetSession());
}
