import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const theme = process.argv[2] || 'light';
const outDir = resolve(__dirname, `frames-${theme}`);
mkdirSync(outDir, { recursive: true });

const url = `file://${resolve(__dirname, 'combined-light-dark.html')}?theme=${theme}`;

const FPS = Number(process.env.FPS || 18);
const DURATION_MS = Number(process.env.DUR || 2400);
const FRAME_INTERVAL = 1000 / FPS;
const TOTAL_FRAMES = Math.floor(DURATION_MS / FRAME_INTERVAL);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference'
});

const page = await context.newPage();

// Block animations until we tell page to start, by adding a class that pauses CSS animations.
// We'll inject a setup script BEFORE navigation that holds animations.
await page.addInitScript(() => {
  const style = document.createElement('style');
  style.id = '__pause-animations';
  style.textContent = `
    *, *::before, *::after {
      animation-play-state: paused !important;
    }
  `;
  // Wait for head, then append
  const tryAttach = () => {
    if (document.head) {
      document.head.appendChild(style);
    } else {
      requestAnimationFrame(tryAttach);
    }
  };
  tryAttach();

  window.__startAnimations = () => {
    const s = document.getElementById('__pause-animations');
    if (s) s.remove();
  };
});

await page.goto(url, { waitUntil: 'load' });

// Allow fonts to load
await page.evaluate(() => document.fonts ? document.fonts.ready : Promise.resolve());

// Capture frame 0 (initial paused state, where opacity:0 etc applies via animation-fill-mode: backwards)
const start = Date.now();
await page.screenshot({ path: `${outDir}/frame_000.png`, fullPage: false });

// Start animations
await page.evaluate(() => window.__startAnimations && window.__startAnimations());

const captureStart = Date.now();
for (let i = 1; i < TOTAL_FRAMES; i++) {
  const targetT = i * FRAME_INTERVAL;
  const now = Date.now() - captureStart;
  const wait = targetT - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({
    path: `${outDir}/frame_${String(i).padStart(3, '0')}.png`,
    fullPage: false
  });
}

await browser.close();
console.log(`captured ${TOTAL_FRAMES} frames into ${outDir} in ${(Date.now() - start)}ms`);
