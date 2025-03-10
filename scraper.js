const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin({
  // Enhanced stealth configuration
  automationBlocker: true,
  fontNoise: true,
  hidePowerState: true,
  localeNoise: true,
  navigatorNoise: true,
  webglNoise: true
}));

const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  selectors: {
    priceFilter: 'input[placeholder="מקסימום"]', // Updated price filter selector
    listItem: '[data-test-id="feed-item"]',
    title: '[data-test-id="title"]',
    price: '[data-test-id="price"]',
    year: '[data-test-id="year"]',
    link: 'a[data-test-id="link"]'
  },
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  ]
};

async function randomDelay(min=1500, max=4500) {
  await new Promise(res => setTimeout(res, Math.random() * (max - min) + min));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Configure stealth
    await page.setUserAgent(config.userAgents[Math.floor(Math.random() * config.userAgents.length)]);
    await page.setViewport({
      width: 1366 + Math.floor(Math.random() * 100),
      height: 768 + Math.floor(Math.random() * 100),
      deviceScaleFactor: 1
    });

    // Bypass anti-bot detection
    await page.evaluateOnNewDocument(() => {
      delete navigator.__proto__.webdriver;
    });

    // Navigate to site
    await page.goto(config.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await randomDelay();

    // Apply price filter
    try {
      const priceInput = await page.waitForSelector(config.selectors.priceFilter, { timeout: 15000 });
      await priceInput.type(config.maxPrice.toString());
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      await randomDelay(3000, 5000);
    } catch (error) {
      await page.screenshot({ path: 'error.png' });
      throw new Error('Price filter failed: ' + error.message);
    }

    // Scrape listings
    let cars = [];
    try {
      await page.waitForSelector(config.selectors.listItem, { timeout: 15000 });
      cars = await page.$$eval(config.selectors.listItem, (items, selectors) => {
        return items.map(item => ({
          title: item.querySelector(selectors.title)?.textContent?.trim() || '',
          price: item.querySelector(selectors.price)?.textContent?.replace(/\D/g, '') || '0',
          year: item.querySelector(selectors.year)?.textContent?.trim() || '',
          link: item.querySelector(selectors.link)?.href || ''
        }));
      }, config.selectors);

      // Filter results
      cars = cars.filter(car => 
        parseInt(car.price) <= config.maxPrice && 
        car.link.includes('/vehicles/cars/')
      );
    } catch (error) {
      await page.screenshot({ path: 'error.png' });
      throw new Error('Scraping failed: ' + error.message);
    }

    // Save results
    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    await page.screenshot({ path: 'page.png' });

    // Ensure files exist
    if (cars.length === 0) fs.writeFileSync('cars.json', '[]');
    if (!fs.existsSync('debug.log')) fs.writeFileSync('debug.log', '');
    
    console.log(`Found ${cars.length} listings`);

  } catch (error) {
    fs.writeFileSync('debug.log', error.stack);
    throw error;
  } finally {
    await browser.close();
  }
})();
