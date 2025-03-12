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
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to page
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Handle cookie consent overlay
    try {
      // Wait for cookie modal container
      await page.waitForSelector('.cookie-consent', { visible: true, timeout: 5000 });
      console.log('Cookie consent screen detected');
      
      // Click "Necessary cookies only" checkbox
      await page.click('.cookie-consent input[type="checkbox"]:nth-of-type(1)');
      console.log('Clicked necessary cookies checkbox');
      
      // Wait for animation/state change
      await page.waitForTimeout(1000);
      
      // Click confirmation button
      const confirmButton = await page.$('.cookie-consent button:has-text("Confirm")');
      if (confirmButton) {
        await confirmButton.click();
        console.log('Clicked confirmation button');
        await page.waitForTimeout(2000); // Wait for modal to close
      }
      
      // Verify modal is closed
      await page.waitForFunction(
        () => !document.querySelector('.cookie-consent')?.offsetParent,
        { timeout: 5000 }
      );
      console.log('Cookie consent modal closed');
    } catch (cookieError) {
      console.log('Cookie handling error:', cookieError.message);
    }

    // Take initial screenshot
    await page.screenshot({ path: 'loaded_page.png' });

    // Handle login form
    await page.waitForSelector('input[name="email"]', { visible: true, timeout: 10000 });
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.type('input[name="password"]', '12345678', { delay: 50 });
    
    // Handle confirmation checkbox
    await page.click('input[type="checkbox"][name="terms"]');
    
    // Pre-login screenshot
    await page.screenshot({ path: 'before_login.png' });

    // Submit login
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    // Post-login actions
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'after_login.png' });

  } catch (error) {
    console.error('Main error:', error.message);
    if (page) {
      await page.screenshot({ path: 'error.png' });
      console.log('Error screenshot captured');
    }
  } finally {
    await browser.close();
  }
})();
