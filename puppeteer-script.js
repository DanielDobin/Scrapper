const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new", // Required for GitHub Actions
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Navigate to login page
    await page.goto('https://www.uchat.com.au/login', { waitUntil: 'networkidle2' });

    // Fill credentials
    await page.type('input[name="email"]', 'automaticalmivneisrael@gmail.com');
    await page.type('input[name="password"]', 'Automatical Mivne Israel blue Shirt@2');

    // Submit form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]')
    ]);

    // Wait for redirect to workspace page (modify selector as needed)
    await page.waitForSelector('.dashboard', { timeout: 10000 });

    // Get workspace ID from URL
    const url = await page.url();
    const workspaceId = url.match(/\/accounts\/(\d+)/)?.[1];
    
    if (!workspaceId) throw new Error('Workspace ID not found in URL');
    
    console.log('Workspace ID:', workspaceId);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
