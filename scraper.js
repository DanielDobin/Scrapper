const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Solver } = require('2captcha');
const fs = require('fs');

async function runScraper() {
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

  const browser = await puppeteer
    .use(StealthPlugin())
    .launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // Navigation
    await page.goto(config.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // CAPTCHA handling
    if (await page.$(config.selectors.captchaFrame)) {
      const solver = new Solver(process.env.CAPTCHA_API_KEY);
      const { data } = await solver.hcaptcha('ae73173b-7003-44e0-bc87-654d0dab8b75', config.baseUrl);
      await page.$eval(config.selectors.captchaResponse, (el, token) => el.value = token, data);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }

    // Filter and scrape
    await page.type(config.selectors.priceFilter, config.maxPrice.toString());
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // Fixed syntax here
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
    console.error('❌ Error:', error.message);
    fs.writeFileSync('error.log', error.stack);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runScraper();
