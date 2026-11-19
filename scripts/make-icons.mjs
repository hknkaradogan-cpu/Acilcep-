// Renders the PWA icons (PNG) from SVG using a locally installed Chrome.
//   CHROME_PATH=/usr/bin/google-chrome npm run icons
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const bolt = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><path d="M290 64 146 288h96l-32 160 160-240H274z" fill="#fff"/></g>`;
const svg = ({ maskable }) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#b91c1c"/></linearGradient></defs>
  ${maskable ? '<rect width="512" height="512" fill="url(#g)"/>' : '<rect width="512" height="512" rx="112" fill="url(#g)"/>'}
  ${bolt(maskable ? 0.72 : 1)}
</svg>`;

const out = [
  { file: 'public/icons/icon-192.png', size: 192, maskable: false },
  { file: 'public/icons/icon-512.png', size: 512, maskable: false },
  { file: 'public/icons/icon-maskable-512.png', size: 512, maskable: true },
  { file: 'public/icons/apple-touch-icon.png', size: 180, maskable: true },
];

mkdirSync('public/icons', { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const o of out) {
  await page.setViewport({ width: o.size, height: o.size, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(o).replace('width="512" height="512"', `width="${o.size}" height="${o.size}"`)}</body></html>`);
  await page.screenshot({ path: o.file, omitBackground: true, clip: { x: 0, y: 0, width: o.size, height: o.size } });
  console.log('wrote', o.file);
}
await browser.close();
