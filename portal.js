const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
const areaCards = Array.from(document.querySelectorAll('[data-audiences]'));
const resetButton = document.getElementById('resetFilter');
const filterStatus = document.getElementById('filterStatus');
const emptyState = document.getElementById('emptyState');

function setFilter(audience = '') {
  let visibleCount = 0;

  filterButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === audience));
  });

  areaCards.forEach((card) => {
    const visible = !audience || card.dataset.audiences.split(' ').includes(audience);
    card.hidden = !visible;
    if (visible) visibleCount += 1;
  });

  resetButton.hidden = !audience;
  emptyState.hidden = visibleCount > 0;
  filterStatus.textContent = audience
    ? `Contenuti consigliati per ${audience}.`
    : 'Sono visibili tutti i contenuti.';

  const url = new URL(window.location);
  if (audience) url.searchParams.set('per', audience);
  else url.searchParams.delete('per');
  window.history.replaceState({}, '', url);
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const isSelected = button.getAttribute('aria-pressed') === 'true';
    setFilter(isSelected ? '' : button.dataset.filter);
  });
});

resetButton.addEventListener('click', () => setFilter());

const requestedAudience = new URLSearchParams(window.location.search).get('per');
setFilter(filterButtons.some((button) => button.dataset.filter === requestedAudience) ? requestedAudience : '');
