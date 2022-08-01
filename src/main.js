const minimist = require('minimist');
const puppeteer = require('puppeteer-extra');
const blockResourcesPlugin =
  require('puppeteer-extra-plugin-block-resources')();
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs/promises');
const { isInVietnam } = require('./polygon');

puppeteer.use(StealthPlugin());
puppeteer.use(blockResourcesPlugin);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrollPage(page) {
  const scrollContainer = '.m6QErb[aria-label]';
  let lastHeight = await page.evaluate(
    `document.querySelector("${scrollContainer}")?.scrollHeight`
  );
  if (!lastHeight) {
    return false;
  }

  while (true) {
    await page.evaluate(
      `document.querySelector("${scrollContainer}").scrollTo(0, document.querySelector("${scrollContainer}").scrollHeight)`
    );
    await page.waitForTimeout(2000);
    let newHeight = await page.evaluate(
      `document.querySelector("${scrollContainer}").scrollHeight`
    );
    if (newHeight === lastHeight) {
      break;
    }
    lastHeight = newHeight;
  }

  return true;
}

async function extractIds(page) {
  const dataFromPage = await page.evaluate(async () => {
    const urls = Array.from(document.querySelectorAll('.hfpxzc')).map((item) =>
      item.getAttribute('href')
    );

    const resultIds = [];
    for (let i = 0; i < urls.length; i++) {
      const id = urls[i].match(/ChIJ[\w-_]+\?/gm)?.[0]?.replace('?', '');
      resultIds.push(id);
    }
    return resultIds;
  });
  return dataFromPage;
}

async function crawlUrls({ query, page }) {
  blockResourcesPlugin.blockedTypes.add('image');
  blockResourcesPlugin.blockedTypes.add('media');

  const baseCoordinates = JSON.parse(
    await fs.readFile('./const-data/base-coordinates.json', 'utf8')
  );
  const resultIds = new Set();

  for (let i = 0; i < baseCoordinates.length; i++) {
    await page.goto(
      `https://google.com/maps/search/${query}/${baseCoordinates[i]}?hl=vi`,
      { waitUntil: 'networkidle2' }
    );
    await page.waitForNavigation();
    await page.waitForTimeout(2000);

    const hasResult = await scrollPage(page);
    if (!hasResult) {
      console.log(`Time ${i + 1}: Crawled urls:`, resultIds.size);
      continue;
    }
    await page.waitForTimeout(500);

    const extractedIds = await extractIds(page);
    extractedIds.forEach((id) => resultIds.add(id));

    console.log(`Time ${i + 1}: Crawled urls:`, resultIds.size);
  }
  const resultUrls = Array.from(resultIds).map(
    (id) =>
      `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${id}`
  );

  await fs.writeFile(`./data/${query}-urls.json`, JSON.stringify(resultUrls), {
    encoding: 'utf-8',
  });
}

async function crawlDetails({ query, page }) {
  blockResourcesPlugin.blockedTypes.delete('image');
  const urls = JSON.parse(
    await fs.readFile(`./data/${query}-urls.json`, { encoding: 'utf8' })
  );
  const urlPattern = /!1s(?<id>[^!]+).+!3d(?<lat>[^!]+)!4d(?<lon>[^!]+)/gm;
  const result = [];

  for (const url of urls) {
    await page.goto(url, { waitUntil: 'networkidle2' });

    while (1) {
      await sleep(1000);
      const curUrl = await page.url();
      if (
        curUrl?.match(/!1s([\d\w:]+).+!3d([\d\.]+)!4d([\d\.]+)/gm)?.length > 0
      ) {
        break;
      }
    }

    const curUrl = await page.url();
    let match = urlPattern.exec(curUrl);
    if (!match) {
      match = urlPattern.exec(curUrl);
    }

    const lat = match?.groups.lat ? parseFloat(match?.groups.lat) : null;
    const lon = match?.groups.lon ? parseFloat(match?.groups.lon) : null;

    if (!isInVietnam({ lat, lon })) {
      continue;
    }

    const data = await page.evaluate(() => {
      const title = document.querySelector('.DUwDvf')?.children[0]?.innerText;
      const imgUrl =
        document.querySelector('.FgCUCc')?.children[0]?.firstChild?.src || '';

      const detailTexts = document.querySelectorAll('.Io6YTe');
      const detailIcons = document.querySelectorAll('.Liguzb');
      let address, phone, website;

      for (let j = 0; j < detailTexts.length; j++) {
        if (detailIcons[j].src.includes('place_gm_blue_24dp')) {
          address = detailTexts[j].innerText;
        }
        if (detailIcons[j].src.includes('phone_gm_blue_24dp')) {
          phone = detailTexts[j].innerText.replace(/\s/gm, '');
        }
        if (detailIcons[j].src.includes('public_gm_blue_24dp')) {
          website = detailTexts[j].innerText;
        }
      }

      const rateItems = document.querySelectorAll('.F7nice');
      let rate = rateItems[0]?.innerText.replace(',', '.'),
        rateCount = rateItems[1]?.innerText.match(/\d+/);
      rate = rate ? parseFloat(rate) : 0;
      rateCount = rateCount ? parseInt(rateCount[0]) : 0;

      return {
        title,
        imgUrl,
        address,
        phone,
        website,
        rate,
        rateCount,
      };
    });

    result.push({ ...data, lat, lon, placeUrl: url });
    console.log('Crawled details:', result.length);
  }

  await fs.writeFile(`./data/${query}-results.json`, JSON.stringify(result), {
    encoding: 'utf8',
  });
}

const convertToPlaceUrl = ({ query, placeId }) =>
  `https://www.google.com/maps/search/?api=1&query=${query}query_place_id=${placeId}`;

async function crawlDirect({ query, page }) {
  blockResourcesPlugin.blockedTypes.delete('image');
  const baseCoordinates = JSON.parse(
    await fs.readFile('./const-data/base-coordinates.json', 'utf8')
  );
  const lastResults = [];

  for (let i = 0; i < baseCoordinates.length; i++) {
    await page.goto(
      `https://google.com/maps/search/${query}/${baseCoordinates[i]}?hl=vi`,
      { waitUntil: 'domcontentloaded' }
    );

    await page.waitForNavigation();
    await page.waitForTimeout(2000);
    const hasData = await scrollPage(page);
    if (!hasData) {
      continue;
    }

    const oneUrlResult = await page.evaluate(async () => {
      const urlPattern = /!1s(?<id>[^!]+).+!3d(?<lat>[^!]+)!4d(?<lon>[^!]+)/gm;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const results = [];

      const items = Array.from(document.querySelectorAll('.hfpxzc'));
      console.log(items);

      for (let i = 0; i < items.length; i++) {
        const el = items[i];

        const placeUrl = el?.getAttribute('href');
        const lat = [...placeUrl.matchAll(urlPattern)].map(
          ({ groups }) => groups.lat
        )[0];
        const lon = [...placeUrl.matchAll(urlPattern)].map(
          ({ groups }) => groups.lon
        )[0];

        await sleep(2000);
        el.click();
        await sleep(2000);

        const detailTexts = document.querySelectorAll('.Io6YTe');
        const detailIcons = document.querySelectorAll('.Liguzb');
        let address, phone, website;

        for (let j = 0; j < detailTexts.length; j++) {
          if (detailIcons[j].src.includes('place_gm_blue_24dp')) {
            address = detailTexts[j].innerText;
          }
          if (detailIcons[j].src.includes('phone_gm_blue_24dp')) {
            phone = detailTexts[j].innerText.replace(/\s/gm, '');
          }
          if (detailIcons[j].src.includes('public_gm_blue_24dp')) {
            website = detailTexts[j].innerText;
          }
        }
        const imgUrl = document.querySelector('.aoRNLd')?.firstChild?.src || '';
        const rateItems = document.querySelectorAll('.F7nice');
        let rate = rateItems[0]?.innerText.replace(',', '.'),
          rateCount = rateItems[1]?.innerText.match(/\d+/);
        rate = rate ? parseFloat(rate) : 0;
        rateCount = rateCount ? parseInt(rateCount[0]) : 0;

        results.push({
          title: document.querySelector('h1.DUwDvf')?.innerText || '',
          imgUrl,
          address,
          phone,
          website,
          lat,
          lon,
          placeUrl,
        });
      }
      return results;
    });
    console.log(oneUrlResult);

    lastResults.push(...oneUrlResult);
  }
}

async function main() {
  const argv = minimist(process.argv.slice(2));

  const { query, action, headless } = argv;

  console.info('Action:', action);
  console.log('Query:', query);
  console.info('Start time:', new Date().toLocaleString());

  // Start browser, open page
  const browser = await puppeteer.launch({
    headless: headless !== 'false',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  // await page.setDefaultNavigationTimeout(0);

  switch (action) {
    case 'crawl-urls':
      await crawlUrls({ query, page });
      break;
    case 'crawl-details':
      await crawlDetails({ query, page });
      break;
    case 'crawl-direct':
      await crawlDirect({ query, page });
      break;
    default:
      console.error('Invalid action');
      break;
  }

  await browser.close();
  console.info('End time:', new Date().toLocaleString());
}

main();
