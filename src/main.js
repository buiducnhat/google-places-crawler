const minimist = require('minimist');
const puppeteer = require('puppeteer-extra');
const blockResourcesPlugin =
  require('puppeteer-extra-plugin-block-resources')();
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const crawlUrls = require('./strategies/crawl-urls');
const crawlDetails = require('./strategies/crawl-details');

puppeteer.use(StealthPlugin());
puppeteer.use(blockResourcesPlugin);

async function main() {
  const argv = minimist(process.argv.slice(2));

  const { query, action, headless, size = 10 } = argv;

  console.info('Action:', action);
  console.log('Query:', query);
  console.log('Headless:', headless);
  console.log('Size:', size);
  console.info('Start time:', new Date().toLocaleString());

  // Start browser, open page
  const browser = await puppeteer.launch({
    headless: headless !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(120000);

  switch (action) {
    case 'crawl-urls':
      blockResourcesPlugin.blockedTypes.add('image');
      blockResourcesPlugin.blockedTypes.add('media');
      await crawlUrls({ query, browser, size });

      await page.close();
      break;
    case 'crawl-details':
      await crawlDetails({ query, browser, size });

      await page.close();
      break;
    case 'crawl-both':
      blockResourcesPlugin.blockedTypes.add('image');
      blockResourcesPlugin.blockedTypes.add('media');
      await crawlUrls({ query, browser, size });

      await page.close();

      blockResourcesPlugin.blockedTypes.delete('image');
      blockResourcesPlugin.blockedTypes.delete('media');
      await crawlDetails({ query, browser, size });

      break;
    default:
      console.error('Invalid action');
      break;
  }

  await browser.close();

  console.info('End time:', new Date().toLocaleString());
}

main();
