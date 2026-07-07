const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' });
  const page = await context.newPage();
  await page.goto('https://6af6baca.new-localchimera.pages.dev/example/connectkit-wallet/dist/index.html?redirect=io.chimera.mobile://wallet');
  await page.waitForTimeout(3000);
  const button = await page.$('button');
  if (button) { await button.click(); }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/tmp/wallet-modal.png', fullPage: true });
  await browser.close();
})();
