const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to Yad2 cars page
    await page.goto('https://www.yad2.co.il/vehicles/cars', { waitUntil: 'networkidle2', timeout: 60000 });

    // Apply price filter (under 10,000 ILS)
    await page.waitForSelector('[data-test-id="price"]', { timeout: 10000 });
    await page.type('[data-test-id="price"] input[placeholder="מקסימום"]', '10000');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(5000); // Wait for filter to apply

    let cars = [];
    let hasNextPage = true;
    let pageNumber = 1;

    while (hasNextPage) {
      console.log(`Scraping page ${pageNumber}...`);
      
      // Extract car listings
      const pageData = await page.$$eval('.feed_item', (items) => {
        return items.map(item => ({
          title: item.querySelector('.title').innerText.trim(),
          price: item.querySelector('.price').innerText.trim().replace('₪', ''),
          year: item.querySelector('.year').innerText.trim(),
          link: item.querySelector('a').href
        }));
      });

      // Filter valid entries (price < 10,000)
      const filtered = pageData.filter(car => parseInt(car.price.replace(/,/g, '')) < 10000);
      cars = [...cars, ...filtered];

      // Pagination
      const nextButton = await page.$('.pagination .next:not(.disabled)');
      if (nextButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
          nextButton.click()
        ]);
        pageNumber++;
        await page.waitForTimeout(3000); // Be polite
      } else {
        hasNextPage = false;
      }
    }

    // Save results
    fs.writeFileSync('cars.json', JSON.stringify(cars, null, 2));
    console.log(`Found ${cars.length} cars under 10,000 ILS`);

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
