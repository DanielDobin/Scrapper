import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import { Solver } from '2captcha';

const solver = new Solver('aed1e56d88e5524d8367481ad2ea7321');
let debugLogs = [];

const log = (message, type = 'info') => {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
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
    log('Configuring browser fingerprint');
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Phase 2: Navigation
    log('Navigating to target URL');
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    log(`Loaded URL: ${page.url()}`);
    await page.screenshot({ path: '01-initial-load.png' });

    // Phase 3: Challenge Detection
    log('Checking for security challenges');
    const challengeText = await page.evaluate(() => 
      document.body.textContent.includes('Verify you are human') ||
      document.body.textContent.includes('Cloudflare')
    );
    
    if (challengeText) {
      log('Security challenge detected');
      await page.screenshot({ path: '02-challenge-detected.png' });

      // Phase 4: CAPTCHA Handling
      try {
        log('Attempting CAPTCHA detection');
        const captchaIframe = await page.waitForSelector(
          'iframe[src*="captcha"], iframe[src*="challenge"]', 
          { timeout: 20000, visible: true }
        );
        
        const frame = await captchaIframe.contentFrame();
        log('CAPTCHA iframe found');
        await page.screenshot({ path: '03-captcha-iframe.png' });

        // Extract CAPTCHA parameters
        const sitekey = await frame.$eval('[data-sitekey]', el => el.dataset.sitekey);
        const pageurl = page.url();
        log(`CAPTCHA Parameters - Sitekey: ${sitekey}, Page URL: ${pageurl}`);

        // Solve CAPTCHA
        log('Submitting to 2Captcha');
        const { data: solution } = await solver.hcaptcha(sitekey, pageurl);
        log(`Received solution: ${solution.substring(0, 15)}...`);

        // Inject solution
        log('Injecting CAPTCHA response');
        await page.evaluate((solution) => {
          document.querySelector('textarea#h-captcha-response').value = solution;
          document.querySelector('input[name="h-captcha-response"]').value = solution;
        }, solution);
        
        // Submit challenge
        log('Submitting challenge response');
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        log('Challenge submission successful');
        await page.screenshot({ path: '04-post-challenge.png' });

      } catch (captchaError) {
        log(`CAPTCHA Error: ${captchaError.message}`, 'error');
        await page.screenshot({ path: '05-captcha-error.png' });
        throw new Error('CAPTCHA resolution failed');
      }
    }

    // Phase 5: Login Execution
    log('Attempting login sequence');
    await page.waitForSelector('input[name="email"]', { 
      visible: true,
      timeout: 15000 
    });
    
    log('Filling email field');
    await page.type('input[name="email"]', 'alon123tt@gmail.com');
    await page.screenshot({ path: '06-email-filled.png' });

    log('Filling password field');
    await page.type('input[name="password"]', '12345678');
    await page.screenshot({ path: '07-password-filled.png' });

    log('Checking agreement box');
    await page.click('input[type="checkbox"]');
    await page.screenshot({ path: '08-agreement-checked.png' });

    log('Submitting login form');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
      page.click('button[type="submit"]')
    ]);
    
    log('Login successful');
    await page.screenshot({ path: '09-login-success.png' });

  } catch (error) {
    log(`Fatal Error: ${error.message}`, 'error');
    await page.screenshot({ path: '10-final-error.png' });
    
    // Dump debug logs
    require('fs').writeFileSync('debug.log', debugLogs.join('\n'));
    process.exit(1);
    
  } finally {
    await browser.close();
    require('fs').writeFileSync('debug.log', debugLogs.join('\n'));
  }
})();
