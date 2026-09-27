const ORIENTATION_API = 'https://ruplzgcnheddmqqdephp.supabase.co/functions/v1/orientamento';
const MAX_SCHOOLS = 5;
const previewCatalog = document.getElementById('school-preview-data');

const supporterForm = document.getElementById('supporterForm');
const proposalForm = document.getElementById('proposalForm');
const reportForm = document.getElementById('reportForm');
const reportType = document.getElementById('reportType');
const reportSchool = document.getElementById('reportSchool');
const schoolChoices = document.getElementById('schoolChoices');
const schoolError = document.getElementById('schoolError');
const schoolCounter = document.getElementById('schoolCounter');
const schoolSearch = document.getElementById('schoolSearch');
const schoolResults = document.getElementById('schoolResults');
const schoolFilterButtons = [...document.querySelectorAll('[data-school-filter]')];

let schoolStates = new Map();
let schoolFilter = 'all';

function setMessage(id, message, kind = '') {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `form-message ${kind}`;
  if (message) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }
}

async function send(action, data) {
  if (previewCatalog) throw new Error('Questa è un’anteprima: gli invii saranno attivi dopo la pubblicazione.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ORIENTATION_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Non è stato possibile inviare i dati. Riprova.');
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function selectedSchools() {
  return [...schoolChoices.querySelectorAll('input:checked')].map((input) => input.value);
}

function updateSchoolCounter() {
  const count = selectedSchools().length;
  schoolCounter.textContent = `${count} di ${MAX_SCHOOLS} scelte`;
  schoolCounter.classList.toggle('full', count === MAX_SCHOOLS);
}

function applySchoolStates() {
  for (const option of schoolChoices.querySelectorAll('.school-option')) {
    const state = schoolStates.get(option.dataset.school) || 'libera';
    option.dataset.state = state;
    const tag = option.querySelector('.school-tag');
    tag.textContent = state === 'visitata' ? 'Già visitata' : state === 'in_arrivo' ? 'Disponibilità presente' : 'Nessuna disponibilità';
  }
  filterSchoolChoices();
}

function normalize(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function filterSchoolChoices() {
  const term = normalize(schoolSearch?.value.trim() || '');
  let visible = 0;
  for (const option of schoolChoices.querySelectorAll('.school-option')) {
    const state = schoolStates.get(option.dataset.school) || 'libera';
    const matchesText = !term || option.dataset.search.includes(term);
    const matchesState = schoolFilter === 'all' || state === schoolFilter;
    option.hidden = !(matchesText && matchesState);
    if (!option.hidden) visible += 1;
  }
  for (const group of schoolChoices.querySelectorAll('.school-group')) {
    group.hidden = !group.querySelector('.school-option:not([hidden])');
  }
  if (schoolResults) {
    schoolResults.textContent = visible === 1 ? '1 scuola visibile' : `${visible} scuole visibili`;
  }
}

function renderSchools(schools) {
  schoolChoices.replaceChildren();
  const groups = new Map();
  for (const school of schools) {
    const key = school.area === 'esterno' ? 'Altri comuni dell’elenco operativo' : 'Comuni del bacino di Decimomannu';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(school);
  }
  for (const [groupName, items] of groups) {
    const section = document.createElement('div');
    section.className = 'school-group';
    const heading = document.createElement('h3');
    heading.textContent = groupName;
    section.append(heading);
    const grid = document.createElement('div');
    grid.className = 'school-grid';
    for (const school of items) {
      const label = document.createElement('label');
      label.className = 'school-option';
      label.dataset.school = school.id;
      label.dataset.search = normalize(`${school.comune} ${school.etichetta}`);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'scuole';
      input.value = school.id;
      const copy = document.createElement('span');
      const town = document.createElement('strong');
      town.textContent = school.comune;
      const name = document.createElement('small');
      name.textContent = school.etichetta;
      const tag = document.createElement('em');
      tag.className = 'school-tag';
      copy.append(town, name, tag);
      label.append(input, copy);
      grid.append(label);
    }
    section.append(grid);
    schoolChoices.append(section);
  }
  applySchoolStates();
  schoolChoices.addEventListener('change', (event) => {
    if (selectedSchools().length > MAX_SCHOOLS) event.target.checked = false;
    schoolError.hidden = selectedSchools().length > 0;
    updateSchoolCounter();
  });
  filterSchoolChoices();
}

function fillReportSchools(schools) {
  for (const school of schools) {
    const option = document.createElement('option');
    option.value = school.id;
    option.textContent = `${school.comune} · ${school.etichetta}`;
    reportSchool.append(option);
  }
}

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function syncReportType() {
  const isVisit = reportType.value === 'visita';
  document.getElementById('reportSchoolField').hidden = !isVisit;
  document.getElementById('reportTitleField').hidden = isVisit;
  reportSchool.required = isVisit;
}

function resetReportForm() {
  const today = localToday();
  reportForm.elements.data.max = today;
  reportForm.elements.data.value = today;
  syncReportType();
}

async function loadSchools() {
  try {
    let schools;
    if (previewCatalog) {
      schools = JSON.parse(previewCatalog.textContent);
    } else {
      const response = await fetch('scuole-orientamento.json?v=20260922-1', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      schools = await response.json();
    }
    if (!Array.isArray(schools) || !schools.length) throw new Error();
    renderSchools(schools);
    fillReportSchools(schools);
    return schools;
  } catch {
    schoolChoices.textContent = 'L’elenco delle scuole non è disponibile. Riprova più tardi.';
    supporterForm.querySelector('button[type="submit"]').disabled = true;
    return [];
  }
}

function setStat(name, value) {
  for (const element of document.querySelectorAll(`[data-stat="${name}"]`)) element.textContent = String(value);
}

function renderLights(schools) {
  const container = document.getElementById('schoolLights');
  container.replaceChildren();
  for (const school of schools) {
    const light = document.createElement('span');
    const state = schoolStates.get(school.id) || 'libera';
    light.className = `light ${state === 'visitata' ? 'lit' : state === 'in_arrivo' ? 'warm' : ''}`;
    light.textContent = school.comune;
    light.title = `${school.comune} · ${school.etichetta}`;
    container.append(light);
  }
}

function renderMission(total, visited, offered) {
  const percent = total ? Math.round((visited / total) * 100) : 0;
  document.getElementById('missionBar').style.width = `${percent}%`;
  const progress = document.getElementById('missionProgress');
  progress.setAttribute('aria-valuemax', String(total));
  progress.setAttribute('aria-valuenow', String(visited));
  const caption = document.getElementById('missionCaption');
  if (visited === 0) {
    caption.textContent = offered
      ? `Nessuna scuola è stata ancora visitata. Per ${offered} ${offered === 1 ? 'scuola è già presente una disponibilità' : 'scuole sono già presenti disponibilità'}.`
      : 'Nessuna scuola è stata ancora visitata.';
  } else if (visited === total) {
    caption.textContent = 'Tutte le scuole dell’elenco sono state raggiunte.';
  } else {
    caption.textContent = `${visited} su ${total} scuole raggiunte (${percent}%). Ne mancano ${total - visited}.`;
  }
}

async function loadOverview(schools) {
  try {
    if (previewCatalog) throw new Error();
    const data = await send('overview', {});
    schoolStates = new Map(data.scuole.map((school) => [school.id, school.stato]));
    for (const [key, value] of Object.entries(data.totali)) setStat(key, value);
    renderMission(data.totali.scuole, data.totali.scuole_visitate, data.totali.scuole_con_disponibilita);
  } catch {
    for (const key of ['scuole_visitate', 'scuole_con_disponibilita', 'mattinee_proposte']) setStat(key, 0);
    setStat('scuole', schools.length || 24);
    renderMission(schools.length || 24, 0, 0);
  }
  applySchoolStates();
  renderLights(schools);
}

function fields(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function submitForm(event, action, messageId) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = fields(form);
  if (action === 'submit_supporter') {
    data.scuole = selectedSchools();
    if (data.scuole.length < 1 || data.scuole.length > MAX_SCHOOLS) {
      schoolError.hidden = false;
      schoolChoices.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
  } else if (action === 'report_activity') {
    if (data.tipo !== 'visita') delete data.scuola_id;
  } else {
    data.durata_minuti = Number(data.durata_minuti);
    data.partecipanti = data.partecipanti ? Number(data.partecipanti) : null;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  setMessage(messageId, 'Invio in corso…');
  try {
    const result = await send(action, data);
    form.reset();
    schoolError.hidden = true;
    updateSchoolCounter();
    if (action === 'report_activity') resetReportForm();
    const text = {
      submit_supporter: `Disponibilità inviata. Codice: ${result.codice}. La Funzione Strumentale ti contatterà per concordare scuola, data e orario.`,
      submit_proposal: `Proposta inviata. Codice: ${result.codice}. La Commissione la valuterà e ti comunicherà l’esito.`,
      report_activity: `Attività registrata. Codice: ${result.codice}. Dopo la verifica della Funzione Strumentale entrerà nel riepilogo destinato alla Dirigente.`,
    }[action];
    setMessage(messageId, text, 'success');
    loadOverview(currentSchools);
  } catch (error) {
    setMessage(messageId, error.name === 'AbortError' ? 'La richiesta non ha ricevuto risposta. Prima di riprovare, verifica se la registrazione è già stata acquisita.' : error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function openActionPanel(hash = window.location.hash) {
  if (!hash) return;
  const panel = document.querySelector(hash);
  if (panel instanceof HTMLDetailsElement && panel.classList.contains('action-panel')) panel.open = true;
}

let currentSchools = [];
supporterForm.addEventListener('submit', (event) => submitForm(event, 'submit_supporter', 'supporterMessage'));
proposalForm.addEventListener('submit', (event) => submitForm(event, 'submit_proposal', 'proposalMessage'));
reportForm.addEventListener('submit', (event) => submitForm(event, 'report_activity', 'reportMessage'));
reportType.addEventListener('change', syncReportType);
schoolSearch.addEventListener('input', filterSchoolChoices);
for (const button of schoolFilterButtons) {
  button.addEventListener('click', () => {
    schoolFilter = button.dataset.schoolFilter;
    for (const other of schoolFilterButtons) other.setAttribute('aria-pressed', String(other === button));
    filterSchoolChoices();
  });
}
for (const panel of document.querySelectorAll('.action-panel')) {
  const label = panel.querySelector('.summary-action span');
  const syncLabel = () => { label.textContent = panel.open ? 'Chiudi il modulo' : 'Apri il modulo'; };
  panel.addEventListener('toggle', syncLabel);
  syncLabel();
}
for (const link of document.querySelectorAll('a[href^="#"]')) {
  link.addEventListener('click', () => openActionPanel(link.getAttribute('href')));
}
window.addEventListener('hashchange', () => openActionPanel());
resetReportForm();
loadSchools().then((schools) => {
  currentSchools = schools;
  return loadOverview(schools);
});
openActionPanel();
