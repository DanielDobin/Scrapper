import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';

puppeteer.use(StealthPlugin());

// Configure human-like behavior
const humanType = async (page, selector, text) => {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 50 });
    await page.waitForTimeout(50 + Math.random() * 100);
  }
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

  const page = await browser.newPage();
  
  try {
    // Configure advanced browser fingerprint
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-CH-UA': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"'
    });
    await page.evaluateOnNewDocument(() => {
      delete navigator.webdriver;
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3],
        configurable: true
      });
    });

    // Navigate with Cloudflare handling
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Cloudflare Challenge Handling v4
    let cloudflareSolved = false;
    try {
      // Alternative detection methods
      const challengeDetected = await page.evaluate(() => {
        return document.querySelector('#challenge-form') || 
               document.body.textContent.includes('Verify you are human');
      });

      if (challengeDetected) {
        console.log('Cloudflare challenge detected');
        await page.screenshot({ path: 'cloudflare-challenge.png' });

        // Multiple interaction strategies
        await page.waitForFunction(() => {
          const iframe = document.querySelector('iframe[src*="challenge"], iframe[src*="cloudflare"]');
          return iframe && iframe.offsetParent !== null;
        }, { timeout: 20000 });

        // Execute in iframe context
        const frame = await page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
        if (frame) {
          await frame.waitForSelector('.mark, #cf-challenge-checkbox', { visible: true, timeout: 15000 });
          const box = await frame.$('.mark, #cf-challenge-checkbox');
          await box.click();
          console.log('Cloudflare checkbox clicked');
          
          // Verify challenge completion
          await page.waitForFunction(
            () => !document.querySelector('#challenge-form'),
            { timeout: 25000 }
          );
          cloudflareSolved = true;
        }
      }
    } catch (cfError) {
      console.log('Cloudflare handling error:', cfError.message);
      await page.screenshot({ path: 'cloudflare-error.png' });
    }

    // Post-Challenge Verification
    if (!cloudflareSolved) {
      console.log('Proceeding without Cloudflare verification');
      await page.screenshot({ path: 'no-cloudflare.png' });
    }

    // Login sequence
    await page.waitForSelector('input[name="email"]', { 
      visible: true,
      timeout: 20000,
      handleError: true
    });
    
    await humanType(page, 'input[name="email"]', 'alon123tt@gmail.com');
    await humanType(page, 'input[name="password"]', '12345678');
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
