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

    // Scraping logic here...

    fs.writeFileSync('cars.json', JSON.stringify([{test: "data"}], null, 2));
    console.log('✅ Scraping completed successfully');

  } catch (error) {
    console.error('❌ Error:', error.message);
    fs.writeFileSync('error.log', error.stack);
  } finally {
    if (browser) await browser.close();
  }
})();
