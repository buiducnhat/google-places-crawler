const fs = require('fs/promises');

const { isInVietnam } = require('../polygon');
const config = require('../config');
const { sleep } = require('../helpers');

async function handleDetailOnePart({ query, page, urls, index }) {
  const urlPattern = /!1s(?<id>[^!]+).+!3d(?<lat>[^!]+)!4d(?<lon>[^!]+)/gm;
  const result = [];
  let hasError = false,
    retry = 0;

  // Each part divide into 10 files
  const subUrls = [],
    size = 10;
  const l = Math.ceil(urls.length / size);
  for (let i = 0; i < size; i++) {
    subUrls.push(urls.slice(i * l, (i + 1) * l));
  }

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < subUrls[i].length; j++) {
      const url = subUrls[i][j] + `&hl=${config.lang}`;
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
          await page.reload({
            waitUntil: ['networkidle0', 'domcontentloaded'],
          });
        }

        let count = 0;
        while (true) {
          await sleep(1000);
          count++;
          const curUrl = await page.url();
          if (
            curUrl?.match(/!1s([\d\w:]+).+!3d([\d\.]+)!4d([\d\.]+)/gm)?.length >
            0
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
          const title =
            document.querySelector('.DUwDvf')?.children[0]?.innerText;
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

        result.push({ ...data, lat, lon, placeUrl: subUrls[i][j] });
        console.log(`${index} - Crawled details:`, result.length);
        hasError = false;
        retry = 0;
      } catch (error) {
        j--;
        hasError = true;
        continue;
      }
    }

    await fs.writeFile(
      `./data/tmp/${query}-results/${index}-${i}.json`,
      JSON.stringify(result),
      {
        encoding: 'utf8',
      }
    );
  }
}

async function crawlDetails({ query, browser, size }) {
  // check dir exists before create
  fs.access(`./data/tmp/${query}-results`)
    .then(() => {})
    .catch(async () => {
      await fs.mkdir(`./data/tmp/${query}-results`);
    });

  // read urls
  const totalUrls = JSON.parse(
    await fs.readFile(`./data/urls/${query}.json`, { encoding: 'utf8' })
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
  const resultFiles = await fs.readdir(`./data/tmp/${query}-results`);
  for (let i = 0; i < resultFiles.length; i++) {
    const data = JSON.parse(
      await fs.readFile(`./data/tmp/${query}-results/${resultFiles[i]}`, {
        encoding: 'utf8',
      })
    );
    results.push(...data);
  }

  await fs.rm(`./data/tmp/${query}-results`, { recursive: true });
  await fs.writeFile(`./data/results/${query}.json`, JSON.stringify(results), {
    encoding: 'utf8',
  });

  console.log('Total crawled:', results.length);
}

module.exports = crawlDetails;
