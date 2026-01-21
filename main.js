import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

// 1. Get the profile URL
const input = await Actor.getInput();
if (!input?.profileUrl) throw new Error('Input "profileUrl" is required!');

// 2. Setup Proxy
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'], 
}).catch(() => Actor.createProxyConfiguration());

// 3. Crawler
const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    
    // Make the browser look more human
    browserPoolOptions: {
        useFingerprints: true,
    },
    
    requestHandler: async ({ page, request, log }) => {
        log.info(`Processing: ${request.url}`);
        
        // A) Go to the page and wait for 'domcontentloaded'
        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // B) FIX: Wait for the page to settle (handle redirects)
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
            log.warning('Network did not idle, proceeding anyway...');
        }
        
        // C) Safer Title Check (Retry if context is lost)
        let title = '';
        try {
            title = await page.title();
        } catch (e) {
            log.warning('Context lost during title check, retrying...');
            await page.waitForTimeout(2000); // Give it a moment
            title = await page.title();
        }

        // Check for Login Wall
        if (title.includes('Sign In') || title.includes('Authwall') || title.includes('Log In')) {
            log.error('BLOCKED: LinkedIn redirected to a login page. Residential proxies are required.');
            return;
        }

        // D) Wait for profile content
        try { 
            // Wait for the main profile card to appear
            await page.waitForSelector('.pv-top-card', { timeout: 15000 }); 
        } catch (e) {
            log.warning('Could not find profile card. We might be on a public profile view or blocked.');
        }

        // E) Extract Data
        const data = await page.evaluate(() => {
            const get = (s) => document.querySelector(s)?.innerText?.trim();
            
            // Try different selectors because LinkedIn changes them for public vs logged-in views
            return {
                url: window.location.href,
                name: get('h1') || get('.top-card-layout__title'),
                headline: get('.text-body-medium') || get('.top-card-layout__headline'),
                location: get('.text-body-small.inline.t-black--light') || get('.top-card-layout__first-subline'),
                about: document.querySelector('#about')?.parentElement.innerText || null,
            };
        });

        log.info(`Scraped Name: ${data.name}`);
        await Actor.pushData(data);
    },

    // Optional: Reduce failed request noise
    maxRequestRetries: 2,
});

await crawler.run([input.profileUrl]);
await Actor.exit();
