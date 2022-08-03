const minimist = require('minimist');
const puppeteer = require('puppeteer-extra');
const blockResourcesPlugin =
  require('puppeteer-extra-plugin-block-resources')();
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs/promises');
const { isInVietnam } = require('./polygon');
const config = require('./config');

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

async function handleDetailOnePart({ query, page, urls, index }) {
  const urlPattern = /!1s(?<id>[^!]+).+!3d(?<lat>[^!]+)!4d(?<lon>[^!]+)/gm;
  const result = [];
  let hasError = false;
  let retry = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i] + `&hl=${config.lang}`;
    try {
      if (!hasError) {
        await page.goto(url, {
          waitUntil: ['networkidle0', 'domcontentloaded'],
        });
      } else {
        retry++;
        if (retry > 3) {
          retry = 0;
          hasError = false;
          continue;
        }
        await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });
      }

      let count = 0;
      while (true) {
        await sleep(1000);
        count++;
        const curUrl = await page.url();
        if (
          curUrl?.match(/!1s([\d\w:]+).+!3d([\d\.]+)!4d([\d\.]+)/gm)?.length > 0
        ) {
          break;
        }
        // Timeout for 10s
        if (count > 10) {
          throw new Error();
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

      await page.waitForSelector('.aoRNLd>img');
      // await page.waitForTimeout(1000);
      const data = await page.evaluate(() => {
        const title = document.querySelector('.DUwDvf')?.children[0]?.innerText;
        const imgUrl =
          document.querySelector('.aoRNLd')?.firstChild?.src || null;

        const detailTexts = document.querySelectorAll('.Io6YTe');
        const detailIcons = document.querySelectorAll('.Liguzb');

        let address = null,
          phone = null,
          website = null,
          openHours = null;

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
        const openHoursIcon = document.querySelector('.OdW2qd');
        if (
          !!openHoursIcon &&
          openHoursIcon.src.includes('schedule_gm_blue_24dp')
        ) {
          openHoursIcon.parentElement.click();
          openHours = document
            .querySelector('.t39EBf')
            .getAttribute('aria-label');
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
          openHours,
          rate,
          rateCount,
        };
      });

      result.push({ ...data, lat, lon, placeUrl: urls[i] });
      console.log(`${index} - Crawled details:`, result.length);
      hasError = false;
      retry = 0;
    } catch (error) {
      i--;
      hasError = true;
      continue;
    }
  }

  await fs.rmdir(`./data/${query}-results`, { recursive: true });
  await fs.writeFile(
    `./data/${query}-results/${index}.json`,
    JSON.stringify(result),
    {
      encoding: 'utf8',
    }
  );
}

async function crawlDetails({ query, browser, size = 10 }) {
  blockResourcesPlugin.blockedTypes.delete('image');

  // check dir exists before create
  fs.access(`./data/${query}-results`)
    .then(() => {})
    .catch(async () => {
      await fs.mkdir(`./data/${query}-results`);
    });

  const totalUrls = JSON.parse(
    await fs.readFile(`./data/${query}-urls.json`, { encoding: 'utf8' })
  );
  const subUrls = [];
  const pages = [];
  const l = Math.ceil(totalUrls.length / size);
  for (let i = 0; i < size; i++) {
    subUrls.push(totalUrls.slice(i * l, (i + 1) * l));
    pages.push(await browser.newPage());
  }

  await Promise.all(
    subUrls.map((urls, index) =>
      handleDetailOnePart({
        query,
        page: pages[index],
        urls,
        index,
      })
    )
  );

  const results = [];
  for (let i = 0; i < size; i++) {
    const data = JSON.parse(
      await fs.readFile(`./data/${query}-results/${i}.json`, {
        encoding: 'utf8',
      })
    );
    results.push(...data);
  }

  await fs.writeFile(`./data/${query}-results.json`, JSON.stringify(results), {
    encoding: 'utf8',
  });

  console.log('Total crawled:', results.length);
}

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
      await crawlUrls({ query, page });
      break;
    case 'crawl-details':
      await page.close();
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
