import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Solver } from '2captcha';
import { writeFileSync } from 'fs';
import { executablePath } from 'puppeteer';

const solver = new Solver('aed1e56d88e5524d8367481ad2ea7321');
const debugLogs = [];
let page;

const log = (message, type = 'info') => {
  const entry = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${message}`;
  debugLogs.push(entry);
  console.log(entry);
};

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

  try {
    page = await browser.newPage();

    // 1. Advanced Fingerprinting
    log('Configuring browser fingerprint');
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    // 2. Navigation with Retry
    log('Navigating with Cloudflare bypass');
    let loaded = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto('https://chat.deepseek.com/sign_in', {
          waitUntil: 'networkidle2',
          timeout: 40000
        });
        loaded = true;
        break;
      } catch (error) {
        log(`Navigation attempt ${attempt} failed: ${error.message}`);
        await page.waitForTimeout(5000);
      }
    }
    if (!loaded) throw new Error('Failed to load page after 3 attempts');
    await page.screenshot({ path: '01-initial.png' });

    // 3. Enhanced CAPTCHA Detection
    let captchaSolved = false;
    try {
      log('Detecting Cloudflare overlay');
      await page.waitForFunction(() => {
        return document.querySelector('#challenge-form, .cloudflare-form') ||
               document.body.textContent.includes('Verify you are human') ||
               document.querySelector('div[data-translate="challenge_page"]');
      }, { timeout: 45000 });

      log('Cloudflare challenge detected');
      await page.screenshot({ path: '02-challenge-detected.png' });

      // 4. Alternative CAPTCHA Handling
      log('Solving Cloudflare Turnstile');
      const sitekey = await page.evaluate(() => {
        const turnstileFrame = document.querySelector('iframe[src*="challenges.cloudflare.com/turnstile"]');
        return turnstileFrame?.src.match(/sitekey=([^&]+)/)?.[1];
      });

      if (!sitekey) throw new Error('Failed to extract Turnstile sitekey');
      log(`Extracted sitekey: ${sitekey}`);

      // 5. 2Captcha API Integration
      log('Solving with 2Captcha');
      const { data: solution } = await solver.turnstile(sitekey, page.url());
      log(`Received solution: ${solution.substring(0,15)}...`);

      // 6. Solution Injection
      log('Injecting solution');
      await page.evaluate((solution) => {
        const script = document.createElement('script');
        script.innerHTML = `
          document.querySelector('input[name="cf-turnstile-response"]').value = '${solution}';
          document.querySelector('#challenge-form').submit();
        `;
        document.body.appendChild(script);
      }, solution);

      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      captchaSolved = true;
      log('Cloudflare bypass successful');
      await page.screenshot({ path: '03-post-captcha.png' });

    } catch (error) {
      log(`CAPTCHA Error: ${error.message}`, 'error');
      await page.screenshot({ path: '04-captcha-error.png' });
      throw error;
    }

    // 7. Login Execution
    if (!captchaSolved) throw new Error('CAPTCHA unresolved');
    log('Performing login');
    await page.waitForSelector('input[name="email"]', { timeout: 15000 });
    
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.type('input[name="password"]', '12345678', { delay: 50 });
    await page.click('input[type="checkbox"]');
    await page.click('button[type="submit"]');
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    await page.screenshot({ path: '05-success.png' });

  } catch (error) {
    log(`Fatal Error: ${error.message}`, 'error');
    await page?.screenshot({ path: '06-final-error.png' });
    
  } finally {
    writeFileSync('debug.log', debugLogs.join('\n'));
    await browser?.close();
  }
})();
