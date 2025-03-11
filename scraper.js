const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const solver = require('2captcha');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());
const captchaSolver = new solver.Solver('aed1e56d88e5524d8367481ad2ea7321');

const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  captcha: {
    siteKey: 'ae73173b-7003-44e0-bc87-654d0dab8b75',
    pageUrl: 'https://www.yad2.co.il/vehicles/cars'
  },
  selectors: {
    priceFilter: 'input[data-test-id="price-to"]',
    listItem: 'div[data-test-id="feed-item"]',
    captchaFrame: 'iframe[src*="hcaptcha"]',
    captchaResponse: 'textarea[name="h-captcha-response"]'
  }
};

async function solveCaptcha(page) {
  try {
    console.log('Solving CAPTCHA...');
    const { data } = await captchaSolver.hcaptcha(
      config.captcha.siteKey,
      config.captcha.pageUrl
    );

    await page.waitForSelector(config.selectors.captchaResponse, { visible: true });
    await page.evaluate((selector, token) => {
      document.querySelector(selector).value = token;
    }, config.selectors.captchaResponse, data);

    await page.evaluate(() => {
      document.querySelector('form[action*="verify"]').submit();
    });
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    return true;
  } catch (error) {
    await page.screenshot({ path: 'captcha-error.png' });
    throw new Error(`CAPTCHA solve failed: ${error.message}`);
  }
}

async function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--lang=he-IL'
    ]
  });

  const page = await browser.newPage();
  
  try {
    // Configure browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({
      width: 1366 + Math.floor(Math.random() * 100),
      height: 768 + Math.floor(Math.random() * 100),
      deviceScaleFactor: 1
    });

    // Initial navigation
    console.log('Navigating to Yad2...');
    await page.goto(config.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // CAPTCHA handling
    if (await page.$(config.selectors.captchaFrame)) {
      console.log('CAPTCHA detected');
      await solveCaptcha(page);
      await delay(3000);
    }

    // Apply price filter
    console.log('Applying price filter...');
    await page.waitForSelector(config.selectors.priceFilter, { timeout: 15000 });
    await page.type(config.selectors.priceFilter, config.maxPrice.toString());
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await delay(2000);

    // Scrape results
    console.log('Scraping listings...');
    const cars = await page.$$eval(config.selectors.listItem, items => 
      items.map(item => ({
        title: item.querySelector('.title')?.textContent?.trim() || '',
        price: item.querySelector('.price')?.textContent?.replace(/\D/g, '') || '0',
        year: item.querySelector('.year')?.textContent?.trim() || '',
        link: item.querySelector('a')?.href || ''
      })).filter(car => parseInt(car.price) <= 10000)
    );

    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`Found ${cars.length} valid listings`);

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: `error-${Date.now()}.png` });
    fs.writeFileSync('error.log', error.stack);
  } finally {
    await browser.close();
  }
})();
