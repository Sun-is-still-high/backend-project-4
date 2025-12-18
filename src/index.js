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
  const assetUrl = new URL(assetPath, url);
  const fullPath = `${assetUrl.hostname}${assetUrl.pathname}`;
  const ext = path.extname(assetUrl.pathname);
  if (ext) {
    const nameWithoutExt = fullPath.slice(0, -ext.length);
    return `${formatName(nameWithoutExt)}${ext}`;
  }
  return `${formatName(fullPath)}.html`;
};

const downloadAsset = (assetUrl, assetPath) => axios
  .get(assetUrl, { responseType: 'arraybuffer' })
  .then((response) => fs.writeFile(assetPath, response.data));

const resourceMapping = [
  { tag: 'img', attr: 'src' },
  { tag: 'link', attr: 'href' },
  { tag: 'script', attr: 'src' },
];

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

      resourceMapping.forEach(({ tag, attr }) => {
        $(`${tag}[${attr}]`).each((_i, elem) => {
          const attrValue = $(elem).attr(attr);
          if (!attrValue) return;

          const assetUrl = new URL(attrValue, url);
          if (assetUrl.hostname !== baseUrl.hostname) return;

          const assetFileName = generateAssetFileName(url, attrValue);
          const newAttrValue = `${assetsDirName}/${assetFileName}`;

          $(elem).attr(attr, newAttrValue);
          assets.push({
            url: assetUrl.href,
            filePath: path.join(assetsDirPath, assetFileName),
          });
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
