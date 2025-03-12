import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Solver } from '2captcha';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure directories exist
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

// ... (keep previous captureScreenshot and handleError functions)

async function setPriceFilter(page) {
  console.log('🔧 Setting price filter');
  await captureScreenshot(page, 'before-price-filter');
  
  // Wait for price input with multiple fallbacks
  const priceInput = await page.waitForSelector(config.selectors.priceFilter, {
    visible: true,
    timeout: config.delays.action
  }).catch(() => {
    throw new Error(`Price filter not found. Tried: ${config.selectors.priceFilter}`);
  });

  await priceInput.click({ clickCount: 3 });
  await priceInput.type(config.maxPrice.toString());
  await priceInput.press('Enter');
  
  await page.waitForNavigation({ 
    waitUntil: 'domcontentloaded',
    timeout: config.delays.navigation 
  });
  
  await captureScreenshot(page, 'after-price-filter');
}

async function mainFlow() {
  let browser;
  try {
    const { browser: b, page } = await initializeBrowser();
    browser = b;

    await safeNavigation(page, config.baseUrl);
    
    if (await page.$(config.selectors.captchaFrame)) {
      console.log('🔍 CAPTCHA detected');
      await solveCaptcha(page);
      await page.waitForNavigation({ timeout: config.delays.navigation });
      await captureScreenshot(page, 'after-captcha');
    }

    await setPriceFilter(page);
    
    console.log('📦 Extracting listings');
    const listings = await page.$$eval(config.selectors.listItem, items => 
      items.map(item => ({
        title: item.querySelector('[data-test-id="title"]')?.textContent?.trim(),
        price: item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, ''),
        link: item.querySelector('a')?.href
      })).filter(car => parseInt(car.price) <= 10000)
    );
    
    fs.writeFileSync('cars.json', JSON.stringify(listings, null, 2));
    console.log(`✅ Success! Found ${listings.length} listings`);

  } catch (error) {
    console.error('💀 Critical failure:', error.message);
    process.exitCode = 1; // Set exit code but don't throw
  } finally {
    await browser?.close();
  }
}

// Start the process
mainFlow();
