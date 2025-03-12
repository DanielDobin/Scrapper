import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import { Solver } from '2captcha';

const solver = new Solver('aed1e56d88e5524d8367481ad2ea7321');

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
    // Configure advanced fingerprint
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-CH-UA': '"Chromium";v="122", "Not:A-Brand";v="24"'
    });

    // Navigate to target
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Handle Cloudflare CAPTCHA
    try {
      const iframe = await page.waitForSelector('iframe[src*="hcaptcha.com"]', { timeout: 15000 });
      const frame = await iframe.contentFrame();
      
      // Extract CAPTCHA parameters
      const sitekey = await frame.$eval('.h-captcha', (el) => el.getAttribute('data-sitekey'));
      const pageurl = page.url();

      // Solve CAPTCHA
      const { data: solution } = await solver.hcaptcha(sitekey, pageurl);
      
      // Inject solution
      await page.evaluate((solution) => {
        document.querySelector('textarea#h-captcha-response').value = solution;
        document.querySelector('input[name="h-captcha-response"]').value = solution;
      }, solution);

      // Submit CAPTCHA
      await page.click('iframe[src*="hcaptcha.com"] + div iframe');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 25000 });
      console.log('CAPTCHA solved successfully');
      
    } catch (captchaError) {
      console.error('CAPTCHA solving failed:', captchaError.message);
      throw new Error('CAPTCHA verification required');
    }

    // Proceed with login
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    await page.type('input[name="email"]', 'alon123tt@gmail.com');
    await page.type('input[name="password"]', '12345678');
    await page.click('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    await page.screenshot({ path: 'success.png' });

  } catch (error) {
    console.error('Final error:', error.message);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
