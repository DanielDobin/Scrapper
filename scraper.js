const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Solver = require('2captcha-api').Solver;
const fs = require('fs');
const util = require('util');

// Create promisified versions of fs methods
const writeFile = util.promisify(fs.writeFile);

// Initialize solver with error handling
let captchaSolver;
try {
  captchaSolver = new Solver(process.env.CAPTCHA_API_KEY);
} catch (error) {
  console.error('CAPTCHA Solver initialization failed:');
  console.error(error.stack);
  process.exit(1);
}

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
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      dumpio: true // Enable verbose logging
    });

    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // Rest of your scraping code...

  } catch (error) {
    console.error('MAIN ERROR:');
    console.error(error.stack);
    
    // Write detailed error log
    await writeFile('full-error.log', 
      `Error: ${error.message}\n` +
      `Stack: ${error.stack}\n` +
      `Environment: ${JSON.stringify(process.env, null, 2)}\n` +
      `Config: ${JSON.stringify(config, null, 2)}`
    );
    
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
})();
