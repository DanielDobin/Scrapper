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
    mainContent: '#main_page_wrapper, #main_content, main, [role="main"]',
    bodyContent: 'body'
  },
  delays: {
    short: 5000,
    medium: 15000,
    long: 30000
  },
  headless: true,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
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
      url: page ? await page.url() : null
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
    
    // Additional diagnostics
    if (page) {
      console.error('Current URL:', await page.url());
      console.error('Page title:', await page.title());
    }
    
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
  }, token);

  await safeAction(page,
    async () => page.click(config.selectors.submitButton),
    'captcha_submit',
    { selector: config.selectors.submitButton, timeout: config.delays.short }
  );
}

async function initializeBrowser() {
  const browser = await puppeteer
    .use(StealthPlugin())
    .launch({
      headless: config.headless ? "new" : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreHTTPSErrors: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });

  const page = await browser.newPage();
  
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
  });
  
  await page.setUserAgent(config.userAgent);
  await page.setViewport({ 
    width: 1366, 
    height: 768,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false
  });

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['image', 'stylesheet', 'font'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  return { browser, page };
}

(async () => {
  let browser;
  try {
    if (!process.env.CAPTCHA_API_KEY) {
      throw new Error('CAPTCHA_API_KEY environment variable is missing');
    }

    const { browser: b, page } = await initializeBrowser();
    browser = b;

    // Step 1: Navigate and verify content
    await safeAction(page, 
      async () => {
        await page.goto(config.baseUrl, { 
          waitUntil: 'networkidle2',
          timeout: config.delays.long,
          referer: 'https://www.google.com/'
        });
        
        await Promise.race([
          page.waitForSelector(config.selectors.mainContent, { 
            timeout: config.delays.medium 
          }),
          page.waitForSelector(config.selectors.captchaFrame, { 
            timeout: config.delays.medium 
          })
        ]);
      }, 
      '1_initial_navigation',
      { selector: `${config.selectors.mainContent}, ${config.selectors.captchaFrame}` }
    );

    // Step 2: CAPTCHA handling
    if (await page.$(config.selectors.captchaFrame)) {
      await safeAction(page,
        async () => solveCaptcha(page),
        '2_captcha_solving',
        { timeout: config.delays.long }
      );
      
      await safeAction(page,
        async () => page.waitForSelector(config.selectors.mainContent),
        '3_post_captcha_verify',
        { selector: config.selectors.mainContent }
      );
    }

    // Step 3: Price filter interaction
    await safeAction(page,
      async () => {
        const priceFilter = await page.$(config.selectors.priceFilter);
        await priceFilter.click({ clickCount: 3 });
        await priceFilter.type(config.maxPrice.toString());
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
      },
      '4_price_filter',
      { selector: config.selectors.priceFilter }
    );

    // Step 4: Results extraction
    const cars = await safeAction(page,
      async () => {
        await page.waitForSelector(config.selectors.listItem, { 
          timeout: config.delays.long 
        });
        return page.$$eval(config.selectors.listItem, items => 
          items.map(item => ({
            title: item.querySelector('[data-test-id="title"]')?.textContent?.trim() || '',
            price: item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, '') || '0',
            link: item.querySelector('a[href^="/vehicles/cars/"]')?.href || ''
          })).filter(car => parseInt(car.price) <= 10000)
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
