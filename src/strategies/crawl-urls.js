const fs = require('fs/promises');

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

async function handleOnePart({ query, coordinates, page, index }) {
  const resultIds = new Set();
  for (let i = 0; i < coordinates.length; i++) {
    await page.goto(
      `https://google.com/maps/search/${query}/${coordinates[i]}?hl=vi`,
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

    console.log(`${index}: Time ${i + 1}: Crawled urls:`, resultIds.size);
  }

  return resultIds;
}

async function crawlUrls({ query, browser, size }) {
  const baseCoordinates = JSON.parse(
    await fs.readFile('./const-data/base-coordinates.json', 'utf8')
  );
  const subCoordinates = [];
  const pages = [];
  const l = Math.ceil(baseCoordinates.length / size);
  for (let i = 0; i < size; i++) {
    subCoordinates.push(baseCoordinates.slice(i * l, (i + 1) * l));
    pages.push(await browser.newPage());
  }

  const resultFromParts = await Promise.all(
    subCoordinates.map((_, index) =>
      handleOnePart({
        query,
        coordinates: _,
        page: pages[index],
        index,
      })
    )
  );
  const resultIds = new Set();
  resultFromParts.forEach((result) => {
    result.forEach((id) => resultIds.add(id));
  });

  const resultUrls = Array.from(resultIds).map(
    (id) =>
      `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${id}`
  );

  await fs.writeFile(`./data/urls/${query}.json`, JSON.stringify(resultUrls), {
    encoding: 'utf-8',
  });
}

module.exports = crawlUrls;
