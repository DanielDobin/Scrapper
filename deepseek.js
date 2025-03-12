import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let page; // Declare page variable outside the try block

  try {
    page = await browser.newPage();
    
    // Navigate to Deepseek login page
    await page.goto('https://chat.deepseek.com/sign_in', { waitUntil: 'networkidle2' });
    console.log('Loaded Deepseek login page');

    // Take a screenshot of the page when loaded
    await page.screenshot({ path: 'loaded_page.png' });
    console.log('Screenshot saved: loaded_page.png');

    // Wait for the email input field to be visible
    await page.waitForSelector('input[type="text"]', { visible: true, timeout: 10000 });
    console.log('Email input field found');

    // Fill email
    await page.type('input[type="text"]', 'alon123tt@gmail.com');
    console.log('Filled email');

    // Fill password
    await page.type('input[type="password"]', '12345678');
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

    // Take screenshot for debugging (if page is defined)
    if (page) {
      await page.screenshot({ path: 'error.png' });
      console.log('Screenshot saved: error.png');
    }
    
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
