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
    listItem: 'div[data-test-id="feed-item"]',
    title: 'h2.feed-item-title',
    price: 'div.feed-item-price',
    year: 'div.feed-item-year',
    link: 'a.feed-item-link'
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  screenshotPath: 'screenshots'
};

let browser = null;
let page = null;

async function takeScreenshot(name) {
  try {
    if (!page || page.isClosed()) return;
    
    if (!fs.existsSync(config.screenshotPath)) {
      fs.mkdirSync(config.screenshotPath);
    }
    
    const filename = `${name}-${Date.now()}.png`;
    await page.screenshot({
      path: path.join(config.screenshotPath, filename),
      fullPage: true
    });
    console.log(`Saved screenshot: ${filename}`);
  } catch (error) {
    console.error('Screenshot failed:', error);
  }
}

async function randomDelay(min = 2000, max = 5000) {
  const delayTime = Math.floor(Math.random() * (max - min) + min);
  console.log(`Delaying for ${delayTime}ms`);
  await new Promise(res => setTimeout(res, delayTime));
}

async function safeReload() {
  try {
    await takeScreenshot('pre-reload');
    await page.reload({ waitUntil: 'networkidle2', timeout: 15000 });
    await randomDelay();
  } catch (error) {
    console.error('Reload failed, restarting browser...');
    await page.close();
    page = await browser.newPage();
    await initializePage();
  }
}

async function initializePage() {
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'he-IL,he;q=0.9',
    'Referer': 'https://www.yad2.co.il/'
  });
  await page.setUserAgent(config.userAgent);
  await page.setViewport({
    width: 1366 + Math.floor(Math.random() * 100),
    height: 768 + Math.floor(Math.random() * 100),
    deviceScaleFactor: 1
  });
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

(async () => {
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--lang=he-IL'
      ]
    });

    page = await browser.newPage();
    await initializePage();

    // Initial navigation
    await page.goto(config.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await takeScreenshot('initial-page');

    // Price filter handling with retries
    let filterApplied = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const priceInput = await page.waitForSelector(config.selectors.priceFilter, { timeout: 15000 });
        await priceInput.click({ clickCount: 3 });
        await priceInput.type(config.maxPrice.toString());
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
        await takeScreenshot(`post-filter-attempt-${attempt}`);
        filterApplied = true;
        break;
      } catch (error) {
        console.error(`Filter attempt ${attempt} failed: ${error.message}`);
        await takeScreenshot(`filter-fail-${attempt}`);
        await safeReload();
      }
    }

    if (!filterApplied) {
      throw new Error('Price filter application failed after 5 attempts');
    }

    // Scrape listings
    await page.waitForSelector(config.selectors.listItem, { timeout: 20000 });
    const cars = await page.$$eval(config.selectors.listItem, (items, selectors) => {
      return items.map(item => {
        try {
          return {
            title: item.querySelector(selectors.title)?.textContent?.trim() || '',
            price: item.querySelector(selectors.price)?.textContent?.replace(/\D/g, '') || '0',
            year: item.querySelector(selectors.year)?.textContent?.match(/\d+/)?.[0] || '',
            link: item.querySelector(selectors.link)?.href || ''
          };
        } catch (error) {
          return null;
        }
      }).filter(Boolean);
    }, config.selectors);

    // Save results
    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`Successfully found ${cars.length} listings`);

  } catch (error) {
    console.error('Critical error:', error);
    fs.writeFileSync('debug.log', `[${new Date().toISOString()}]\n${error.stack}\n\nPage content:\n${await page?.content()?.catch(() => '')}`);
    await takeScreenshot('final-error');
  } finally {
    await takeScreenshot('final-state');
    if (browser) await browser.close();
  }
})();
