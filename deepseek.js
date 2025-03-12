import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: executablePath()
  });

  let page;
  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to page
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Handle cookie consent
    try {
      await page.waitForSelector('input[type="checkbox"]', { visible: true, timeout: 5000 });
      await page.click('input[type="checkbox"][aria-label="Necessary cookies only"]');
      console.log('Clicked necessary cookies checkbox');
      
      // Wait for cookie settings to apply
      await page.waitForTimeout(2000);
      
      // Look for confirmation button if exists
      const confirmButton = await page.$('button:has-text("Confirm")');
      if (confirmButton) {
        await confirmButton.click();
        console.log('Clicked cookie confirmation button');
      }
    } catch (cookieError) {
      console.log('No cookie consent screen found');
    }

    // Take initial screenshot
    await page.screenshot({ path: 'loaded_page.png' });

    // Fill login form
    await page.waitForSelector('input[data-testid="login-email-input"]', { visible: true, timeout: 10000 });
    await page.type('input[data-testid="login-email-input"]', 'alon123tt@gmail.com');
    await page.type('input[data-testid="login-password-input"]', '12345678');
    
    // Handle confirmation checkbox
    await page.click('input[name="terms"]');
    
    // Pre-login screenshot
    await page.screenshot({ path: 'before_login.png' });

    // Submit login
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.click('button[data-testid="login-submit-button"]')
    ]);

    // Post-login actions
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'after_login.png' });

  } catch (error) {
    console.error('Error:', error.message);
    if (page) await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
