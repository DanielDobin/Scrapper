import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Solver } from '2captcha';
import { writeFileSync } from 'fs';
import { executablePath } from 'puppeteer';

const solver = new Solver('aed1e56d88e5524d8367481ad2ea7321');
const debugLogs = [];
let page; // Global reference for error handling

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
      '--disable-web-security',
      '--window-size=1920,1080'
    ],
    executablePath: executablePath()
  });

  try {
    page = await browser.newPage();

    // ======================
    // 1. Browser Configuration
    // ======================
    log('Configuring browser fingerprint');
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-CH-UA-Platform': '"Windows"'
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });

    // ======================
    // 2. Initial Navigation
    // ======================
    log('Navigating to target URL');
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    log(`Initial URL: ${page.url()}`);
    await page.screenshot({ path: '01-initial-page.png' });

    // ======================
    // 3. CAPTCHA Handling
    // ======================
    let captchaSolved = false;
    try {
      log('Starting CAPTCHA detection');
      const challengeDetected = await page.evaluate(() => {
        return document.querySelector('iframe[src*="challenge"], #challenge-form') || 
               /cloudflare|captcha|verify/i.test(document.body.textContent);
      });

      if (!challengeDetected) throw new Error('No CAPTCHA challenge detected');
      log('CAPTCHA challenge confirmed');
      await page.screenshot({ path: '02-captcha-detected.png' });

      // CAPTCHA Type Detection
      const isTurnstile = await page.$('iframe[src*="challenges.cloudflare.com/turnstile"]');
      const captchaType = isTurnstile ? 'turnstile' : 'hcaptcha';
      log(`Detected CAPTCHA type: ${captchaType.toUpperCase()}`);

      // Get CAPTCHA Parameters
      const sitekey = await page.evaluate(() => {
        return document.querySelector('[data-sitekey]')?.dataset.sitekey ||
               document.querySelector('iframe[src*="challenge"]')?.src.match(/sitekey=([^&]+)/)?.[1];
      });
      
      if (!sitekey) throw new Error('Failed to extract CAPTCHA sitekey');
      log(`Extracted sitekey: ${sitekey}`);
      const pageUrl = page.url();

      // ======================
      // 4. 2Captcha API Call
      // ======================
      try {
        log(`Checking 2Captcha balance`);
        const balance = await solver.getBalance();
        log(`Current balance: $${balance.data}`);
        if (balance.data < 0.5) throw new Error('Insufficient 2Captcha balance');

        log(`Solving ${captchaType.toUpperCase()} CAPTCHA...`);
        const startTime = Date.now();
        const response = captchaType === 'turnstile' 
          ? await solver.turnstile(sitekey, pageUrl)
          : await solver.hcaptcha(sitekey, pageUrl);
        
        const solveTime = ((Date.now() - startTime)/1000).toFixed(1);
        log(`2Captcha response (${solveTime}s): ${JSON.stringify(response)}`);

        if (response.error || !response.data) {
          throw new Error(response.error || 'Empty CAPTCHA solution');
        }

        // ======================
        // 5. Solution Injection
        // ======================
        log('Injecting CAPTCHA solution');
        await page.evaluate(({ solution, type }) => {
          if (type === 'turnstile') {
            document.querySelector('input[name="cf-turnstile-response"]').value = solution;
          } else {
            document.querySelector('textarea#h-captcha-response').value = solution;
          }
        }, { solution: response.data, type: captchaType });

        log('Submitting solution');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.click('#challenge-form button[type="submit"]')
        ]);

        captchaSolved = true;
        log('CAPTCHA verification successful');
        await page.screenshot({ path: '03-post-captcha.png' });

      } catch (apiError) {
        log(`2Captcha API Error: ${apiError.message}`, 'error');
        throw apiError;
      }

    } catch (captchaError) {
      log(`CAPTCHA Handling Failed: ${captchaError.message}`, 'error');
      await page.screenshot({ path: '04-captcha-error.png' });
      throw captchaError;
    }

    // ======================
    // 6. Login Execution
    // ======================
    if (!captchaSolved) throw new Error('CAPTCHA not resolved');
    
    log('Starting login sequence');
    await page.waitForSelector('input[name="email"]', { 
      visible: true,
      timeout: 15000 
    });

    log('Filling email field');
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.screenshot({ path: '05-email-filled.png' });

    log('Filling password field');
    await page.type('input[name="password"]', '12345678', { delay: 50 });
    await page.screenshot({ path: '06-password-filled.png' });

    log('Checking agreement box');
    await page.click('input[type="checkbox"]');
    await page.screenshot({ path: '07-agreement-checked.png' });

    log('Submitting login form');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);

    log('Login successful');
    await page.screenshot({ path: '08-success.png' });

  } catch (error) {
    log(`FATAL ERROR: ${error.message}`, 'error');
    await page?.screenshot({ path: '09-final-error.png' });
    
  } finally {
    // Save logs and cleanup
    writeFileSync('debug.log', debugLogs.join('\n'));
    await browser?.close();
  }
})();
