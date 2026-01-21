import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

// 1. Get the profile URL from Input
const input = await Actor.getInput();
if (!input?.profileUrl) throw new Error('Input "profileUrl" is required!');

// 2. Setup Proxy (Residential is best for LinkedIn, but we try standard first)
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'], 
}).catch(() => Actor.createProxyConfiguration());

// 3. Define the Crawler
const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    requestHandler: async ({ page, request, log }) => {
        log.info(`Processing: ${request.url}`);
        
        // Go to LinkedIn and wait for load
        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Check for Login Wall
        if ((await page.title()).includes('Sign In') || (await page.title()).includes('Authwall')) {
            log.error('Blocked by Login Wall. Residential proxies are usually required for LinkedIn.');
            return;
        }

        // Wait for profile content
        try { await page.waitForSelector('.pv-top-card', { timeout: 15000 }); } catch {}

        // 4. Extract Data
        const data = await page.evaluate(() => {
            const get = (s) => document.querySelector(s)?.innerText?.trim();
            return {
                url: window.location.href,
                name: get('h1'),
                headline: get('.text-body-medium') || get('[data-generated-suggestion-target]'),
                location: get('.text-body-small.inline.t-black--light'),
                about: document.querySelector('#about')?.parentElement.innerText || null,
            };
        });

        await Actor.pushData(data);
    },
});

await crawler.run([input.profileUrl]);
await Actor.exit();
