const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin({
  automationEvasion: true,
  consoleEvasion: true,
  userAgentEvasion: true,
  webglVendor: 'Google Inc. (Intel)',
  browserName: 'chrome'
}));

const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  selectors: {
    priceFilter: 'input[placeholder="מקסימום"]', // Verified working selector
    listItem: 'div.feed-item',
    title: 'div.feed-item-title',
    price: 'div.feed-item-price',
    year: 'div.feed-item-year',
    link: 'a.feed-item-link'
  },
  headers: {
    'Accept-Language': 'he-IL,he;q=0.9',
    'Referer': 'https://www.yad2.co.il/'
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  screenshotPath: 'screenshots'
};

let page = null;

async function takeScreenshot(name) {
  if (!page) return;
  try {
    if (!fs.existsSync(config.screenshotPath)) {
      fs.mkdirSync(config.screenshotPath);
    }
    const filePath = path.join(config.screenshotPath, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`Screenshot saved: ${filePath}`);
  } catch (error) {
    console.error('Failed to take screenshot:', error);
  }
}

async function randomDelay(min=2500, max=6000) {
  const delayTime = Math.floor(Math.random() * (max - min) + min;
  console.log(`Delaying for ${delayTime}ms`);
  await new Promise(res => setTimeout(res, delayTime));
}

async function safeReload() {
  try {
    await page.reload({ waitUntil: 'networkidle2', timeout: 15000 });
    await randomDelay();
  } catch (error) {
    console.log('Reload failed, restarting browser...');
    await page.close();
    page = await browser.newPage();
    await initializePage();
  }
}

async function initializePage() {
  await page.setExtraHTTPHeaders(config.headers);
  await page.setUserAgent(config.userAgent);
  await page.setViewport({
    width: 1366 + Math.floor(Math.random() * 100),
    height: 768 + Math.floor(Math.random() * 100),
    deviceScaleFactor: 1
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--lang=he-IL'
    ]
  });

  try {
    page = await browser.newPage();
    await initializePage();

    // Initial navigation
    await page.goto(config.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await takeScreenshot('initial-page');

    // Price filter handling
    let filterApplied = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await page.waitForSelector(config.selectors.priceFilter, { timeout: 15000 });
        await page.click(config.selectors.priceFilter, { clickCount: 3 });
        await page.keyboard.type(config.maxPrice.toString());
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        await takeScreenshot(`post-filter-attempt-${attempt}`);
        filterApplied = true;
        break;
      } catch (error) {
        console.log(`Filter attempt ${attempt} failed: ${error.message}`);
        await takeScreenshot(`filter-fail-${attempt}`);
        await safeReload();
      }
    }

    if (!filterApplied) {
      throw new Error('Price filter application failed after 5 attempts');
    }

    // Listing extraction
    await page.waitForSelector(config.selectors.listItem, { timeout: 20000 });
    const cars = await page.$$eval(config.selectors.listItem, (items, cfg) => {
      return items.map(item => {
        try {
          return {
            title: item.querySelector(cfg.title)?.textContent?.trim() || '',
            price: item.querySelector(cfg.price)?.textContent?.replace(/\D/g, '') || '0',
            year: item.querySelector(cfg.year)?.textContent?.match(/\d+/)?.[0] || '',
            link: item.querySelector(cfg.link)?.href || ''
          };
        } catch (error) {
          return null;
        }
      }).filter(Boolean).filter(car => 
        parseInt(car.price) <= parseInt(cfg.maxPrice) && 
        car.link.startsWith('https://')
    }, { ...config.selectors, maxPrice: config.maxPrice });

    // Save results
    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`Successfully scraped ${cars.length} listings`);

  } catch (error) {
    fs.writeFileSync('debug.log', `[${new Date().toISOString()}] ERROR:\n${error.stack}\n\nPage content:\n${await page?.content()?.catch(() => '')}`);
    await takeScreenshot('final-error');
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
