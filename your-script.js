const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for GitHub Actions
  });
  const page = await browser.newPage();
  
  await page.goto('https://example.com');
  console.log('Page title:', await page.title());
  
  // Add your Puppeteer logic here
  // Example: Take a screenshot
  await page.screenshot({ path: 'screenshot.png' });

  await browser.close();
})();
