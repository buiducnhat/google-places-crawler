const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs/promises');

puppeteer.use(StealthPlugin());

const requestParams = {
  baseURL: `http://google.com`,
  query: 'thuê xe đạp', // what we want to search
  coordinates: '@20.930655,105.8400788,12z', // parameter defines GPS coordinates of location where you want your query to be applied
  hl: 'vi', // parameter defines the language to use for the Google maps search
};

async function scrollPage(page, scrollContainer) {
  let lastHeight = await page.evaluate(
    `document.querySelector("${scrollContainer}").scrollHeight`
  );
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
}

async function fillDataFromPage(page) {
  const dataFromPage = await page.evaluate(async () => {
    const items = Array.from(document.querySelectorAll('.bfdHYd'));
    const urlPattern = /!1s(?<id>[^!]+).+!3d(?<lat>[^!]+)!4d(?<long>[^!]+)/gm;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const results = [];
    for (let i = 0; i < items.length; i++) {
      const el = items[i];

      const placeUrl = el.parentElement
        .querySelector('.hfpxzc')
        ?.getAttribute('href');
      const dataId = [...placeUrl.matchAll(urlPattern)].map(
        ({ groups }) => groups.id
      )[0];
      const lat = [...placeUrl.matchAll(urlPattern)].map(
        ({ groups }) => groups.lat
      )[0];
      const long = [...placeUrl.matchAll(urlPattern)].map(
        ({ groups }) => groups.long
      )[0];

      el.parentElement.querySelector('.hfpxzc').click();
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
      const imgUrl =
        document.querySelector('.FgCUCc')?.children[0]?.firstChild?.src;

      results.push({
        title: el.querySelector('.qBF1Pd')?.textContent.trim(),
        rating: el
          .querySelector('.MW4etd')
          ?.textContent.trim()
          .replace(',', '.'),
        reviews:
          parseInt(
            el
              .querySelector('.UY7F9')
              ?.textContent.replace('(', '')
              .replace(')', '')
              .trim()
          ) || null,
        type: el
          .querySelector(
            '.W4Efsd:last-child > .W4Efsd:nth-of-type(1) > span:first-child'
          )
          ?.textContent.replaceAll('·', '')
          .trim(),
        address,
        phone,
        website,
        imgUrl,
        serviceOptions: el
          .querySelector('.qty3Ue')
          ?.textContent.replaceAll('·', '')
          .replaceAll('  ', ' ')
          .trim(),
        location: {
          lat,
          long,
        },
        placeUrl,
        dataId,
      });
    }
    return results;
  });
  return dataFromPage;
}

async function getLocalPlacesInfo() {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
    ],
  });
  const page = await browser.newPage();
  const URL = `${requestParams.baseURL}/maps/search/${requestParams.query}/${requestParams.coordinates}?hl=${requestParams.hl}`;
  await page.setDefaultNavigationTimeout(60000);
  await page.goto(URL);
  await page.waitForNavigation();
  const scrollContainer = '.m6QErb[aria-label]';
  const localPlacesInfo = [];
  // while (true) {
  await page.waitForTimeout(2000);
  // const nextPageBtn = await page.$("#eY4Fjd:not([disabled])");
  // if (!nextPageBtn) break;
  await scrollPage(page, scrollContainer);
  await page.waitForTimeout(2000);
  localPlacesInfo.push(...(await fillDataFromPage(page)));
  // await page.click("#eY4Fjd");
  // }
  await browser.close();
  return localPlacesInfo;
}

getLocalPlacesInfo().then((data) => {
  fs.writeFile('./data2.json', JSON.stringify(data));
});
