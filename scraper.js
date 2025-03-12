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
    listItem: 'div[data-test-id="feed-item"]',
    captchaFrame: 'iframe[src*="hcaptcha"]',
    captchaResponse: 'textarea[name="h-captcha-response"]',
    submitButton: 'button[type="submit"]',
    mainContent: '#main-content, .main-wrapper, [role="main"]'
  },
  delays: {
    short: 2000,
    medium: 5000,
    long: 15000
  }
};

async function captureScreenshot(page, stepName) {
  const timestamp = Date.now();
  const screenshotsDir = `${__dirname}/screenshots`;
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
  const path = `${screenshotsDir}/${timestamp}-${stepName.replace(/ /g, '-')}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function handleError(error, page, stepName) {
  const errorDir = `${__dirname}/error-logs`;
  const timestamp = Date.now();
  
  try {
    if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir, { recursive: true });
    
    const errorData = {
      message: error.message,
      stack: error.stack,
      time: new Date().toISOString(),
      step: stepName,
      screenshot: page ? await captureScreenshot(page, `error-${stepName}`) : null,
      html: page ? await page.content() : null
    };

    fs.writeFileSync(
      `${errorDir}/error-${timestamp}.json`,
      JSON.stringify(errorData, null, 2)
    );

  } catch (logError) {
    console.error('Error logging failed:', logError);
  }
}

async function safeAction(page, action, stepName, options = {}) {
  const { selector, timeout = config.delays.long } = options;
  try {
    console.log(`🔍 [${stepName}] Starting action...`);
    
    if (selector) {
      console.log(`⏳ [${stepName}] Waiting for selector: ${selector}`);
      await page.waitForSelector(selector, { timeout }).catch(() => {
        throw new Error(`Selector not found: ${selector}`);
      });
    }

    await captureScreenshot(page, `before-${stepName}`);
    const result = await action();
    await captureScreenshot(page, `after-${stepName}`);
    return result;
  } catch (error) {
    await captureScreenshot(page, `error-${stepName}`);
    await handleError(error, page, stepName);
    throw error;
  }
}

(async () => {
  let browser;
  try {
    if (!process.env.CAPTCHA_API_KEY) {
      throw new Error('CAPTCHA_API_KEY environment variable is missing');
    }

    browser = await puppeteer
      .use(StealthPlugin())
      .launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
        ignoreHTTPSErrors: true
      });

    const page = await browser.newPage();
    await page.setJavaScriptEnabled(true);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // Step 1: Navigate and verify main content
    await safeAction(page, 
      async () => {
        await page.goto(config.baseUrl, { 
          waitUntil: 'networkidle2', 
          timeout: config.delays.long 
        });
      }, 
      '1-navigate',
      { selector: config.selectors.mainContent }
    );

    // Step 2: CAPTCHA handling
    let captchaSolved = false;
    if (await page.$(config.selectors.captchaFrame)) {
      await safeAction(page,
        async () => {
          const solver = new Solver(process.env.CAPTCHA_API_KEY);
          const { data } = await solver.hcaptcha('ae73173b-7003-44e0-bc87-654d0dab8b75', config.baseUrl);
          await page.$eval(config.selectors.captchaResponse, (el, token) => el.value = token, data);
          await page.click(config.selectors.submitButton);
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.delays.long });
          captchaSolved = true;
        },
        '2-solve-captcha',
        { selector: config.selectors.captchaResponse }
      );
    }

    // Step 3: Verify post-CAPTCHA state
    if (captchaSolved) {
      await safeAction(page,
        async () => {
          await page.waitForSelector(config.selectors.mainContent, { timeout: config.delays.long });
        },
        '3-post-captcha-verify',
        { selector: config.selectors.mainContent }
      );
    }

    // Step 4: Price filter interaction
    await safeAction(page,
      async () => {
        const priceFilter = await page.$(config.selectors.priceFilter);
        await priceFilter.click({ clickCount: 3 });
        await priceFilter.type(config.maxPrice.toString());
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.delays.long });
      },
      '4-set-price-filter',
      { selector: config.selectors.priceFilter }
    );

    // Step 5: Results extraction
    const cars = await safeAction(page,
      async () => page.$$eval(config.selectors.listItem, items => 
        items.map(item => ({
          title: item.querySelector('[data-test-id="title"]')?.textContent?.trim() || '',
          price: item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, '') || '0',
          link: item.querySelector('a')?.href || ''
        })).filter(car => parseInt(car.price) <= 10000)
      ),
      '5-extract-results',
      { selector: config.selectors.listItem }
    );

    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`✅ Success! Found ${cars.length} valid listings`);

  } catch (error) {
    console.error('❌ Critical error:', error.message);
    fs.writeFileSync('error.log', error.stack);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
