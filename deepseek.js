import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080'
    ],
    executablePath: executablePath()
  });

  const page = await browser.newPage();
  
  try {
    // Set realistic browser fingerprint
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    // Navigate with Cloudflare handling
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Cloudflare Challenge Solution v3
    try {
      // Wait for challenge iframe
      const cfFrame = await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', {
        visible: true,
        timeout: 15000
      });
      
      // Switch to iframe context
      const frame = await cfFrame.contentFrame();
      console.log('Switched to Cloudflare iframe');

      // Click checkbox using multiple selector strategies
      await frame.waitForSelector('#cf-challenge-checkbox, .hcaptcha-box', {
        visible: true,
        timeout: 10000
      });

      // Simulate human click with coordinates
      const checkbox = await frame.$('#cf-challenge-checkbox, .hcaptcha-box');
      const rect = await checkbox.boundingBox();
      
      await page.mouse.click(
        rect.x + rect.width / 2 + Math.random() * 5,
        rect.y + rect.height / 2 + Math.random() * 5,
        { delay: 100 + Math.random() * 100 }
      );

      console.log('Cloudflare checkbox clicked');
      
      // Wait for challenge completion
      await page.waitForFunction(
        () => !document.querySelector('iframe[src*="challenges.cloudflare.com"]'),
        { timeout: 20000 }
      );
      console.log('Cloudflare verification confirmed');

    } catch (cfError) {
      console.log('Cloudflare handling failed:', cfError.message);
      await page.screenshot({ path: 'cloudflare-error.png' });
      throw cfError;
    }

    // Proceed with login
    await page.waitForSelector('input[name="email"]', {
      visible: true,
      timeout: 10000
    });

    // Login sequence
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.type('input[name="password"]', '12345678', { delay: 50 });
    await page.click('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    // Final verification
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    await page.screenshot({ path: 'success.png' });

  } catch (error) {
    console.error('Final error:', error.message);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
