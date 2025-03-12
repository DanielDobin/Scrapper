import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';

puppeteer.use(StealthPlugin());

// Human-like delays
const humanDelay = () => page.waitForTimeout(2000 + Math.random() * 3000);

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    executablePath: executablePath()
  });

  const page = await browser.newPage();
  
  try {
    // Configure stealth
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate with Cloudflare bypass
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Handle Cloudflare Challenge
    try {
      await humanDelay();
      const cfFrame = await page.waitForSelector('iframe[title="Widget containing a Cloudflare security challenge"]', { timeout: 10000 });
      const frame = await cfFrame.contentFrame();
      await frame.click('#cf-challenge-checkbox');
      console.log('Clicked Cloudflare checkbox');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    } catch {
      console.log('No Cloudflare challenge detected');
    }

    // Handle Cookie Consent
    try {
      await page.waitForSelector('.cookie-modal', { timeout: 5000 });
      await page.click('.cookie-modal .necessary-only');
      await page.click('.cookie-modal .confirm-button');
      console.log('Handled cookie consent');
      await humanDelay();
    } catch {
      console.log('No cookie consent modal');
    }

    // Execute login flow
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.type('input[name="password"]', '12345678', { delay: 50 });
    await page.click('input[type="checkbox"]');
    await humanDelay();
    
    await Promise.all([
      page.waitForNavigation(),
      page.click('button[type="submit"]')
    ]);

    // Post-login actions
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'success.png' });

  } catch (error) {
    console.error('Final error:', error.message);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
