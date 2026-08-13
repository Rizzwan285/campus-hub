import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message, error.stack);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto('http://localhost:8080/mess_bus_details/', { waitUntil: 'networkidle2' });
  
  // Try to bypass onboarding if it appears
  try {
    const isNameInput = await page.$('input[placeholder="Your Name"]');
    if (isNameInput) {
      await page.type('input[placeholder="Your Name"]', 'Test User');
      
      const selects = await page.$$('button[role="combobox"]');
      if (selects.length > 0) {
        // Select Program
        await selects[0].click();
        await page.waitForTimeout(200);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        
        // Find the input for Branch (assuming it's a text input or select)
        const inputs = await page.$$('input');
        if (inputs.length > 1) {
            await inputs[1].type('CSE');
        }
      }
      
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
         await submitBtn.click();
         await page.waitForTimeout(3000);
      }
    }
  } catch(e) {
    console.log("Puppeteer auto-fill error:", e.message);
  }
  
  await browser.close();
})();
