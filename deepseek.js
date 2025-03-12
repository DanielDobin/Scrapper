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

    // 1. Browser Configuration
    log('Setting up browser fingerprint');
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-CH-UA': '"Chromium";v="122", "Not:A-Brand";v="24"'
    });

    // 2. Initial Navigation
    log('Navigating to target');
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await page.screenshot({ path: '01-initial.png' });

    // 3. CAPTCHA Handling
    let captchaSolved = false;
    try {
      log('Detecting CAPTCHA elements');
      const captchaFrame = await page.waitForSelector('iframe[src*="challenges.cloudflare.com"], iframe[src*="hcaptcha.com"]', {
        visible: true,
        timeout: 30000
      });
      const frame = await captchaFrame.contentFrame();
      
      // Enhanced Sitekey Extraction
      log('Extracting sitekey using multiple methods');
      const sitekey = await frame.evaluate(() => {
        // Method 1: data-sitekey attribute
        const directElement = document.querySelector('[data-sitekey]');
        if (directElement) return directElement.dataset.sitekey;
        
        // Method 2: Iframe URL parameter
        const iframe = document.querySelector('iframe');
        if (iframe?.src.includes('sitekey=')) {
          return new URL(iframe.src).searchParams.get('sitekey');
        }
        
        // Method 3: Hidden input field
        const hiddenInput = document.querySelector('input[name="sitekey"]');
        if (hiddenInput) return hiddenInput.value;
        
        // Method 4: Script variable
        const scripts = Array.from(document.scripts);
        for (const script of scripts) {
          const match = script.textContent.match(/sitekey["']?:["']([^"']+)/);
          if (match) return match[1];
        }
        
        throw new Error('Sitekey not found in any location');
      });

      log(`Extracted sitekey: ${sitekey}`);
      await page.screenshot({ path: '02-sitekey-extracted.png' });

      // 4. 2Captcha API Call
      log('Checking 2Captcha balance');
      const balance = await solver.getBalance();
      log(`Balance: $${balance.data}`);
      
      log('Solving CAPTCHA...');
      const { data: solution } = await solver.turnstile(sitekey, page.url());
      log(`Received solution: ${solution.substring(0,15)}...`);

      // 5. Solution Injection
      log('Injecting solution');
      await page.evaluate((solution) => {
        document.querySelector('input[name="cf-turnstile-response"]').value = solution;
        document.querySelector('textarea[name="h-captcha-response"]').value = solution;
      }, solution);
      
      log('Submitting solution');
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      captchaSolved = true;
      await page.screenshot({ path: '03-post-captcha.png' });

    } catch (error) {
      log(`CAPTCHA Error: ${error.message}`, 'error');
      await page.screenshot({ path: '04-captcha-error.png' });
      throw error;
    }

    // 6. Login Execution
    if (!captchaSolved) throw new Error('CAPTCHA unresolved');
    log('Filling credentials');
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
