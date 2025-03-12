import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Solver } from '2captcha';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Create required directories
fs.mkdirSync(`${__dirname}/screenshots`, { recursive: true });
fs.mkdirSync(`${__dirname}/error-logs`, { recursive: true });

const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  selectors: {
    priceFilter: [
      'input[data-test-id="price-to"]',
      'input[name="price_to"]',
      'input[aria-label="מחיר עד"]',
      '#price_to'
    ].join(','),
    listItem: '[data-test-id="feed-item"]',
    captchaFrame: 'iframe[src*="hcaptcha"]',
    captchaCheckbox: '.hcaptcha-box',
    captchaResponse: 'textarea[name="h-captcha-response"]',
    submitButton: 'button[type="submit"]',
    mainContent: '#feed_content, #main_layout, main'
  },
  delays: {
    navigation: 120000,
    action: 30000
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
  fs.writeFileSync(`${__dirname}/error-logs/error-${Date.now()}.json`, JSON.stringify(errorData, null, 2));
}

async function safeNavigation(page, url) {
  console.log(`🌐 Navigating to: ${url}`);
  const response = await page.goto(url, {
    waitUntil: 'networkidle2',
    timeout: config.delays.navigation
  });

  if (!response.ok()) {
    throw new Error(`Navigation failed: ${response.status()} ${response.statusText()}`);
  }

  console.log('✅ Page loaded successfully');
  console.log('Final URL:', page.url());
  console.log('Page title:', await page.title());
  await captureScreenshot(page, 'page-loaded');
}

async function solveCaptcha(page) {
  console.log('🔍 Solving CAPTCHA');
  const solver = new Solver(process.env.CAPTCHA_API_KEY);
  const { data: token } = await solver.hcaptcha(
    'ae73173b-7003-44e0-bc87-654d0dab8b75',
    page.url()
  );
  
  await page.evaluate((t) => {
    document.querySelector('textarea[name="h-captcha-response"]').value = t;
  }, token);
  
  await page.click(config.selectors.submitButton);
  await page.waitForNavigation({ timeout: config.delays.navigation });
  await captureScreenshot(page, 'after-captcha');
}

async function setPriceFilter(page) {
  console.log('🔧 Setting price filter');
  await captureScreenshot(page, 'before-price-filter');
  
  const priceInput = await page.waitForSelector(config.selectors.priceFilter, {
    visible: true,
    timeout: config.delays.action
  }).catch(() => {
    throw new Error(`Price filter not found using selectors: ${config.selectors.priceFilter}`);
  });

  await priceInput.click({ clickCount: 3 });
  await priceInput.type(config.maxPrice.toString());
  await priceInput.press('Enter');
  
  await page.waitForNavigation({ 
    waitUntil: 'networkidle2',
    timeout: config.delays.navigation 
  });
  
  await captureScreenshot(page, 'after-price-filter');
}

async function extractListings(page) {
  console.log('📦 Extracting listings');
  await page.waitForSelector(config.selectors.listItem, { timeout: config.delays.action });
  
  return page.$$eval(config.selectors.listItem, items => 
    items.map(item => ({
      title: item.querySelector('[data-test-id="title"]')?.textContent?.trim() || '',
      price: item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, '') || '0',
      link: item.querySelector('a[href^="/vehicles/cars/"]')?.href || ''
    })).filter(car => parseInt(car.price) <= 10000)
  );
}

async function initializeBrowser() {
  return puppeteer
    .use(StealthPlugin())
    .launch({
      headless: config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1366,768'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });
}

(async () => {
  let browser;
  try {
    browser = await initializeBrowser();
    const page = await browser.newPage();
    
    // Configure browser
    await page.setUserAgent(config.userAgent);
    await page.setViewport({ width: 1366, height: 768 });
    await page.setRequestInterception(true);
    page.on('request', req => req.resourceType() === 'image' ? req.abort() : req.continue());

    // Execute workflow
    await safeNavigation(page, config.baseUrl);
    
    if (await page.$(config.selectors.captchaFrame)) {
      await solveCaptcha(page);
    }
    
    await setPriceFilter(page);
    const listings = await extractListings(page);
    
    fs.writeFileSync('cars.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      count: listings.length,
      data: listings
    }, null, 2));
    
    console.log(`✅ Success! Found ${listings.length} listings`);

  } catch (error) {
    console.error('💀 Critical failure:', error.message);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
})();
