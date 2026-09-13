import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
        res.writeHead(200);
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}/` });
    });
  });
}

const browser = await puppeteer.launch({ headless: 'new' });
const { server, baseUrl } = await startServer();
const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: 'networkidle0' });
await page.evaluate(() => window.__testWaitForFonts());

const ok = await page.evaluate(() => {
  const q = [{ text: 'Test', marks: 15, wordLimit: 250, qno: 1, section: '', subparts: [] }];
  const r = window.__testGenerateSheet('gs1', q, { withHindi: true });
  return r.fontsReady && r.pages > 0;
});

server.close();
await browser.close();
console.log(ok ? 'OK  test-all-papers (HTTP + Hindi)' : 'FAIL test-all-papers');
process.exit(ok ? 0 : 1);
