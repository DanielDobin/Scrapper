import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import { Solver } from '2captcha';
import { writeFile } from 'fs/promises';

const solver = new Solver('aed1e56d88e5524d8367481ad2ea7321');
const debugLogs = [];

const logger = (message, type = 'info') => {
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

  const page = await browser.newPage();
  
  try {
    // Phase 1: Browser Configuration
    logger('Setting up browser fingerprint');
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Phase 2: Initial Navigation
    logger('Navigating to target URL');
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    logger(`Current URL: ${page.url()}`);
    await page.screenshot({ path: '01-initial.png' });

    // Phase 3: CAPTCHA Handling
    let captchaSolved = false;
    try {
      logger('Checking for CAPTCHA challenges');
      const captchaFrame = await page.waitForSelector('iframe[src*="hcaptcha.com"], iframe[src*="cloudflare"]', {
        visible: true,
        timeout: 25000
      });
      
      logger('CAPTCHA iframe found');
      const frame = await captchaFrame.contentFrame();
      await page.screenshot({ path: '02-captcha-frame.png' });

      // Extract CAPTCHA parameters
      const sitekey = await frame.$eval('[data-sitekey]', el => el.dataset.sitekey);
      logger(`Extracted sitekey: ${sitekey}`);
      
      if (!sitekey) throw new Error('No sitekey found');
      const pageUrl = page.url();

      // 2Captcha API Request
      logger('Sending request to 2Captcha API');
      const response = await solver.hcaptcha(sitekey, pageUrl);
      
      if (response.error) throw new Error(`2Captcha Error: ${response.error}`);
      logger(`2Captcha response received: ${response.data.substring(0,15)}...`);

      // Inject solution
      logger('Injecting CAPTCHA response');
      await page.evaluate((solution) => {
        document.querySelector('textarea#h-captcha-response').value = solution;
        document.querySelector('input#cf-turnstile-response').value = solution;
      }, response.data);

      // Submit solution
      logger('Submitting CAPTCHA response');
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      
      captchaSolved = true;
      logger('CAPTCHA solved successfully');
      await page.screenshot({ path: '03-post-captcha.png' });

    } catch (captchaError) {
      logger(`CAPTCHA Error: ${captchaError.message}`, 'error');
      await page.screenshot({ path: '04-captcha-error.png' });
      throw new Error('CAPTCHA resolution failed');
    }

    // Phase 4: Login Execution
    if (!captchaSolved) throw new Error('CAPTCHA not solved');
    
    logger('Starting login sequence');
    await page.waitForSelector('input[name="email"]', { 
      visible: true,
      timeout: 15000 
    });
    
    logger('Filling email field');
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.screenshot({ path: '05-email-filled.png' });

    logger('Filling password field');
    await page.type('input[name="password"]', '12345678', { delay: 50 });
    await page.screenshot({ path: '06-password-filled.png' });

    logger('Checking agreement box');
    await page.click('input[type="checkbox"]');
    await page.screenshot({ path: '07-agreement-checked.png' });

    logger('Submitting login form');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);
    
    logger('Login successful');
    await page.screenshot({ path: '08-success.png' });

  } catch (error) {
    logger(`Fatal Error: ${error.message}`, 'error');
    await page.screenshot({ path: '09-final-error.png' });
    
  } finally {
    // Save debug logs
    await writeFile('debug.log', debugLogs.join('\n'));
    await browser.close();
  }
})();
