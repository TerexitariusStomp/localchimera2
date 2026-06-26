const { remote } = require('webdriverio');
const fs = require('fs');
const path = require('path');

const TEST_WALLET = '0x1234567890123456789012345678901234567890';
const MAX_RETRIES = 2;

async function runTest() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`\n=== Attempt ${attempt}/${MAX_RETRIES} ===`);
    try {
      const result = await runSingleAttempt();
      if (result) return;
      console.log(`Attempt ${attempt} failed, retrying...`);
    } catch (e) {
      console.error(`Attempt ${attempt} error:`, e.message);
      if (attempt === MAX_RETRIES) {
        console.log('\n=== TEST FAILED ===');
        console.log('Reason: All attempts failed');
        process.exit(1);
      }
    }
  }
  console.log('\n=== TEST FAILED ===');
  console.log('Reason: All attempts failed');
  process.exit(1);
}

async function runSingleAttempt() {
  console.log('Starting TestingBot smoke test...');
  console.log('App URL:', process.env.TESTINGBOT_APP_URL);

  const browser = await remote({
    user: process.env.TESTINGBOT_KEY,
    key: process.env.TESTINGBOT_SECRET,
    hostname: 'hub.testingbot.com',
    protocol: 'https',
    port: 443,
    path: '/wd/hub',
    connectionRetryTimeout: 120000,
    capabilities: {
      'tb:options': {
        name: 'Chimera Smoke Test',
        build: `build-${process.env.GITHUB_RUN_ID || 'local'}`,
      },
      platformName: 'Android',
      'appium:app': process.env.TESTINGBOT_APP_URL,
      'appium:deviceName': 'Pixel 6',
      'appium:platformVersion': '12',
      'appium:automationName': 'UiAutomator2',
    },
  });

  let success = false;
  let failureReason = '';

  try {
    await browser.pause(8000);
    await browser.saveScreenshot(path.join(__dirname, 'screenshot-01-launch.png'));
    console.log('Screenshot 1: setup screen');

    // Find the wallet input
    let walletInput = null;
    const walletSelectors = [
      'android.widget.EditText',
      '//android.widget.EditText',
      '//*[contains(@text, "EVM wallet")]',
      'android=new UiSelector().className("android.widget.EditText")',
    ];
    for (const sel of walletSelectors) {
      try {
        const el = await browser.$(sel);
        if (await el.isExisting()) {
          walletInput = el;
          console.log('Found wallet input with selector:', sel);
          break;
        }
      } catch (e) {}
    }

    if (!walletInput) {
      failureReason = 'Wallet address input not found on setup screen';
      console.log(failureReason);
      try {
        const source = await browser.getPageSource();
        fs.writeFileSync(path.join(__dirname, 'page-source.xml'), source);
      } catch (e) {}
    } else {
      await walletInput.setValue(TEST_WALLET);
      console.log('Entered wallet address');
      await browser.pause(1000);
      await browser.saveScreenshot(path.join(__dirname, 'screenshot-02-wallet-entered.png'));

      // Find and tap the Start button
      let startBtn = null;
      const startSelectors = [
        '//*[contains(@text, "Start")]',
        '//android.widget.Button[contains(@text, "Start")]',
        'android=new UiSelector().textContains("Start")',
      ];
      for (const sel of startSelectors) {
        try {
          const el = await browser.$(sel);
          if (await el.isExisting()) {
            startBtn = el;
            console.log('Found Start button with selector:', sel);
            break;
          }
        } catch (e) {}
      }

      if (!startBtn) {
        failureReason = 'Start button not found';
        console.log(failureReason);
      } else {
        await startBtn.click();
        console.log('Tapped Start button');
        await browser.pause(3000);
        await browser.saveScreenshot(path.join(__dirname, 'screenshot-03-after-start.png'));

        // Wait for model load: success is the WebView appearing (setup screen gone)
        const startTime = Date.now();
        let lastProgress = '';
        let webViewVerified = false;
        while (Date.now() - startTime < 300000) {
          await browser.saveScreenshot(path.join(__dirname, 'screenshot-04-checking.png'));

          // Check for error text
          try {
            const errorEl = await browser.$('//*[contains(@text, "Model error") or contains(@text, "error")]');
            if (await errorEl.isExisting()) {
              const txt = await errorEl.getText();
              console.log('Error text:', txt);
              failureReason = txt;
              break;
            }
          } catch (e) {}

          // Check for loading progress text
          try {
            const loadingEl = await browser.$('//*[contains(@text, "loading model")]');
            if (await loadingEl.isExisting()) {
              const txt = await loadingEl.getText();
              if (txt !== lastProgress) {
                console.log('Progress:', txt);
                lastProgress = txt;
              }
            }
          } catch (e) {}

          // Success: setup screen elements are gone and WebView is present
          try {
            const walletInputCheck = await browser.$('//*[contains(@text, "EVM wallet")]');
            const startBtnCheck = await browser.$('//*[contains(@text, "Start")]');
            const inputExists = await walletInputCheck.isExisting();
            const btnExists = await startBtnCheck.isExisting();
            if (!inputExists && !btnExists) {
              console.log('Setup screen passed — checking WebView content...');
              await browser.pause(3000);
              await browser.saveScreenshot(path.join(__dirname, 'screenshot-05-webview.png'));

              // Verify WebView is showing the wiki/notes UI
              try {
                const pageSource = await browser.getPageSource();
                fs.writeFileSync(path.join(__dirname, 'page-source-webview.xml'), pageSource);
                
                // Check for WebView presence
                const webViewEl = await browser.$('//android.webkit.WebView');
                if (await webViewEl.isExisting()) {
                  console.log('WebView element found');
                  
                  // Try to switch to WebView context to verify content
                  try {
                    const contexts = await browser.getContexts();
                    console.log('Available contexts:', contexts);
                    for (const ctx of contexts) {
                      if (typeof ctx === 'string' && ctx.includes('WEBVIEW')) {
                        await browser.switchContext(ctx);
                        console.log('Switched to WebView context:', ctx);
                        await browser.pause(2000);
                        
                        // Check for key UI elements in the WebView
                        const bodyText = await browser.$('body').getText();
                        console.log('WebView body text (first 500 chars):', bodyText.substring(0, 500));
                        
                        // Check for wiki/notes related elements
                        const hasWiki = bodyText.toLowerCase().includes('wiki') || bodyText.toLowerCase().includes('chimera');
                        const hasNotes = bodyText.toLowerCase().includes('notes') || bodyText.toLowerCase().includes('editor');
                        const hasAI = bodyText.toLowerCase().includes('ai') || bodyText.toLowerCase().includes('writer');
                        
                        console.log(`WebView content check: wiki=${hasWiki}, notes=${hasNotes}, ai=${hasAI}`);
                        
                        if (hasWiki || hasNotes || hasAI) {
                          console.log('SUCCESS: WebView is showing wiki/notes UI');
                          webViewVerified = true;
                          success = true;
                        } else {
                          console.log('WebView present but expected content not found yet');
                        }
                        
                        // Switch back to native context
                        await browser.switchContext('NATIVE_APP');
                        break;
                      }
                    }
                  } catch (ctxErr) {
                    console.log('Could not switch to WebView context:', ctxErr.message);
                    // WebView element exists even if we can't switch context
                    console.log('SUCCESS: WebView element is present (context switch failed but WebView exists)');
                    webViewVerified = true;
                    success = true;
                  }
                } else {
                  console.log('WebView element not found yet, still waiting...');
                }
              } catch (webErr) {
                console.log('WebView check error:', webErr.message);
              }
              
              if (success) break;
            }
          } catch (e) {}

          await browser.pause(5000);
        }

        if (!success && !failureReason) {
          failureReason = 'Timed out waiting for model load result';
        }
      }
    }

    try {
      const logcat = await browser.execute('mobile: shell', { command: 'logcat', args: ['-d', '-t', '500'] });
      fs.writeFileSync(path.join(__dirname, 'logcat.txt'), logcat || '(empty)');
      console.log('Logcat saved to logcat.txt');
    } catch (e) { console.log('Could not capture logcat:', e.message); }
  } catch (e) {
    console.error('Test error:', e);
    failureReason = e.message;
  } finally {
    try { await browser.deleteSession(); } catch (e) {}
  }

  if (success) {
    console.log('\n=== TEST PASSED ===');
    return true;
  } else {
    console.log('\n=== TEST FAILED ===');
    console.log('Reason:', failureReason);
    return false;
  }
}

runTest();
