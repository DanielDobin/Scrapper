const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Solver } = require('2captcha');
const fs = require('fs');
const path = require('path');

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

async function handleError(error, page = null) {
  const errorDir = path.join(__dirname, 'error-logs');
  const timestamp = Date.now();
  
  try {
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(errorDir, `error-${timestamp}.json`),
      JSON.stringify({
        message: error.message,
        stack: error.stack,
        time: new Date().toISOString()
      }, null, 2)
    );

    if (page) {
      await page.screenshot({
        path: path.join(errorDir, `screenshot-${timestamp}.png`),
        fullPage: true
      });
    }
  } catch (logError) {
    console.error('Error logging failed:', logError);
  }
}

(async () => {
  let browser;
  try {
    if (!process.env.CAPTCHA_API_KEY) {
      throw new Error('Missing CAPTCHA_API_KEY environment variable');
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

    await page.goto(config.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    if (await page.$(config.selectors.captchaFrame)) {
      const { data } = await captchaSolver.hcaptcha('ae73173b-7003-44e0-bc87-654d0dab8b75', config.baseUrl);
      await page.$eval(config.selectors.captchaResponse, (el, token) => el.value = token, data);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }

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
    await handleError(error, browser?.pages()?.[0]);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
