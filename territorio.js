const towns = [
  { name: 'Decimomannu', series: [71, 85, 64, 86, 70, 73], distance: 0, area: 'focus', x: 270, y: 280 },
  { name: 'Uta', series: [83, 86, 95, 85, 85, 84], distance: 2.8, area: 'focus', x: 252, y: 300 },
  { name: 'Assemini', series: [231, 258, 267, 209, 270, 193], distance: 4.3, area: 'focus', x: 300, y: 303 },
  { name: 'Villaspeciosa', series: [28, 25, 32, 31, 31, 29], distance: 4.9, area: 'focus', x: 214, y: 269 },
  { name: 'Decimoputzu', series: [34, 37, 34, 54, 35, 33], distance: 6.5, area: 'focus', x: 212, y: 245 },
  { name: 'San Sperate', series: [70, 92, 85, 74, 86, 77], distance: 6.7, area: 'focus', x: 282, y: 225 },
  { name: 'Villasor', series: [51, 59, 48, 52, 46, 57], distance: 8.1, area: 'focus', x: 232, y: 180 },
  { name: 'Sestu', series: [200, 224, 206, 219, 208, 192], distance: 13.9, area: 'other', x: 385, y: 292 },
  { name: 'Elmas', series: [88, 81, 97, 87, 75, 88], distance: 10, area: 'focus', x: 352, y: 335 },
  { name: 'Monastir', series: [29, 36, 41, 40, 39, 42], distance: 11.6, area: 'other', x: 334, y: 180 },
  { name: 'Serramanna', series: [77, 51, 78, 62, 79, 71], distance: 13.3, area: 'focus', x: 217, y: 132 },
  { name: 'Ussana', series: [42, 35, 39, 32, 31, 30], distance: 14.8, area: 'other', x: 352, y: 165 },
  { name: 'Capoterra', series: [243, 215, 214, 221, 216, 191], distance: 14.9, area: 'other', x: 265, y: 458 },
  { name: 'Nuraminis', series: [17, 17, 17, 20, 10, 17], distance: 15.3, area: 'other', x: 300, y: 114 },
  { name: 'Siliqua', series: [22, 20, 33, 29, 21, 36], distance: 17.8, area: 'focus', x: 110, y: 292 },
  { name: 'Samassi', series: [38, 39, 35, 31, 36, 35], distance: 19.8, area: 'focus', x: 187, y: 48 },
  { name: 'Serrenti', series: [39, 42, 43, 42, 32, 34], distance: 19.9, area: 'other', x: 282, y: 48 },
  { name: 'Vallermosa', series: [11, 15, 7, 20, 11, 10], distance: 20, area: 'other', x: 88, y: 180 },
  { name: 'Samatzai', series: [8, 5, 14, 11, 15, 10], distance: 20.2, area: 'other', x: 317, y: 93 }
];

const totals = [1382, 1422, 1449, 1405, 1396, 1302];
const map = document.getElementById('catchmentMap');
const schoolGroups = document.getElementById('schoolGroups');
const schoolNamesByTown = new Map();
const formatter = new Intl.NumberFormat('it-IT');
const svgNamespace = 'http://www.w3.org/2000/svg';

function formatNumber(value) {
  return formatter.format(value);
}

function formatPercent(first, last) {
  const value = ((last / first) - 1) * 100;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(svgNamespace, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function renderSeries(series) {
  const container = document.getElementById('detailSeries');
  container.replaceChildren();
  series.forEach((value, index) => {
    const cell = document.createElement('span');
    cell.textContent = `Coorte ${2008 + index}`;
    const count = document.createElement('b');
    count.textContent = formatNumber(value);
    cell.append(count);
    container.append(cell);
  });
}

function renderTown(town) {
  const current = town.series.at(-1);
  document.getElementById('detailArea').textContent = town.area === 'focus' ? 'Comune di provenienza degli iscritti' : 'Altro comune osservato';
  document.getElementById('detailTown').textContent = town.name;
  document.getElementById('detailValue').textContent = formatNumber(current);
  document.getElementById('detailDistance').textContent = `${town.distance.toLocaleString('it-IT', { minimumFractionDigits: 1 })} km`;
  document.getElementById('detailLongChange').textContent = formatPercent(town.series[0], current);
  renderSeries(town.series);

  const list = document.getElementById('detailSchools');
  list.replaceChildren();
  const schools = schoolNamesByTown.get(town.name) || [];
  const labels = schools.length ? schools : ['Nessuna sede indicata nell’elenco operativo.'];
  labels.forEach((label) => {
    const item = document.createElement('li');
    item.textContent = label;
    list.append(item);
  });

  document.querySelectorAll('.map-node').forEach((node) => {
    node.classList.toggle('selected', node.dataset.town === town.name);
    node.setAttribute('aria-pressed', String(node.dataset.town === town.name));
  });
}

function buildMap() {
  const center = { x: 270, y: 280 };
  [5, 10, 15, 20].forEach((distance) => {
    const ring = svgElement('circle', {
      cx: center.x,
      cy: center.y,
      r: distance * 10,
      fill: 'none',
      stroke: '#bac7cc',
      'stroke-width': '1',
      'stroke-dasharray': '4 6'
    });
    const label = svgElement('text', {
      x: center.x,
      y: center.y - (distance * 10) + 13,
      'text-anchor': 'middle',
      fill: '#6a7b82',
      'font-size': '10'
    });
    label.textContent = `${distance} km`;
    map.append(ring, label);
  });

  map.append(
    svgElement('path', { d: 'M420 402 L352 335 L300 303 L270 280 L232 180 L250 120 L232 48', fill: 'none', stroke: '#6f8791', 'stroke-width': '2', opacity: '.35' }),
    svgElement('path', { d: 'M270 280 L110 292 L40 298', fill: 'none', stroke: '#6f8791', 'stroke-width': '2', 'stroke-dasharray': '7 5', opacity: '.32' })
  );

  towns.forEach((town) => {
    const value = town.series.at(-1);
    const radius = 4.5 + (Math.sqrt(value) * .46);
    const group = svgElement('g', {
      class: 'map-node',
      tabindex: '0',
      role: 'button',
      'aria-label': `${town.name}: ${value} residenti di 12 anni`,
      'aria-pressed': 'false',
      'data-town': town.name,
      'data-area': town.area
    });
    const circle = svgElement('circle', {
      cx: town.x,
      cy: town.y,
      r: radius.toFixed(1),
      fill: town.area === 'focus' ? '#00823f' : '#a9bac1',
      stroke: '#fff',
      'stroke-width': '2',
      opacity: '.94'
    });
    const anchor = town.x < center.x ? 'end' : 'start';
    const offset = town.x < center.x ? -(radius + 5) : radius + 5;
    const label = svgElement('text', {
      x: town.x + offset,
      y: town.y + 4,
      'text-anchor': anchor,
      class: 'map-label'
    });
    label.textContent = anchor === 'end' ? `${town.name} · ${value}` : `${value} · ${town.name}`;
    group.append(circle, label);
    group.addEventListener('click', () => renderTown(town));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        renderTown(town);
      }
    });
    map.append(group);
  });

  document.querySelectorAll('[data-map-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.mapFilter;
      document.querySelectorAll('[data-map-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      document.querySelectorAll('.map-node').forEach((node) => node.classList.toggle('dim', filter !== 'all' && node.dataset.area !== filter));
    });
  });
}

function createSchoolCard(school) {
  const article = document.createElement('article');
  article.className = 'school-place';
  const copy = document.createElement('div');
  const town = document.createElement('strong');
  town.textContent = school.comune;
  const name = document.createElement('span');
  name.textContent = school.etichetta;
  copy.append(town, name);
  article.append(copy);

  const townData = towns.find((item) => item.name === school.comune);
  if (townData) {
    const count = document.createElement('b');
    count.textContent = formatNumber(townData.series.at(-1));
    count.title = 'Residenti di 12 anni nel comune al 1° gennaio 2026';
    count.setAttribute('aria-label', `${count.textContent} residenti di 12 anni nel comune`);
    article.append(count);
  }
  return article;
}

function createSchoolGroup(className, title, description, schools) {
  const section = document.createElement('section');
  section.className = `school-group ${className}`;
  const header = document.createElement('header');
  const heading = document.createElement('h3');
  heading.textContent = title;
  const note = document.createElement('p');
  note.textContent = description;
  header.append(heading, note);
  const list = document.createElement('div');
  list.className = 'school-list';
  schools.forEach((school) => list.append(createSchoolCard(school)));
  section.append(header, list);
  return section;
}

async function loadSchools() {
  try {
    const response = await fetch('scuole-orientamento.json');
    if (!response.ok) throw new Error('Elenco non disponibile');
    const schools = await response.json();
    schools.forEach((school) => {
      if (!schoolNamesByTown.has(school.comune)) schoolNamesByTown.set(school.comune, []);
      schoolNamesByTown.get(school.comune).push(school.etichetta);
    });

    const focusTowns = new Set(towns.filter((town) => town.area === 'focus').map((town) => town.name));
    const mappedTowns = new Set(towns.map((town) => town.name));
    const focusSchools = schools.filter((school) => focusTowns.has(school.comune));
    const otherSchools = schools.filter((school) => mappedTowns.has(school.comune) && !focusTowns.has(school.comune));
    const externalSchools = schools.filter((school) => !mappedTowns.has(school.comune));

    schoolGroups.replaceChildren(
      createSchoolGroup('focus', 'Negli 11 comuni di provenienza', `${focusSchools.length} scuole o sedi nell’elenco operativo`, focusSchools),
      createSchoolGroup('other', 'Negli altri comuni della mappa', `${otherSchools.length} scuole o sedi nell’elenco operativo`, otherSchools),
      createSchoolGroup('external', 'Negli altri territori da raggiungere', `${externalSchools.length} scuole o sedi fuori dal perimetro demografico`, externalSchools)
    );
    renderTown(towns[0]);
  } catch {
    const message = document.createElement('p');
    message.className = 'loading-message';
    message.textContent = 'L’elenco delle scuole non è disponibile. Ricarica la pagina o consulta la Commissione Orientamento.';
    schoolGroups.replaceChildren(message);
    renderTown(towns[0]);
  }
}

function buildTable() {
  const body = document.querySelector('#territoryTable tbody');
  towns.forEach((town) => {
    const row = document.createElement('tr');
    const cells = [town.name, ...town.series.map(formatNumber), formatPercent(town.series[0], town.series.at(-1)), town.area === 'focus' ? 'Provenienza' : 'Altro comune'];
    cells.forEach((value) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });

  const footer = document.querySelector('#territoryTable tfoot');
  const row = document.createElement('tr');
  const cells = ['Totale 19 comuni', ...totals.map(formatNumber), formatPercent(totals[0], totals.at(-1)), 'Bacino osservato'];
  cells.forEach((value) => {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  });
  footer.append(row);
}

buildMap();
buildTable();
loadSchools();
