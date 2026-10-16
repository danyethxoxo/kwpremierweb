// Live, read-only browser measurements. No forms are submitted.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.KW_SITE_URL || 'https://www.kwpremieroficial.com';
const out = process.env.KW_AUDIT_OUTPUT || 'artifacts/auditoria-publica';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
const results = [];
try {
  for (const width of [1440, 390]) {
    for (const route of ['/', '/login.html', '/asesores.html', '/staff.html', '/market-center.html', '/resena.html', '/api.html', '/propiedades.html']) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage(), errors = [], failed = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) failed.push({ url: r.url().replace(/\?.*$/, ''), status: r.status() }); });
      // Keep all external state unchanged, including anonymous visit counters.
      await page.route('**/*', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
      await page.addInitScript(() => {
        window.qaPerf = { lcp: 0, cls: 0, longTasks: 0, blockingMs: 0 };
        for (const type of ['largest-contentful-paint', 'layout-shift', 'longtask']) {
          try { new PerformanceObserver(list => { for (const entry of list.getEntries()) {
            if (type === 'largest-contentful-paint') window.qaPerf.lcp = entry.startTime;
            if (type === 'layout-shift' && !entry.hadRecentInput) window.qaPerf.cls += entry.value;
            if (type === 'longtask') { window.qaPerf.longTasks++; window.qaPerf.blockingMs += Math.max(0, entry.duration - 50); }
          } }).observe({ type, buffered: true }); } catch {}
        }
      });
      try {
        const response = await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(3500);
        const metrics = await page.evaluate(() => ({ ...window.qaPerf,
          fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
          dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
          requests: performance.getEntriesByType('resource').length,
          transferredBytes: performance.getEntriesByType('resource').reduce((sum, entry) => sum + entry.transferSize, 0),
          overflow: document.documentElement.scrollWidth - innerWidth,
          brokenImages: [...document.images].filter(i => !i.closest('[hidden]') && getComputedStyle(i).display !== 'none' && i.currentSrc && i.complete && !i.naturalWidth).map(i => i.currentSrc),
          links: [...document.querySelectorAll('a[href]')].filter(a => a.origin === location.origin && a.pathname.endsWith('.html')).map(a => a.pathname)
        }));
        results.push({ route, width, status: response?.status(), ...metrics, errors, failed });
        await page.screenshot({ path: out + '/' + (route === '/' ? 'index' : route.slice(1)) + '-' + width + '.png' });
      } catch (error) { results.push({ route, width, errors: [error.message], failed }); }
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  }
} finally { await browser.close(); }
writeFileSync(out + '/resultado.json', JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
