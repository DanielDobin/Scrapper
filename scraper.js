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
    priceFilter: 'input[data-test-id="price-to"]',
    listItem: 'div[data-test-id="feed-item"]',
    captchaFrame: 'iframe[src*="hcaptcha"]',
    captchaResponse: 'textarea[name="h-captcha-response"]',
    submitButton: 'button[type="submit"]'
  },
  delays: {
    short: 1000,
    medium: 3000,
    long: 10000
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
      screenshot: page ? await captureScreenshot(page, `error-${stepName}`) : null
    };

    fs.writeFileSync(
      `${errorDir}/error-${timestamp}.json`,
      JSON.stringify(errorData, null, 2)
    );

  } catch (logError) {
    console.error('Error logging failed:', logError);
  }
}

async function safeAction(page, action, selector, stepName) {
  try {
    console.log(`🔍 [${stepName}] Waiting for selector: ${selector}`);
    await page.waitForSelector(selector, { timeout: config.delays.long });
    console.log(`✅ [${stepName}] Selector found`);
    await captureScreenshot(page, `before-${stepName}`);
    const result = await action();
    await captureScreenshot(page, `after-${stepName}`);
    return result;
  } catch (error) {
    await captureScreenshot(page, `error-${stepName}`);
    throw new Error(`🚨 [${stepName}] Failed: ${error.message}`);
  }
}

(async () => {
  let browser;
  try {
    if (!process.env.CAPTCHA_API_KEY) {
      throw new Error('CAPTCHA_API_KEY environment variable is missing');
    }

    // Initialize browser
    browser = await puppeteer
      .use(StealthPlugin())
      .launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // Step 1: Navigate to page
    console.log('🌐 Step 1: Navigating to page...');
    await page.goto(config.baseUrl, { 
      waitUntil: 'networkidle2', 
      timeout: config.delays.long 
    });
    await captureScreenshot(page, '1-page-loaded');

    // Step 2: Handle CAPTCHA if present
    console.log('🔍 Step 2: Checking for CAPTCHA...');
    if (await page.$(config.selectors.captchaFrame)) {
      console.log('🛡️ Step 2a: Solving CAPTCHA...');
      const solver = new Solver(process.env.CAPTCHA_API_KEY);
      const { data } = await solver.hcaptcha('ae73173b-7003-44e0-bc87-654d0dab8b75', config.baseUrl);
      
      await safeAction(page, 
        async () => {
          await page.$eval(config.selectors.captchaResponse, (el, token) => el.value = token, data);
          await page.click(config.selectors.submitButton);
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.delays.long });
        },
        config.selectors.captchaResponse,
        '2a-solve-captcha'
      );
      await captureScreenshot(page, '2b-captcha-solved');
    }

    // Step 3: Find and interact with price filter
    console.log('💵 Step 3: Setting price filter...');
    await safeAction(page,
      async () => {
        const priceFilter = await page.$(config.selectors.priceFilter);
        await priceFilter.type(config.maxPrice.toString());
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.delays.long });
      },
      config.selectors.priceFilter,
      '3-set-price-filter'
    );

    // Step 4: Verify results
    console.log('📊 Step 4: Extracting results...');
    const cars = await safeAction(page,
      async () => page.$$eval(config.selectors.listItem, items => 
        items.map(item => ({
          title: item.querySelector('[data-test-id="title"]')?.textContent?.trim() || '',
          price: item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, '') || '0',
          link: item.querySelector('a')?.href || ''
        })).filter(car => parseInt(car.price) <= config.maxPrice)
      ),
      config.selectors.listItem,
      '4-extract-results'
    );

    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`✅ Success! Found ${cars.length} listings`);

  } catch (error) {
    console.error('❌ Critical error:', error.message);
    fs.writeFileSync('error.log', error.stack);
    await handleError(error, browser?.pages()?.[0], 'final-error');
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
