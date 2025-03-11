const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const solver = require('2captcha');
const fs = require('fs');

puppeteer.use(StealthPlugin());
const captchaSolver = new solver.Solver(process.env.CAPTCHA_API_KEY);

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
    // Configure browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // Navigate to page
    await page.goto(config.baseUrl, { waitUntil: 'networkidle2' });

    // Handle CAPTCHA if present
    if (await page.$(config.selectors.captchaFrame)) {
      const { data } = await captchaSolver.hcaptcha('ae73173b-7003-44e0-bc87-654d0dab8b75', config.baseUrl);
      await page.$eval(config.selectors.captchaResponse, (el, token) => el.value = token, data);
      await page.click('button[type="submit"]');
      await page.waitForNavigation();
    }

    // Apply price filter
    await page.type(config.selectors.priceFilter, config.maxPrice.toString());
    await page.keyboard.press('Enter');
    await page.waitForNavigation();

    // Scrape results
    const cars = await page.$$eval(config.selectors.listItem, items => 
      items.map(item => ({
        title: item.querySelector('.title')?.textContent?.trim() || '',
        price: item.querySelector('.price')?.textContent?.replace(/\D/g, '') || '0',
        link: item.querySelector('a')?.href || ''
      })).filter(car => parseInt(car.price) <= 10000)
    );

    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));

  } catch (error) {
    console.error(error);
    await page.screenshot({ path: `error-${Date.now()}.png` });
    fs.writeFileSync('error.log', error.stack);
  } finally {
    await browser.close();
  }
})();
