const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Configuration
const config = {
  maxPrice: 10000,
  baseUrl: 'https://www.yad2.co.il/vehicles/cars',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
  selectors: {
    listItem: '[data-test-id="feed-item"]', // Updated selector
    title: '[data-test-id="title"]',
    price: '[data-test-id="price"]',
    year: '[data-test-id="year"]',
    link: 'a[href*="/vehicles/cars/"]', // Updated link pattern
    priceFilter: 'input[data-test-id="price-to"]' // Updated filter selector
  }
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Configure browser
    await page.setUserAgent(config.userAgent);
    await page.setViewport({ width: 1366, height: 768 });

    // Debug: Enable console logging
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Navigate to site
    await page.goto(config.baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Apply price filter
    await page.type(config.selectors.priceFilter, config.maxPrice.toString());
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);

    // Get listings
    const cars = await page.$$eval(config.selectors.listItem, (items, selectors) => {
      return items.map(item => ({
        title: item.querySelector(selectors.title)?.innerText?.trim() || '',
        price: item.querySelector(selectors.price)?.innerText?.replace(/\D/g, '') || '0',
        year: item.querySelector(selectors.year)?.innerText?.trim() || '',
        link: item.querySelector(selectors.link)?.href || ''
      }));
    }, config.selectors);

    // Filter results
    const filtered = cars.filter(car => 
      parseInt(car.price) <= config.maxPrice && car.link.includes('/vehicles/cars/')
    );

    // Save results
    fs.writeFileSync('cars.json', JSON.stringify(filtered, null, 2));
    console.log(`Found ${filtered.length} valid listings`);

    // Debug: Take screenshot
    await page.screenshot({ path: 'page.png' });

  } catch (error) {
    console.error('Error:', error);
    fs.writeFileSync('error.log', error.stack);
  } finally {
    await browser.close();
  }
})();
