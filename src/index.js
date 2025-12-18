import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

const formatName = (str) => str
  .replace(/[^a-zA-Z0-9]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const generateFileName = (url) => {
  const urlObj = new URL(url);
  const urlWithoutProtocol = `${urlObj.hostname}${urlObj.pathname}`;
  return `${formatName(urlWithoutProtocol)}.html`;
};

const generateAssetsDirName = (url) => {
  const urlObj = new URL(url);
  const urlWithoutProtocol = `${urlObj.hostname}${urlObj.pathname}`;
  return `${formatName(urlWithoutProtocol)}_files`;
};

const generateAssetFileName = (url, assetPath) => {
  const urlObj = new URL(url);
  const assetUrl = new URL(assetPath, url);
  const fullPath = `${urlObj.hostname}${assetUrl.pathname}`;
  const ext = path.extname(assetUrl.pathname);
  const nameWithoutExt = fullPath.slice(0, -ext.length);
  return `${formatName(nameWithoutExt)}${ext}`;
};

const downloadAsset = (assetUrl, assetPath) => axios
  .get(assetUrl, { responseType: 'arraybuffer' })
  .then((response) => fs.writeFile(assetPath, response.data));

const pageLoader = (url, outputDir = process.cwd()) => {
  const fileName = generateFileName(url);
  const filePath = path.resolve(outputDir, fileName);
  const assetsDirName = generateAssetsDirName(url);
  const assetsDirPath = path.resolve(outputDir, assetsDirName);
  const baseUrl = new URL(url);

  let $;
  const assets = [];

  return axios.get(url)
    .then((response) => {
      $ = cheerio.load(response.data);

      $('img[src]').each((_i, elem) => {
        const src = $(elem).attr('src');
        if (!src) return;

        const assetUrl = new URL(src, url);
        // Only download images from the same host
        if (assetUrl.hostname !== baseUrl.hostname) return;

        const assetFileName = generateAssetFileName(url, src);
        const newSrc = `${assetsDirName}/${assetFileName}`;

        $(elem).attr('src', newSrc);
        assets.push({
          url: assetUrl.href,
          filePath: path.join(assetsDirPath, assetFileName),
        });
      });

      if (assets.length === 0) {
        return fs.writeFile(filePath, $.html());
      }

      return fs.mkdir(assetsDirPath, { recursive: true })
        .then(() => Promise.all(assets.map((asset) => downloadAsset(asset.url, asset.filePath))))
        .then(() => fs.writeFile(filePath, $.html()));
    })
    .then(() => filePath);
};

export default pageLoader;
