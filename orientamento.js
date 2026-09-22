const API_URL = 'https://ruplzgcnheddmqqdephp.supabase.co/functions/v1/orientamento';
const SESSION_KEY = 'mattei-orientamento-session';

const passwordForm = document.getElementById('passwordForm');
const passwordInput = document.getElementById('orientationPassword');
const loginPanel = document.getElementById('loginPanel');
const workspacePanel = document.getElementById('workspacePanel');
const accessMessage = document.getElementById('accessMessage');
const logoutButton = document.getElementById('logoutButton');
const resourceGrid = document.getElementById('resourceGrid');
const uploadPanel = document.getElementById('uploadPanel');
const uploadForm = document.getElementById('uploadForm');
const uploadMessage = document.getElementById('uploadMessage');
const roleBadge = document.getElementById('roleBadge');
const presentationUploadPanel = document.getElementById('presentationUploadPanel');
const presentationUploadForm = document.getElementById('presentationUploadForm');
const presentationUploadMessage = document.getElementById('presentationUploadMessage');
const presentationViewer = document.getElementById('presentationViewer');
const presentationFrame = document.getElementById('presentationFrame');
const presentationViewerTitle = document.getElementById('presentationViewerTitle');
const presentationViewerMessage = document.getElementById('presentationViewerMessage');
const closePresentationButton = document.getElementById('closePresentation');

let sessionToken = sessionStorage.getItem(SESSION_KEY) || '';
let accessLevel = '';
let presentationId = '';

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
  uploadPanel.hidden = level !== 'orientatore';
  presentationUploadPanel.hidden = level !== 'orientatore';
  roleBadge.textContent = level === 'orientatore' ? 'Accesso completo' : 'Materiali condivisi';
  roleBadge.className = `role-badge ${level}`;
  document.getElementById('workspaceTitle').focus({ preventScroll: true });
}

function resetSession() {
  closePresentation();
  presentationId = '';
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

async function replaceFile(item, input, status) {
  const file = input.files?.[0];
  if (!file) return;
  status.textContent = 'Sostituzione in corso…';
  const formData = new FormData();
  formData.set('document_id', item.id);
  formData.set('file', file);
  try {
    await api(item.kind === 'presentation' ? 'replace_presentation' : 'replace', {}, formData);
    status.textContent = 'Nuova versione caricata.';
    await loadDocuments();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    input.value = '';
  }
}

async function saveDocument(item, titleInput, descriptionInput, visibilitySelect, status) {
  status.textContent = 'Salvataggio…';
  try {
    await api('update', {
      document_id: item.id,
      title: titleInput.value,
      description: descriptionInput.value,
      visibility: visibilitySelect.value,
    });
    status.textContent = 'Modifiche salvate.';
    await loadDocuments();
  } catch (error) {
    status.textContent = error.message;
  }
}

async function archiveDocument(item, status) {
  if (!window.confirm(`Archiviare “${item.title}”? Il file resterà recuperabile.`)) return;
  status.textContent = 'Archiviazione…';
  try {
    await api('archive', { document_id: item.id });
    await loadDocuments();
  } catch (error) {
    status.textContent = error.message;
  }
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

  if (accessLevel === 'orientatore') {
    const manage = document.createElement('details');
    manage.className = 'document-manage';
    const summary = document.createElement('summary');
    summary.textContent = 'Gestisci';

    const titleInput = document.createElement('input');
    titleInput.value = item.title;
    titleInput.maxLength = 300;
    titleInput.setAttribute('aria-label', 'Titolo del documento');
    const descriptionInput = document.createElement('textarea');
    descriptionInput.value = item.description || '';
    descriptionInput.maxLength = 2000;
    descriptionInput.rows = 3;
    descriptionInput.setAttribute('aria-label', 'Descrizione del documento');
    const visibilitySelect = document.createElement('select');
    visibilitySelect.setAttribute('aria-label', 'Visibilità del documento');
    visibilitySelect.innerHTML = '<option value="orientatore">Solo orientatori</option><option value="tutti">Tutti i componenti</option>';
    visibilitySelect.value = item.visibility;

    const replacementInput = document.createElement('input');
    replacementInput.type = 'file';
    replacementInput.accept = item.kind === 'presentation' ? '.html,text/html' : '.pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.txt';
    replacementInput.className = 'replacement-input';
    replacementInput.setAttribute('aria-label', 'Sostituisci il file');

    const status = document.createElement('p');
    status.className = 'manage-status';
    status.setAttribute('role', 'status');
    replacementInput.addEventListener('change', () => replaceFile(item, replacementInput, status));

    const manageActions = document.createElement('div');
    manageActions.className = 'manage-actions';
    manageActions.append(
      createActionButton('Salva dati e accesso', 'save-button', () => saveDocument(item, titleInput, descriptionInput, visibilitySelect, status)),
      createActionButton('Archivia', 'archive-button', () => archiveDocument(item, status)),
    );
    manage.append(summary, titleInput, descriptionInput, visibilitySelect, replacementInput, manageActions, status);
    actions.append(manage);
  }

  card.append(actions);
  return card;
}

async function loadDocuments() {
  resourceGrid.textContent = 'Caricamento dei documenti…';
  try {
    const result = await api('list');
    presentationId = result.documents.find((item) => item.kind === 'presentation')?.id || '';
    resourceGrid.replaceChildren();
    if (!result.documents.length) {
      const empty = document.createElement('p');
      empty.className = 'resource-empty';
      empty.textContent = accessLevel === 'orientatore'
        ? 'Nessun documento caricato.'
        : 'Al momento non ci sono materiali condivisi con questo gruppo.';
      resourceGrid.append(empty);
      return;
    }
    result.documents.forEach((item) => resourceGrid.append(renderDocument(item)));
  } catch (error) {
    if (error.status === 401) resetSession();
    accessMessage.textContent = error.message;
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

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = uploadForm.querySelector('button');
  submitButton.disabled = true;
  uploadMessage.textContent = 'Caricamento in corso…';
  try {
    await api('upload', {}, new FormData(uploadForm));
    uploadForm.reset();
    uploadMessage.textContent = 'Documento caricato.';
    await loadDocuments();
  } catch (error) {
    uploadMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

presentationUploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = presentationUploadForm.querySelector('button');
  submitButton.disabled = true;
  presentationUploadMessage.textContent = 'Caricamento in corso…';
  try {
    const data = new FormData(presentationUploadForm);
    if (presentationId) data.set('document_id', presentationId);
    await api(presentationId ? 'replace_presentation' : 'upload_presentation', {}, data);
    presentationUploadForm.reset();
    presentationUploadMessage.textContent = 'Presentazione aggiornata.';
    await loadDocuments();
  } catch (error) {
    presentationUploadMessage.textContent = error.message;
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
