const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.goto('https://example.com');
  
  // Example: Take screenshot
  await page.screenshot({ path: 'screenshot.png' });
  
  // Example: Get page title
  const title = await page.title();
  console.log('Page title:', title);

  await browser.close();
})();
