const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Solver } = require('2captcha'); // Fixed import
const fs = require('fs');

puppeteer.use(StealthPlugin());
const captchaSolver = new Solver(process.env.CAPTCHA_API_KEY); // Renamed variable

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
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  try {
    // ... rest of your code stays the same until captcha handling:
    
    if (await page.$(config.selectors.captchaFrame)) {
      const { data } = await captchaSolver.hcaptcha('ae73173b-7003-44e0-bc87-654d0dab8b75', config.baseUrl);
      await page.$eval(config.selectors.captchaResponse, (el, token) => el.value = token, data);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }
    
    // ... rest of your original code
