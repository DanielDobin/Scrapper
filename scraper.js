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
    captchaResponse: 'textarea[name="h-captcha-response"]'
  }
};

async function handleError(error, page) {
  const errorDir = `${__dirname}/error-logs`;
  try {
    if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir, { recursive: true });
    
    fs.writeFileSync(
      `${errorDir}/error-${Date.now()}.json`,
      JSON.stringify({
        message: error.message,
        stack: error.stack,
        time: new Date().toISOString()
      }, null, 2)
    );

    if (page) {
      await page.screenshot({ path: `${errorDir}/screenshot-${Date.now()}.png` });
    }
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }
}

(async () => {
  let browser;
  try {
    if (!process.env.CAPTCHA_API_KEY) {
      throw new Error('CAPTCHA_API_KEY environment variable is missing');
    }

    const captchaSolver = new Solver(process.env.CAPTCHA_API_KEY);
    
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

    // Navigation and CAPTCHA handling
    await page.goto(config.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    if (await page.$(config.selectors.captchaFrame)) {
      const { data } = await captchaSolver.hcaptcha('ae73173b-7003-44e0-bc87-654d0dab8b75', config.baseUrl);
      await page.$eval(config.selectors.captchaResponse, (el, token) => el.value = token, data);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }

    // Data scraping
    await page.type(config.selectors.priceFilter, config.maxPrice.toString());
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    const cars = await page.$$eval(config.selectors.listItem, items => 
      items.map(item => ({
        title: item.querySelector('[data-test-id="title"]')?.textContent?.trim() || '',
        price: item.querySelector('[data-test-id="price"]')?.textContent?.replace(/\D/g, '') || '0',
        link: item.querySelector('a')?.href || ''
      })).filter(car => parseInt(car.price) <= config.maxPrice)
    );

    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`✅ Found ${cars.length} valid listings`);

  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    fs.writeFileSync('error.log', error.stack);
    await handleError(error, browser?.pages()?.[0]);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
