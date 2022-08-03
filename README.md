# google-places-crawler

## Requirements

- Node.Js version > 12
- Chromium

## Prepair

### Install yarn (if not installed)

```
npm install -g yarn
```

### Install dependencies

```
yarn install
```

## How to use this project

### Guide

- First, you need to crawl all url of places in a country (this project now support Vietnam)
- Then, you can crawl all detail information of the places above, they are automatically filter by country

### Arguments

You must pass 2 arguments:

1. `action`: Value: `crawl-urls` or `crawl-detail`

   - Use `crawl-urls` for crawling url of places
   - Use `crawl-details` for crawling detail information of places

2. `query`: for searching in `Google maps`
   - Example: hotel, drink, cà phê, sửa ô tô

3. `size`: for multiple pages (tabs) of browser, quickly crawl data but cost more memory
   - Example: 10

4. `headless`: for debug, unhide the browser, recommended true
   - Example: true

### Command for start

```
yarn start [arguments list]
```

Example:

```
yarn start --action="crawl-urls" --query="khách sạn"
```

### Result

All result is stored into `json` files at `./data` path
