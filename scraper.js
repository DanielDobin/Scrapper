const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Configuration
const MAX_PRICE = 10000;
const BASE_URL = 'https://www.yad2.co.il/vehicles/cars';
const DELAY = ms => new Promise(res => setTimeout(res, ms));

(async () => {
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  headless: "new",
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--single-process'  # Added for better resource management
  ]
});

  try {
    const page = await browser.newPage();
    
    // Set realistic viewport
    await page.setViewport({
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: false
    });

    // Set random user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    console.log('Navigating to Yad2...');
    await page.goto(BASE_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Apply price filter
    console.log('Setting price filter...');
    await page.type('input[data-test-id="price_max"]', MAX_PRICE.toString());
    await page.keyboard.press('Enter');
    await DELAY(3000 + Math.random() * 2000);

    let cars = [];
    let pageNumber = 1;

    while (true) {
      console.log(`Processing page ${pageNumber}...`);
      
      // Extract car data
      const pageData = await page.$$eval('.feed_item', items => 
        items.map(item => ({
          title: item.querySelector('.title')?.innerText.trim() || 'N/A',
          price: item.querySelector('.price')?.innerText.trim().replace(/\D/g, '') || '0',
          year: item.querySelector('.year')?.innerText.trim() || 'N/A',
          link: item.querySelector('a')?.href || 'N/A'
        }))
      );

      // Filter valid entries
      const validCars = pageData.filter(car => 
        parseInt(car.price) < MAX_PRICE && car.link !== 'N/A'
      );
      cars.push(...validCars);

      // Check for next page
      const nextButton = await page.$('.pagination .next:not(.disabled)');
      if (!nextButton) break;

      // Simulate human-like click
      await DELAY(1500 + Math.random() * 3000);
      await nextButton.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      pageNumber++;
    }

    // Save results
    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`✅ Found ${cars.length} cars under ${MAX_PRICE} ILS`);

  } catch (error) {
    console.error('❌ Error:', error);
    fs.writeFileSync('error.log', error.stack);
    await page.screenshot({ path: 'error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
