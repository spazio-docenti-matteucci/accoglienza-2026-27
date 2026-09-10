const slides = Array.from(document.querySelectorAll('.slide'));
const track = document.getElementById('slidesTrack');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const currentTitle = document.getElementById('currentTitle');
const counter = document.getElementById('counter');
const progress = document.getElementById('progress');
const indexButton = document.getElementById('indexButton');
const indexPanel = document.getElementById('indexPanel');
const indexItems = document.getElementById('indexItems');
const fullscreenButton = document.getElementById('fullscreenButton');
let current = 0;

function pad(value) { return String(value).padStart(2, '0'); }

function closeIndex() {
  indexPanel.hidden = true;
  indexButton.setAttribute('aria-expanded', 'false');
}

function goTo(index) {
  current = Math.max(0, Math.min(slides.length - 1, index));
  track.style.transform = `translateX(-${current * 100}%)`;
  currentTitle.textContent = slides[current].dataset.title;
  counter.textContent = `${pad(current + 1)} / ${pad(slides.length)}`;
  progress.style.width = `${((current + 1) / slides.length) * 100}%`;
  prevButton.disabled = current === 0;
  nextButton.disabled = current === slides.length - 1;
  indexItems.querySelectorAll('button').forEach((button, buttonIndex) => {
    button.classList.toggle('active', buttonIndex === current);
  });
  closeIndex();
}

slides.forEach((slide, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = `<span>${pad(index + 1)}</span>${slide.dataset.title}`;
  button.addEventListener('click', () => goTo(index));
  indexItems.appendChild(button);
});

prevButton.addEventListener('click', () => goTo(current - 1));
nextButton.addEventListener('click', () => goTo(current + 1));
indexButton.addEventListener('click', () => {
  const opening = indexPanel.hidden;
  indexPanel.hidden = !opening;
  indexButton.setAttribute('aria-expanded', String(opening));
});

fullscreenButton.addEventListener('click', async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
});

document.addEventListener('keydown', (event) => {
  if (['ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); goTo(current + 1); }
  if (['ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); goTo(current - 1); }
  if (event.key === 'Home') goTo(0);
  if (event.key === 'End') goTo(slides.length - 1);
  if (event.key === 'Escape') closeIndex();
});

goTo(0);
