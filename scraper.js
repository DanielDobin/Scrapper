import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Solver } from '2captcha';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  selectors: {
    priceFilter: 'input[data-test-id="price-to"], input[name="price_to"]',
    listItem: '[data-test-id="feed-item"]',
    captchaFrame: 'iframe[src*="hcaptcha"]',
    captchaCheckbox: '.hcaptcha-box',
    captchaResponse: 'textarea[name="h-captcha-response"]',
    submitButton: 'button[type="submit"]',
    mainContent: '#feed_content, #main_layout, #main_content, main',
    bodyContent: 'body'
  },
  delays: {
    short: 10000,
    medium: 30000,
    long: 60000
  },
  headless: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
};

async function captureScreenshot(page, stepName) {
  const path = `${__dirname}/screenshots/${Date.now()}-${stepName}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function handleError(error, page, stepName) {
  const errorData = {
    message: error.message,
    stack: error.stack,
    time: new Date().toISOString(),
    step: stepName,
    screenshot: page ? await captureScreenshot(page, `error-${stepName}`) : null,
    html: page ? await page.content() : null,
    url: page ? await page.url() : null
  };
  fs.writeFileSync(`${__dirname}/error-${Date.now()}.json`, JSON.stringify(errorData, null, 2));
}

async function safeAction(page, action, stepName, options = {}) {
  try {
    console.log(`🔍 [${stepName}] Starting...`);
    await action();
    await captureScreenshot(page, `success-${stepName}`);
  } catch (error) {
    console.error(`❌ [${stepName}] Failed: ${error.message}`);
    await captureScreenshot(page, `error-${stepName}`);
    await handleError(error, page, stepName);
    throw error;
  }
}

async function solveCaptcha(page) {
  const solver = new Solver(process.env.CAPTCHA_API_KEY);
  const { data: token } = await solver.hcaptcha(
    'ae73173b-7003-44e0-bc87-654d0dab8b75',
    page.url()
  );
  await page.evaluate((t) => {
    document.querySelector('textarea[name="h-captcha-response"]').value = t;
  }, token);
  await page.click(config.selectors.submitButton);
}

async function initializeBrowser() {
  const browser = await puppeteer
    .use(StealthPlugin())
    .launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--window-size=1366,768'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });

  const page = await browser.newPage();
  await page.setUserAgent(config.userAgent);
  await page.setViewport({ width: 1366, height: 768 });
  
  // Critical: Only block images
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    req.resourceType() === 'image' ? req.abort() : req.continue();
  });

  return { browser, page };
}

(async () => {
  let browser;
  try {
    const { browser: b, page } = await initializeBrowser();
    browser = b;

    // Step 1: Force navigation and verify
    await safeAction(page, async () => {
      await page.goto(config.baseUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
        referer: 'https://www.google.com/'
      });
      
      // Verify actual page content
      await page.waitForFunction(
        () => document.title.includes('Yad2') || document.querySelector('#feed_content'),
        { timeout: 60000 }
      );
      
      console.log('Loaded URL:', await page.url());
      console.log('Page title:', await page.title());
    }, 'navigation');

    // Step 2: Handle CAPTCHA if present
    if (await page.$(config.selectors.captchaFrame)) {
      await safeAction(page, () => solveCaptcha(page), 'captcha');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    }

    // Step 3: Interact with page
    await safeAction(page, async () => {
      await page.type(config.selectors.priceFilter, config.maxPrice.toString());
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
    }, 'price-filter');

    // Step 4: Extract data
    const results = await safeAction(page, async () => 
      page.$$eval(config.selectors.listItem, items => 
        items.map(item => ({
          title: item.querySelector('[data-test-id="title"]')?.textContent?.trim(),
          price: item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, ''),
          link: item.querySelector('a')?.href
        })).filter(car => parseInt(car.price) <= 10000)
      ), 'data-extraction'
    );

    fs.writeFileSync('cars.json', JSON.stringify(results, null, 2));
    console.log(`✅ Found ${results.length} listings`);

  } catch (error) {
    console.error('💀 Critical failure:', error.message);
    process.exit(1);
  } finally {
    await browser?.close();
  }
})();
