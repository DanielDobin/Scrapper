import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Navigate to Deepseek login page
    await page.goto('https://chat.deepseek.com/sign_in', { waitUntil: 'networkidle2' });
    console.log('Loaded Deepseek login page');

    // Fill email
    await page.type('input[name="email"]', 'alon123tt@gmail.com');
    console.log('Filled email');

    // Fill password
    await page.type('input[name="password"]', '12345678');
    console.log('Filled password');

    // Click the "I confirm" checkbox
    await page.click('input[type="checkbox"]');
    console.log('Clicked "I confirm" checkbox');

    // Take a screenshot before login
    await page.screenshot({ path: 'before_login.png' });
    console.log('Screenshot saved: before_login.png');

    // Submit login form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }), // Increased timeout
      page.click('button[type="submit"]')
    ]);
    console.log('Submitted login form');

    // Wait for 5 seconds after login
    await page.waitForTimeout(5000);
    console.log('Waited 5 seconds after login');

    // Take a screenshot after login
    await page.screenshot({ path: 'after_login.png' });
    console.log('Screenshot saved: after_login.png');

  } catch (error) {
    console.error('Error:', error.message);
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'error.png' });
    console.log('Screenshot saved: error.png');
    
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
