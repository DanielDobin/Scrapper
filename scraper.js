// scraper.js
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
    mainContent: '#main_content, .main_content, main'
  },
  delays: {
    short: 5000,
    medium: 15000,
    long: 30000
  },
  headless: true
};

async function captureScreenshot(page, stepName) {
  const timestamp = Date.now();
  const screenshotsDir = `${__dirname}/screenshots`;
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
  const path = `${screenshotsDir}/${timestamp}-${stepName.replace(/ /g, '_')}.png`;
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
      html: page ? await page.content() : null,
      url: page ? page.url() : null
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
  const { selector, timeout = config.delays.long, optional = false } = options;
  try {
    console.log(`🔍 [${stepName}] Starting action...`);
    
    if (selector && !optional) {
      console.log(`⏳ [${stepName}] Waiting for selector: ${selector}`);
      await page.waitForSelector(selector, { 
        timeout,
        visible: true 
      }).catch(() => {
        throw new Error(`Selector not found: ${selector}`);
      });
    }

    await captureScreenshot(page, `before_${stepName}`);
    const result = await action();
    await captureScreenshot(page, `after_${stepName}`);
    return result;
  } catch (error) {
    await captureScreenshot(page, `error_${stepName}`);
    await handleError(error, page, stepName);
    throw error;
  }
}

async function solveCaptcha(page) {
  const solver = new Solver(process.env.CAPTCHA_API_KEY);
  
  const captchaFrame = await page.$('iframe[src*="hcaptcha"]');
  const frame = await captchaFrame.contentFrame();
  
  await safeAction(page, 
    async () => frame.click(config.selectors.captchaCheckbox),
    'captcha_click_checkbox',
    { selector: config.selectors.captchaCheckbox, timeout: config.delays.short }
  );

  const { data: token } = await solver.hcaptcha(
    'ae73173b-7003-44e0-bc87-654d0dab8b75',
    page.url()
  );

  await page.evaluate((token) => {
    document.querySelector('textarea[name="h-captcha-response"]').value = token;
    document.querySelector('input[name="g-recaptcha-response"]').value = token;
  }, token);

  await safeAction(page,
    async () => page.click(config.selectors.submitButton),
    'captcha_submit',
    { selector: config.selectors.submitButton, timeout: config.delays.short }
  );
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
        headless: config.headless ? "new" : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--single-process',
          '--no-zygote',
          '--disable-gpu',
          '--disable-infobars',
          '--window-position=0,0',
          '--ignore-certificate-errors',
          '--ignore-certificate-errors-spki-list'
        ],
        ignoreHTTPSErrors: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
      });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    });
    
    await page.setViewport({ width: 1366, height: 768 });
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigation with multiple verification points
    await safeAction(page, 
      async () => {
        await page.goto(config.baseUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: config.delays.long 
        });
        
        // Verify either main content or captcha presence
        await Promise.race([
          page.waitForSelector(config.selectors.mainContent, { timeout: config.delays.medium }),
          page.waitForSelector(config.selectors.captchaFrame, { timeout: config.delays.medium })
        ]);
      }, 
      '1_initial_navigation',
      { selector: `${config.selectors.mainContent}, ${config.selectors.captchaFrame}`, timeout: config.delays.long }
    );

    // Handle potential CAPTCHA
    if (await page.$(config.selectors.captchaFrame)) {
      await safeAction(page,
        async () => solveCaptcha(page),
        '2_captcha_solving',
        { timeout: config.delays.long }
      );
      
      // Post-CAPTCHA verification
      await safeAction(page,
        async () => page.waitForSelector(config.selectors.mainContent, { timeout: config.delays.long }),
        '3_post_captcha_verification',
        { selector: config.selectors.mainContent }
      );
    }

    // Price filter interaction
    await safeAction(page,
      async () => {
        await page.waitForNetworkIdle({ timeout: config.delays.short });
        const priceFilter = await page.$(config.selectors.priceFilter);
        await priceFilter.click({ clickCount: 3 });
        await priceFilter.type(config.maxPrice.toString());
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: config.delays.long });
      },
      '4_price_filter',
      { selector: config.selectors.priceFilter }
    );

    // Results extraction with retry logic
    const cars = await safeAction(page,
      async () => {
        await page.waitForSelector(config.selectors.listItem, { timeout: config.delays.long });
        return page.$$eval(config.selectors.listItem, items => 
          items.map(item => ({
            title: item.querySelector('[data-test-id="title"]')?.textContent?.trim() || '',
            price: (item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, '') || '0').trim(),
            link: item.querySelector('a[href^="/vehicles/cars/"]')?.href || ''
          })).filter(car => parseInt(car.price) <= config.maxPrice)
        );
      },
      '5_data_extraction',
      { selector: config.selectors.listItem }
    );

    fs.writeFileSync('cars.json', JSON.stringify({ count: cars.length, data: cars }, null, 2));
    console.log(`✅ Success! Found ${cars.length} valid listings`);

  } catch (error) {
    console.error('❌ Critical error:', error.message);
    fs.writeFileSync('error.log', error.stack);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
