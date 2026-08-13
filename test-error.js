import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto('http://localhost:5173/mess_bus_details/', { waitUntil: 'networkidle2' });
  
  // click to sign in
  try {
    await page.waitForSelector('button[type="submit"]', { timeout: 3000 });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000); // wait for state change
  } catch(e) {}
  
  await browser.close();
})();
