const puppeteer = require('puppeteer');

(async () => {
  // Required flags for headless environments
  const browser = await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://example.com');
    
    // Take screenshot proof
    await page.screenshot({ path: 'example.png' });
    console.log('Screenshot saved!');

    // Get page title
    const title = await page.title();
    console.log(`Page Title: ${title}`);

  } finally {
    await browser.close();
  }
})();
