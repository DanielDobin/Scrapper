const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Solver } = require('2captcha');
const fs = require('fs');
const path = require('path');

// Enhanced error logging
const logError = async (error, page = null) => {
  const timestamp = Date.now();
  const errorDir = path.join(__dirname, 'error-logs');
  
  try {
    // Create error directory if not exists
    if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir);
    }

    // Write error details
    const errorData = {
      timestamp: new Date(timestamp).toISOString(),
      message: error.message,
      stack: error.stack,
      env: {
        CAPTCHA_KEY: !!process.env.CAPTCHA_API_KEY,
        PUPPETEER_PATH: process.env.PUPPETEER_EXECUTABLE_PATH
      }
    };
    
    fs.writeFileSync(
      path.join(errorDir, `error-${timestamp}.json`),
      JSON.stringify(errorData, null, 2)
    );

    // Capture screenshot if page exists
    if (page) {
      await page.screenshot({
        path: path.join(errorDir, `screenshot-${timestamp}.png`),
        fullPage: true
      });
    }
  } catch (logError) {
    console.error('Error logging failed:', logError);
  }
};

(async () => {
  let browser;
  try {
    // Initialize captcha solver
    const captchaSolver = new Solver(process.env.CAPTCHA_API_KEY);
    
    // Browser setup
    browser = await puppeteer
      .use(StealthPlugin())
      .launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        dumpio: true // Enable verbose logging
      });

    const page = await browser.newPage();
    
    // Rest of your scraping logic...

  } catch (error) {
    console.error('Unhandled error:', error);
    await logError(error, browser?.pages()?.[0]);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
