import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

// 1. Get Input
const input = await Actor.getInput();
const profileUrl = input?.profileUrl;
if (!profileUrl) throw new Error('Input "profileUrl" is required!');

// 2. Proxy Configuration
// We MUST use Apify's RESIDENTIAL proxies if possible. 
// Datacenter proxies (the free ones) are blocked 99% of the time by LinkedIn.
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'], 
}).catch(() => {
    console.log('WARNING: Residential proxies not found. Using standard proxies (High chance of blocking).');
    return Actor.createProxyConfiguration();
});

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    useSessionPool: true,
    persistCookiesPerSession: true,

    // 3. Stealth Options
    // This tries to hide the "I am a robot" flag from the browser
    browserPoolOptions: {
        useFingerprints: true,
    },
    
    // 4. Browser Launch Options
    launchContext: {
        launchOptions: {
            headless: true, // LinkedIn sometimes blocks headless, but we have to use it on servers
            args: [
                '--disable-blink-features=AutomationControlled', // Hide the automation flag
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        },
    },

    requestHandler: async ({ page, request, log }) => {
        log.info(`Processing: ${request.url}`);

        // 5. Randomize Viewport (Look like a real screen)
        await page.setViewportSize({ width: 1920, height: 1080 });

        // 6. Go to the page
        // We wait for 'commit' first, then look for selectors, to speed things up
        await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 7. Check for Authwall (The "Sign In" blocker)
        try {
            const title = await page.title();
            if (title.includes('Sign In') || title.includes('Log In') || title.includes('Authwall') || title.includes('Join LinkedIn')) {
                log.error('BLOCKED: LinkedIn detected the bot and showed the Login Wall.');
                log.error('SOLUTION: You cannot scrape anonymously from this IP. You need Residential Proxies or a Login Cookie.');
                return; 
            }
        } catch (e) {}

        // 8. Wait for "Public" Profile Selectors
        // Public profiles often have different classes than logged-in ones.
        // We look for the main card or the "Join to view full profile" blur.
        try {
            await page.waitForSelector('main', { timeout: 15000 });
        } catch (e) {
            log.warning('Could not find main content. Page might be empty or blocked.');
        }

        // 9. Scrape Data (Public View Selectors)
        const data = await page.evaluate(() => {
            const get = (s) => document.querySelector(s)?.innerText?.trim();
            const getAttr = (s, a) => document.querySelector(s)?.getAttribute(a);

            return {
                url: window.location.href,
                // These selectors target the PUBLIC version of the profile
                name: get('h1.top-card-layout__title') || get('h1'),
                headline: get('h2.top-card-layout__headline') || get('.top-card-layout__headline'),
                location: get('.top-card-layout__first-subline') || get('div.top-card__subline-item'),
                about: get('section.summary div.core-section-container__content') || null,
                // Sometimes public profiles hide details behind a "Sign in to view" blur
                isPublicView: true,
            };
        });

        if (!data.name) {
            log.error('Scraping failed: Could not find name. Likely blocked.');
        } else {
            log.info(`Successfully scraped public profile: ${data.name}`);
            await Actor.pushData(data);
        }
    },
});

await crawler.run([profileUrl]);
await Actor.exit();
