import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  const evidenceDir = path.join(__dirname, '.sisyphus', 'evidence');
  
  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    // Login as test user
    console.log('Logging in...');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:5173/');
    await page.waitForTimeout(1000);

    // Navigate to "내 신청" page
    console.log('Navigating to My Applications...');
    await page.goto('http://localhost:5173/my-applications');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click on first application's timeline link
    console.log('Clicking first timeline link...');
    const firstTimelineLink = await page.locator('.timeline-link').first();
    await firstTimelineLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Capture valid timeline screenshot
    console.log('Capturing task-12-timeline.png...');
    await page.screenshot({ 
      path: path.join(evidenceDir, 'task-12-timeline.png'),
      fullPage: true 
    });
    console.log('✓ task-12-timeline.png captured');

    // Navigate to invalid application ID
    console.log('Navigating to invalid application ID...');
    await page.goto('http://localhost:5173/my-applications/99999');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Capture error state screenshot
    console.log('Capturing task-12-missing.png...');
    await page.screenshot({ 
      path: path.join(evidenceDir, 'task-12-missing.png'),
      fullPage: true 
    });
    console.log('✓ task-12-missing.png captured');

    console.log('\n✅ All screenshots captured successfully!');
  } catch (error) {
    console.error('Error capturing screenshots:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

captureScreenshots();
