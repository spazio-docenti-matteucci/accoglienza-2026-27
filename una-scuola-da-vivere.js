const ORIENTATION_API = 'https://ruplzgcnheddmqqdephp.supabase.co/functions/v1/orientamento';
const MAX_SCHOOLS = 5;
const previewCatalog = document.getElementById('school-preview-data');

const supporterForm = document.getElementById('supporterForm');
const proposalForm = document.getElementById('proposalForm');
const schoolChoices = document.getElementById('schoolChoices');
const schoolError = document.getElementById('schoolError');

function setMessage(id, message, kind = '') {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `form-message ${kind}`;
  if (message) element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    if (!response.ok) throw new Error(result.error || 'Invio non riuscito. Riprova più tardi.');
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function selectedSchools() {
  return [...schoolChoices.querySelectorAll('input:checked')].map((input) => input.value);
}

function renderSchools(schools) {
  schoolChoices.replaceChildren();
  const groups = new Map();
  for (const school of schools) {
    const key = school.area === 'esterno' ? 'Altri comuni dell’elenco operativo' : 'Comuni rappresentati nella mappa del bacino';
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
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'scuole';
      input.value = school.id;
      const copy = document.createElement('span');
      const town = document.createElement('strong');
      town.textContent = school.comune;
      const name = document.createElement('small');
      name.textContent = school.etichetta;
      copy.append(town, name);
      label.append(input, copy);
      grid.append(label);
    }
    section.append(grid);
    schoolChoices.append(section);
  }
  schoolChoices.addEventListener('change', (event) => {
    const selected = selectedSchools();
    if (selected.length > MAX_SCHOOLS) event.target.checked = false;
    schoolError.hidden = selectedSchools().length > 0;
  });
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
  } catch {
    schoolChoices.textContent = 'L’elenco delle scuole non è disponibile. Riprova più tardi.';
    supporterForm.querySelector('button[type="submit"]').disabled = true;
  }
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
    const noun = action === 'submit_supporter' ? 'Disponibilità ricevuta' : 'Proposta ricevuta';
    setMessage(messageId, `${noun}. Codice ${result.codice}. La Commissione definirà successivamente attività, assegnazioni e date.`, 'success');
  } catch (error) {
    setMessage(messageId, error.name === 'AbortError' ? 'La richiesta ha impiegato troppo tempo. Verifica prima di inviarla di nuovo.' : error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

supporterForm.addEventListener('submit', (event) => submitForm(event, 'submit_supporter', 'supporterMessage'));
proposalForm.addEventListener('submit', (event) => submitForm(event, 'submit_proposal', 'proposalMessage'));
loadSchools();
