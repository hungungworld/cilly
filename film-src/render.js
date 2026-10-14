// usage: node render.js <outdir> [frame,frame,...]
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const fs = require('fs'), path = require('path');
(async () => {
  const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--disable-web-security'] });
  const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
  page.on('console', m => console.log('[page]', m.text()));
  page.on('pageerror', e => console.log('[err]', e.message));
  await page.goto('http://127.0.0.1:8765/index.html');
  const total = await page.evaluate(() => window.FRAMES);
  const list = process.argv[3] ? process.argv[3].split(',').map(Number) : [...Array(total).keys()];
  const t0 = Date.now();
  for (const f of list) {
    const b64 = await page.evaluate(async f => { await window.renderFrame(f); return document.getElementById('c').toDataURL('image/jpeg', 0.95); }, f);
    fs.writeFileSync(path.join(out, String(f).padStart(4, '0') + '.jpg'), Buffer.from(b64.split(',')[1], 'base64'));
    if (f % 50 === 0) console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  await browser.close();
})();
