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
      '--disable-web-security',
      '--window-size=1920,1080'
    ],
    executablePath: executablePath()
  });

  const page = await browser.newPage();
  
  try {
    // Set realistic browser fingerprint
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate with Cloudflare handling
    await page.goto('https://chat.deepseek.com/sign_in', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Cloudflare Challenge Solution v2
    let cloudflarePassed = false;
    try {
      // Alternative detection method
      const challengeText = await page.waitForSelector('text/Verify you are human', {
        visible: true,
        timeout: 15000
      });

      if (challengeText) {
        console.log('Cloudflare challenge detected');
        
        // Direct checkbox interaction
        await page.waitForSelector('.mark', { visible: true, timeout: 10000 });
        await page.click('.mark');
        
        // Wait for verification
        await page.waitForResponse(response => 
          response.url().includes('cdn-cgi/challenge-platform') &&
          response.status() === 200,
          { timeout: 20000 }
        );
        
        cloudflarePassed = true;
        console.log('Cloudflare verification completed');
      }
    } catch (cfError) {
      console.log('Cloudflare handling:', cfError.message);
    }

    // Final verification
    if (!cloudflarePassed) {
      await page.waitForSelector('input[name="email"]', { 
        visible: true,
        timeout: 20000 
      });
    }

    // Rest of login flow...
    await page.type('input[name="email"]', 'alon123tt@gmail.com', { delay: 50 });
    await page.type('input[name="password"]', '12345678', { delay: 50 });
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
