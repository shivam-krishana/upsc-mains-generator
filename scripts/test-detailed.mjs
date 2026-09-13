/**
 * Detailed verification: HTTP (fonts), Hindi embedding, cover counts, PDF visuals.
 * Run from scripts/: node test-detailed.mjs
 */
import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'test-output');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.svg': 'image/svg+xml'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.normalize(path.join(root, urlPath));
      if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/` });
    });
  });
}

function gsQuestions(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const marks = i <= 10 ? 10 : 15;
    const wordLimit = i <= 10 ? 150 : 250;
    out.push({
      text: 'Sample GS question ' + i + ' for layout and pagination testing with enough English text.',
      marks,
      wordLimit,
      qno: i,
      section: i <= 10 ? 'A' : 'B',
      subparts: []
    });
  }
  return out;
}

function gs4Questions() {
  const out = [];
  const sectionA = [
    { qno: 1, parts: 2 }, { qno: 2, parts: 2 }, { qno: 3, parts: 3 },
    { qno: 4, parts: 2 }, { qno: 5, parts: 2 }, { qno: 6, parts: 2 }
  ];
  sectionA.forEach(({ qno, parts }) => {
    out.push({
      text: 'Ethics theory Q' + qno,
      marks: 10,
      wordLimit: 150,
      qno,
      section: 'A',
      subparts: Array.from({ length: parts }, (_, i) => ({
        text: 'Subpart ' + String.fromCharCode(97 + i),
        marks: 10
      }))
    });
  });
  for (let q = 7; q <= 12; q++) {
    out.push({
      text: 'Case study question ' + q,
      marks: 20,
      wordLimit: 250,
      qno: q,
      section: 'B',
      subparts: []
    });
  }
  return out;
}

function optionalQuestions() {
  const comp = [
    { text: 'Subpart (a).', marks: 10 },
    { text: 'Subpart (b).', marks: 15 },
    { text: 'Subpart (c).', marks: 15 },
    { text: 'Subpart (d).', marks: 10 }
  ];
  const out = [{
    text: 'Compulsory Q1 stem.',
    marks: 15,
    wordLimit: 250,
    qno: 1,
    section: 'A',
    subparts: comp.map((p) => ({ ...p }))
  }];
  for (let i = 2; i <= 4; i++) {
    out.push({
      text: 'Optional Q' + i + '.',
      marks: 20,
      wordLimit: 250,
      qno: i,
      section: 'A',
      subparts: []
    });
  }
  out.push({
    text: 'Compulsory Q5 stem.',
    marks: 15,
    wordLimit: 250,
    qno: 5,
    section: 'B',
    subparts: comp.map((p) => ({ ...p }))
  });
  for (let i = 6; i <= 8; i++) {
    out.push({
      text: 'Optional Q' + i + '.',
      marks: 20,
      wordLimit: 250,
      qno: i,
      section: 'B',
      subparts: []
    });
  }
  return out;
}

const cases = [
  { key: 'gs1', questions: gsQuestions(20) },
  { key: 'gs2', questions: gsQuestions(20) },
  { key: 'gs3', questions: gsQuestions(20) },
  { key: 'gs4', questions: gs4Questions() },
  {
    key: 'essay',
    questions: [
      { text: 'Essay topic one on governance and ethics.', marks: 125, wordLimit: 1200, qno: 1, section: 'A', subparts: [] },
      { text: 'Essay topic two on technology and society.', marks: 125, wordLimit: 1200, qno: 2, section: 'B', subparts: [] }
    ]
  },
  { key: 'opt1', questions: optionalQuestions() },
  { key: 'opt2', questions: optionalQuestions() }
];

const DEVANAGARI = /[\u0900-\u097F]/;

async function extractPdfText(pdfBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdf = await loadingTask.promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const content = await pg.getTextContent();
    text += content.items.map((it) => it.str).join(' ') + '\n';
  }
  return text;
}

function pdfHasEmbeddedDevanagariFont(pdfBuffer) {
  const s = pdfBuffer.toString('latin1');
  return s.includes('NotoDevReg') || s.includes('NotoSansDevanagari');
}

async function renderPdfPages(pdfBase64, pageNumbers, pngPrefix) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 1.5 });

  const html = `<!DOCTYPE html><html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<style>body{margin:0;background:#333}canvas{display:block;margin:8px auto;background:#fff}</style>
</head><body><div id="root"></div>
<script>
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
(async () => {
  const data = atob('${pdfBase64}');
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  window.__pdfPages = pdf.numPages;
  const root = document.getElementById('root');
  for (const n of [${pageNumbers.join(',')}]) {
    if (n < 1 || n > pdf.numPages) continue;
    const pg = await pdf.getPage(n);
    const vp = pg.getViewport({ scale: 1.2 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    root.appendChild(canvas);
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    canvas.dataset.page = String(n);
  }
  window.__renderDone = true;
})();
<\/script></body></html>`;

  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120000 });
  await page.waitForFunction('window.__renderDone === true', { timeout: 120000 });

  const paths = [];
  const canvases = await page.$$('canvas[data-page]');
  for (const canvas of canvases) {
    const pageNum = await canvas.evaluate((el) => el.dataset.page);
    const pngPath = path.join(outDir, `${pngPrefix}-p${pageNum}.png`);
    await canvas.screenshot({ path: pngPath });
    paths.push(pngPath);
  }
  await browser.close();
  return paths;
}

function pickSnapshotPages(key, totalPages, expectedBooklet) {
  const pages = new Set([1, 2, 3]);
  if (expectedBooklet) {
    pages.add(expectedBooklet);
    pages.add(expectedBooklet + 1);
    pages.add(expectedBooklet + 3);
  }
  pages.add(totalPages);
  return [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { server, baseUrl } = await startServer();

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('PAGE ERROR', err.message));

  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
  const fontsOk = await page.evaluate(async () => {
    return await window.__testWaitForFonts();
  });
  if (!fontsOk) {
    console.error('FAIL  fonts did not load over HTTP');
    await browser.close();
    server.close();
    process.exit(1);
  }
  console.log('OK    Devanagari fonts loaded (HTTP)');

  const results = await page.evaluate(async (cases) => {
    const out = [];
    for (const c of cases) {
      try {
        const r = window.__testGenerateSheet(c.key, c.questions, {
          includeInstructions: true,
          includeRough: true,
          includeQuestionPaper: true,
          roughPageCount: 4,
          withHindi: true
        });
        out.push({
          key: c.key,
          ok: true,
          pages: r.pages,
          expectedBookletPages: r.expectedBookletPages,
          fontsReady: r.fontsReady,
          pdfBase64: r.pdfBase64
        });
      } catch (e) {
        out.push({ key: c.key, ok: false, error: String(e && e.message ? e.message : e) });
      }
    }
    return out;
  }, cases);

  await browser.close();
  server.close();

  let failed = 0;
  for (const r of results) {
    if (!r.ok) {
      failed++;
      console.log('FAIL  ' + r.key + '  ' + r.error);
      continue;
    }

    const pdfBuffer = Buffer.from(r.pdfBase64, 'base64');
    const pdfPath = path.join(outDir, `${r.key}-full.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    let text = '';
    try {
      text = await extractPdfText(pdfBuffer);
    } catch (e) {
      console.log('WARN  ' + r.key + '  text extract: ' + e.message);
    }

    const hasHiText = DEVANAGARI.test(text);
    const hasHiFont = pdfHasEmbeddedDevanagariFont(pdfBuffer);
    const coverMatch = text.includes(String(r.expectedBookletPages)) ||
      text.includes('contains ' + r.expectedBookletPages);

    const checks = [
      ['fontsReady', r.fontsReady === true],
      ['embeddedDevanagariFont', hasHiFont],
      ['extractedDevanagariText', hasHiText],
      ['coverPageCountInText', coverMatch],
      ['minPages', r.pages >= r.expectedBookletPages + 3]
    ];

    for (const [name, pass] of checks) {
      if (!pass) {
        failed++;
        console.log('FAIL  ' + r.key + '  ' + name);
      }
    }

    const allPass = checks.every(([, p]) => p);
    console.log(
      (allPass ? 'OK   ' : 'WARN ') +
        r.key +
        '  pages=' +
        r.pages +
        '  booklet=' +
        r.expectedBookletPages +
        '  hiFont=' +
        hasHiFont +
        '  hiText=' +
        hasHiText +
        '  coverRef=' +
        coverMatch
    );

    const snapPages = pickSnapshotPages(r.key, r.pages, r.expectedBookletPages);
    try {
      const pngs = await renderPdfPages(r.pdfBase64, snapPages, r.key);
      console.log('      snapshots: ' + pngs.map((p) => path.basename(p)).join(', '));
    } catch (e) {
      failed++;
      console.log('FAIL  ' + r.key + '  snapshot: ' + e.message);
    }
  }

  console.log('\nOutput: ' + outDir);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
