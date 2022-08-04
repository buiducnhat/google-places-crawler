const fs = require('fs/promises');
const minimist = require('minimist');

(async function () {
  const argv = minimist(process.argv.slice(2));

  const { query, size = 10 } = argv;

  const totalResults = [];
  for (let i = 0; i < size; i++) {
    const data = JSON.parse(
      await fs.readFile(`./data/${query}-results/${i}.json`, {
        encoding: 'utf8',
      })
    );
    totalResults.push(...data);
  }
  await fs.writeFile(
    `./data/results/${query}-results.json`,
    JSON.stringify(totalResults),
    {
      encoding: 'utf8',
    }
  );
})();
