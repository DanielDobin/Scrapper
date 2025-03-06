const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Navigate to login
    await page.goto('https://www.uchat.com.au/login', { waitUntil: 'networkidle2' });
    console.log('Loaded login page');

    // Fill credentials (update selectors if needed)
    await page.type('input[name="email"]', 'office.automatical@gmail.com');
    await page.type('input[name="password"]', 'Automatical Pass Grey Donkey3');
    console.log('Filled credentials');

    // Submit form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }), // Increased timeout
      page.click('button[type="submit"]')
    ]);
    console.log('Submitted login form');

    // Verify URL after login
    const currentUrl = await page.url();
    console.log('Current URL:', currentUrl);

    if (!currentUrl.includes('/settings/accounts/')) {
      throw new Error('Login failed or unexpected post-login page');
    }

    // Extract workspace ID
    const workspaceId = currentUrl.match(/\/accounts\/(\d+)/)?.[1];
    if (!workspaceId) throw new Error('Workspace ID not found');
    console.log('Workspace ID:', workspaceId);

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
