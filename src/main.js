const minimist = require('minimist')
const puppeteer = require('puppeteer-extra')
const blockResourcesPlugin = require('puppeteer-extra-plugin-block-resources')()
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const fs = require('fs/promises')
const { isInVietnam } = require('./polygon')

puppeteer.use(StealthPlugin())
puppeteer.use(blockResourcesPlugin)
blockResourcesPlugin.blockedTypes.add('image')
blockResourcesPlugin.blockedTypes.add('media')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function scrollPage(page, scrollContainer) {
  let lastHeight = await page.evaluate(
    `document.querySelector("${scrollContainer}").scrollHeight`
  )
  while (true) {
    await page.evaluate(
      `document.querySelector("${scrollContainer}").scrollTo(0, document.querySelector("${scrollContainer}").scrollHeight)`
    )
    await page.waitForTimeout(2000)
    let newHeight = await page.evaluate(
      `document.querySelector("${scrollContainer}").scrollHeight`
    )
    if (newHeight === lastHeight) {
      break
    }
    lastHeight = newHeight
  }
}

async function extractIds(page) {
  const dataFromPage = await page.evaluate(async () => {
    const urls = Array.from(document.querySelectorAll('.hfpxzc')).map((item) =>
      item.getAttribute('href')
    )

    const resultIds = []
    for (let i = 0; i < urls.length; i++) {
      const id = urls[i].match(/ChIJ[\w-_]+\?/gm)?.[0]?.replace('?', '')
      resultIds.push(id)
    }
    return resultIds
  })
  return dataFromPage
}

async function crawlUrls(query) {
  const baseCoordinates = JSON.parse(
    await fs.readFile('./const-data/base-coordinates.json', 'utf8')
  )

  // Start browser, open page
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setDefaultNavigationTimeout(60000)

  const resultIds = new Set()

  for (let i = 0; i < baseCoordinates.length; i++) {
    await page.goto(
      `https://google.com/maps/search/${query}/${baseCoordinates[i]}?hl=vi`,
      { waitUntil: 'domcontentloaded' }
    )
    await page.waitForNavigation()

    const scrollContainer = '.m6QErb[aria-label]'
    await page.waitForTimeout(2000)

    await scrollPage(page, scrollContainer)
    await page.waitForTimeout(2000)

    const extractedIds = await extractIds(page)
    extractedIds.forEach((id) => resultIds.add(id))

    await page.waitForTimeout(1000)
  }
  const resultUrls = Array.from(resultIds).map(
    (id) =>
      `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${id}`
  )

  await browser.close()

  await fs.writeFile(`./data/${query}-urls.json`, JSON.stringify(resultUrls), {
    encoding: 'utf-8',
  })

  console.info('Crawled urls:', resultUrls.length)
}

async function crawlDetails(query) {
  const urlPattern = /!1s(?<id>[^!]+).+!3d(?<lat>[^!]+)!4d(?<lon>[^!]+)/gm
  const result = []

  const urls = JSON.parse(
    await fs.readFile(`./data/${query}-urls.json`, { encoding: 'utf8' })
  )

  blockResourcesPlugin.blockedTypes.delete('image')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()
  for (const url of urls) {
    await page.goto(url)

    while (1) {
      await sleep(1000)
      const curUrl = await page.url()
      if (
        curUrl?.match(/!1s([\d\w:]+).+!3d([\d\.]+)!4d([\d\.]+)/gm)?.length > 0
      ) {
        break
      }
    }

    const curUrl = await page.url()
    let match = urlPattern.exec(curUrl)
    if (!match) {
      match = urlPattern.exec(curUrl)
    }

    const lat = match?.groups.lat ? parseFloat(match?.groups.lat) : null
    const lon = match?.groups.lon ? parseFloat(match?.groups.lon) : null

    if (!isInVietnam({ lat, lon })) {
      continue
    }

    const data = await page.evaluate(() => {
      const title = document.querySelector('.DUwDvf')?.children[0]?.innerText
      const imgUrl =
        document.querySelector('.FgCUCc')?.children[0]?.firstChild?.src || ''

      const detailTexts = document.querySelectorAll('.Io6YTe')
      const detailIcons = document.querySelectorAll('.Liguzb')
      let address, phone, website

      for (let j = 0; j < detailTexts.length; j++) {
        if (detailIcons[j].src.includes('place_gm_blue_24dp')) {
          address = detailTexts[j].innerText
        }
        if (detailIcons[j].src.includes('phone_gm_blue_24dp')) {
          phone = detailTexts[j].innerText.replace(/\s/gm, '')
        }
        if (detailIcons[j].src.includes('public_gm_blue_24dp')) {
          website = detailTexts[j].innerText
        }
      }

      const rateItems = document.querySelectorAll('.F7nice')
      let rate = rateItems[0]?.innerText.replace(',', '.'),
        rateCount = rateItems[1]?.innerText.match(/\d+/)

      rate = rate ? parseFloat(rate) : 0
      rateCount = rateCount ? parseInt(rateCount[0]) : 0

      return {
        title,
        imgUrl,
        address,
        phone,
        website,
        rate,
        rateCount,
      }
    })

    result.push({ ...data, lat, lon, placeUrl: url })
  }
  await browser.close()

  await fs.writeFile(`./data/${query}-results.json`, JSON.stringify(result), {
    encoding: 'utf8',
  })

  console.info('Crawled details:', result.length)
}

async function main() {
  const argv = minimist(process.argv.slice(2))

  const { query, action } = argv

  console.info('Action:', action)
  console.log('Query:', query)
  console.info('Start time:', new Date().toLocaleString())

  switch (action) {
    case 'crawl-urls':
      await crawlUrls(query)
      break
    case 'crawl-details':
      await crawlDetails(query)
      break
    default:
      console.error('Invalid action')
      break
  }

  console.info('End time:', new Date().toLocaleString())
}

main()
