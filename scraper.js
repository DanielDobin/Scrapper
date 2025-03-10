const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin({
  automationEvasion: true,
  consoleEvasion: true,
  userAgentEvasion: true
}));

const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  selectors: {
    priceFilter: 'input[data-test-id="price-to"]',
    listItem: 'div.feedItem',
    title: 'h2.title',
    price: 'div.price',
    year: 'div.vehicle-year',
    link: 'a[data-test-id="ad-link"]'
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  screenshotPath: 'screenshots'
};

// Initialize page outside try block
let page = null;

async function takeScreenshot(name) {
  if (!page) return;
  if (!fs.existsSync(config.screenshotPath)) {
    fs.mkdirSync(config.screenshotPath);
  }
  await page.screenshot({ 
    path: path.join(config.screenshotPath, `${name}-${Date.now()}.png`),
    fullPage: true
  });
}

async function randomDelay(min=2000, max=5000) {
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
    page = await browser.newPage();
    
    // Configure browser
    await page.setUserAgent(config.userAgent);
    await page.setViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1
    });

    // Bypass anti-bot detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Navigate to site
    await page.goto(config.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await takeScreenshot('initial-page');
    await randomDelay();

    // Apply price filter with retries
    let filterApplied = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const priceInput = await page.waitForSelector(config.selectors.priceFilter, { timeout: 10000 });
        await priceInput.click({ clickCount: 3 });
        await priceInput.type(config.maxPrice.toString());
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        await takeScreenshot(`post-filter-attempt-${attempt}`);
        filterApplied = true;
        break;
      } catch (error) {
        console.log(`Filter attempt ${attempt} failed, retrying...`);
        await takeScreenshot(`filter-fail-${attempt}`);
        await page.reload({ waitUntil: 'networkidle2' });
        await randomDelay();
      }
    }

    if (!filterApplied) {
      throw new Error('Failed to apply price filter after 3 attempts');
    }

    // Scrape listings
    await page.waitForSelector(config.selectors.listItem, { timeout: 15000 });
    const cars = await page.$$eval(config.selectors.listItem, (items, selectors) => {
      return items.map(item => {
        try {
          return {
            title: item.querySelector(selectors.title)?.textContent?.trim() || '',
            price: item.querySelector(selectors.price)?.textContent?.replace(/[^0-9]/g, '') || '0',
            year: item.querySelector(selectors.year)?.textContent?.match(/\d+/)?.[0] || '',
            link: item.querySelector(selectors.link)?.href || ''
          };
        } catch (error) {
          return null;
        }
      }).filter(Boolean);
    }, config.selectors);

    // Filter and save results
    const filteredCars = cars.filter(car => 
      parseInt(car.price) <= config.maxPrice && 
      car.link.startsWith('https://')
    );

    fs.writeFileSync('cars.json', JSON.stringify(filteredCars, null, 2));
    console.log(`Successfully found ${filteredCars.length} listings`);

  } catch (error) {
    fs.writeFileSync('debug.log', `[${new Date().toISOString()}] ERROR: ${error.stack}\n`);
    await takeScreenshot('final-error');
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
