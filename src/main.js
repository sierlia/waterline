import { HeroScene } from './heroScene.js';
import { clamp, lerp } from './utils.js';

const hero = document.querySelector('[data-hero]');
const canvas = document.querySelector('[data-water-canvas]');
const underwaterCopy = document.querySelector('[data-underwater-copy]');
const fallback = document.querySelector('[data-fallback]');

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = reducedMotionQuery.matches;

let scene;
let latestProgress = 0;
let currentProgress = 0;
let ticking = false;

const updateScrollProgress = () => {
  if (!hero) return;

  const rect = hero.getBoundingClientRect();
  const total = hero.offsetHeight - window.innerHeight;
  const progress = total <= 0 ? 0 : clamp(-rect.top / total, 0, 1);
  latestProgress = progress;

  if (scene) scene.setScrollProgress(progress);
  if (!reducedMotion) {
    document.documentElement.style.setProperty('--hero-progress', progress.toFixed(4));
  }
};

const rafStateSync = () => {
  currentProgress = reducedMotion ? latestProgress : lerp(currentProgress, latestProgress, 0.08);
  const fallbackOpacity = 0.18 + currentProgress * 0.32;
  if (fallback) fallback.style.opacity = document.documentElement.classList.contains('no-canvas') ? '1' : `${fallbackOpacity}`;
  ticking = false;
  requestAnimationFrame(rafStateSync);
};

const init = () => {
  if (!hero || !canvas || !underwaterCopy) return;
  scene = new HeroScene({
    canvas,
    hero,
    underwaterCopy,
    reducedMotion,
  });

  updateScrollProgress();

  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.addEventListener('resize', updateScrollProgress, { passive: true });
  reducedMotionQuery.addEventListener?.('change', () => window.location.reload());

  if (!ticking) {
    ticking = true;
    requestAnimationFrame(rafStateSync);
  }
};

init();
