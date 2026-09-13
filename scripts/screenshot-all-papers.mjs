/**
 * Generate one full paper per subject + screenshot key pages for visual QA.
 */
import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'test-output', 'visual-qa');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.ttf': 'font/ttf',
  '.js': 'application/javascript'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.normalize(path.join(root, urlPath));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

const PAPERS = ['gs1', 'gs2', 'gs3', 'gs4', 'essay', 'opt1', 'opt2'];

async function renderPdfPages(pdfBase64, pageNumbers, pngPaths) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 1.5 });

  const html = `<!DOCTYPE html><html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<style>body{margin:0;background:#333}canvas{display:block;margin:0 auto;background:#fff}</style>
</head><body><div id="root"></div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
(async () => {
  const data = atob('${pdfBase64}');
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = ${JSON.stringify(pageNumbers)};
  const root = document.getElementById('root');
  window.__shots = [];
  for (const n of pages) {
    if (n < 1 || n > pdf.numPages) continue;
    const pg = await pdf.getPage(n);
    const vp = pg.getViewport({ scale: 1.15 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    root.appendChild(canvas);
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    window.__shots.push({ page: n, w: canvas.width, h: canvas.height });
  }
  window.__done = true;
})();
<\/script></body></html>`;

  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction('window.__done === true', { timeout: 120000 });

  const canvases = await page.$$('canvas');
  for (let i = 0; i < canvases.length && i < pngPaths.length; i++) {
    await canvases[i].screenshot({ path: pngPaths[i] });
  }
  await browser.close();
}

function pickPages(key, total, booklet) {
  const p = new Set([1, 2, 3]);
  if (key === 'gs1' || key === 'gs2' || key === 'gs3') {
    p.add(4);
    p.add(23);
    if (booklet) p.add(booklet - 5);
    p.add(booklet);
    p.add(booklet + 1);
    p.add(booklet + 3);
  } else if (key === 'gs4') {
    p.add(4);
    p.add(booklet);
    p.add(booklet + 1);
    p.add(booklet + 3);
  } else if (key === 'essay') {
    p.add(15);
    p.add(16);
    p.add(booklet);
    p.add(booklet + 1);
  } else if (key.startsWith('opt')) {
    p.add(4);
    p.add(booklet);
    p.add(booklet + 1);
    p.add(booklet + 3);
  }
  p.add(total);
  return [...p].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { server, baseUrl } = await startServer();
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.evaluate(() => window.__testWaitForFonts());

  const manifest = await page.evaluate(async (papers) => {
    const results = [];
    for (const key of papers) {
      document.getElementById('paperSelect').value = key;
      document.getElementById('paperSelect').dispatchEvent(new Event('change'));
      window.setPaperMode('full');
      window.insertFullLengthSkeleton(true);

      const cards = document.querySelectorAll('.question-card');
      cards.forEach((card, idx) => {
        const ta = card.querySelector('.q-text');
        if (ta) {
          ta.value = 'Mock question text for ' + key + ' slot ' + (idx + 1) + '. Discuss with examples and a brief conclusion.';
        }
      });

      const questions = window.collectQuestions();
      const r = window.__testGenerateSheet(key, questions, {
        includeInstructions: true,
        includeRough: true,
        includeQuestionPaper: true,
        roughPageCount: 4,
        withHindi: true
      });
      results.push({
        key,
        pages: r.pages,
        booklet: r.expectedBookletPages,
        pdfBase64: r.pdfBase64,
        qCount: questions.length
      });
    }
    return results;
  }, PAPERS);

  await browser.close();
  server.close();

  for (const r of manifest) {
    const pdfPath = path.join(outDir, r.key + '.pdf');
    fs.writeFileSync(pdfPath, Buffer.from(r.pdfBase64, 'base64'));
    const pageNums = pickPages(r.key, r.pages, r.booklet);
    const pngPaths = pageNums.map((n) => path.join(outDir, `${r.key}-p${String(n).padStart(2, '0')}.png`));
    await renderPdfPages(r.pdfBase64, pageNums, pngPaths);
    console.log(r.key + ': ' + r.pages + ' pages, ' + r.qCount + ' Q, shots: ' + pageNums.join(','));
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest.map((m) => ({
    key: m.key,
    pages: m.pages,
    booklet: m.booklet,
    qCount: m.qCount
  })), null, 2));
  console.log('\nOutput: ' + outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
