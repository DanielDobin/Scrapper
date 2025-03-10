const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Configuration
const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  viewport: { width: 1366, height: 768 },
  delays: {
    navigation: 3000,
    minAction: 1500,
    maxAction: 4500
  }
};

// Helpers
const delay = ms => new Promise(res => setTimeout(res, ms));
const randomDelay = () => delay(config.delays.minAction + Math.random() * config.delays.maxAction);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--single-process'
    ]
  });

  const results = {
    cars: [],
    errors: []
  };

  try {
    const page = await browser.newPage();
    
    // Configure browser
    await page.setUserAgent(config.userAgent);
    await page.setViewport(config.viewport);
    await page.setJavaScriptEnabled(true);

    // Navigate to site
    await page.goto(config.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await randomDelay();

    // Apply price filter
    try {
      const priceInput = await page.waitForSelector('input[data-test-id="price_max"]', { timeout: 10000 });
      await priceInput.type(config.maxPrice.toString());
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      await randomDelay();
    } catch (error) {
      results.errors.push('Price filter failed: ' + error.message);
    }

    // Pagination loop
    let hasNextPage = true;
    while (hasNextPage) {
      try {
        // Extract listings (FIXED SYNTAX)
        const pageResults = await page.$$eval('.feed_item', items => 
          items.map(item => ({
            title: item.querySelector('.title')?.innerText?.trim() || '',
            price: item.querySelector('.price')?.innerText?.replace(/\D/g, '') || '0',
            year: item.querySelector('.year')?.innerText?.trim() || '',
            link: item.querySelector('a[href]')?.href || ''
          }))
        );

        // Filter and store results
        const validResults = pageResults.filter(car => 
          parseInt(car.price) <= config.maxPrice && car.link.startsWith('http')
        );
        results.cars.push(...validResults);

        // Pagination
        const nextButton = await page.$('.pagination .next:not(.disabled)');
        if (!nextButton) {
          hasNextPage = false;
          break;
        }

        await nextButton.click();
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await randomDelay();

      } catch (error) {
        results.errors.push(`Page processing failed: ${error.message}`);
        hasNextPage = false;
      }
    }

  } catch (error) {
    results.errors.push(`Critical error: ${error.message}`);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
    
    // Save results
    fs.writeFileSync('cars.json', JSON.stringify(results.cars, null, 2));
    fs.writeFileSync('debug.log', results.errors.join('\n'));
  }
})();
