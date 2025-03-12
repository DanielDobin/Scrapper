import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    executablePath: executablePath()
  });

  let page;
  try {
    page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to Deepseek login page
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000 // Increased timeout to handle Cloudflare
    });

    // Take a screenshot of the page when loaded
    await page.screenshot({ path: 'loaded_page.png' });
    console.log('Screenshot saved: loaded_page.png');

    // Check if Cloudflare challenge is present
    const isCloudflare = await page.$('text/Verify you are human');
    if (isCloudflare) {
      throw new Error('Cloudflare challenge detected. Manual intervention required.');
    }

    // Wait for the email input field to be visible
    await page.waitForSelector('input[placeholder="Phone number/email address"]', { visible: true, timeout: 10000 });
    console.log('Email input field found');

    // Fill email
    await page.type('input[placeholder="Phone number/email address"]', 'alon123tt@gmail.com');
    console.log('Filled email');

    // Fill password
    await page.type('input[type="password"]', '12345678');
    console.log('Filled password');

    // Click the "I confirm" checkbox
    await page.click('input[type="checkbox"]');
    console.log('Clicked "I confirm" checkbox');

    // Take a screenshot before login
    await page.screenshot({ path: 'before_login.png' });
    console.log('Screenshot saved: before_login.png');

    // Submit login form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }), // Increased timeout
      page.click('button:has-text("Log in")')
    ]);
    console.log('Submitted login form');

    // Wait for 5 seconds after login
    await page.waitForTimeout(5000);
    console.log('Waited 5 seconds after login');

    // Take a screenshot after login
    await page.screenshot({ path: 'after_login.png' });
    console.log('Screenshot saved: after_login.png');

  } catch (error) {
    console.error('Error:', error.message);

    // Take screenshot for debugging (if page is defined)
    if (page) {
      await page.screenshot({ path: 'error.png' });
      console.log('Screenshot saved: error.png');
    }

    process.exit(1);
  } finally {
    await browser.close();
  }
})();
