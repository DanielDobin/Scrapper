import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';

puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: false,  // Switch to "new" for production
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--window-size=1920,1080'
    ],
    executablePath: executablePath()
  });

  const page = await browser.newPage();
  
  try {
    // Configure browser fingerprint
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate with Cloudflare handling
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Cloudflare Challenge Solution
    try {
      // Wait for main Cloudflare iframe
      const cfFrame = await page.waitForSelector('iframe[src*="challenges.cloudflare.com"]', { 
        timeout: 15000,
        visible: true 
      });
      
      const frame = await cfFrame.contentFrame();
      console.log('Cloudflare challenge detected');

      // Click the checkbox using multiple selectors
      await frame.waitForSelector('#cf-challenge-checkbox, .mark', { 
        visible: true,
        timeout: 10000 
      });
      
      // Human-like click with mouse movement simulation
      const checkbox = await frame.$('#cf-challenge-checkbox, .mark');
      const box = await checkbox.boundingBox();
      
      await page.mouse.move(
        box.x + box.width / 2 + Math.random() * 10,
        box.y + box.height / 2 + Math.random() * 10,
        { steps: 10 }
      );
      
      await page.mouse.down();
      await page.waitForTimeout(100 + Math.random() * 200);
      await page.mouse.up();
      
      console.log('Cloudflare checkbox clicked');
      await page.waitForTimeout(5000);  // Critical wait for verification

      // Handle potential redirect
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });

    } catch (cfError) {
      console.log('Cloudflare handling failed:', cfError.message);
      await page.screenshot({ path: 'cloudflare-error.png' });
    }

    // Post-Cloudflare verification
    await page.waitForSelector('input[name="email"]', { 
      visible: true,
      timeout: 20000 
    });

    // Rest of login flow...
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.type('input[name="password"]', '12345678', { delay: 50 });
    await page.click('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    // Final verification
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'success.png' });

  } catch (error) {
    console.error('Final error:', error.message);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
