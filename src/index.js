import axios from 'axios';
import debug from 'debug';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

const log = debug('page-loader');

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

const downloadAsset = (assetUrl, assetPath) => {
  log('downloading asset: %s', assetUrl);
  return axios
    .get(assetUrl, { responseType: 'arraybuffer' })
    .then((response) => {
      log('asset downloaded, size: %d bytes', response.data.length);
      return fs.writeFile(assetPath, response.data);
    })
    .then(() => {
      log('asset saved to: %s', assetPath);
    });
};

const resourceMapping = [
  { tag: 'img', attr: 'src' },
  { tag: 'link', attr: 'href' },
  { tag: 'script', attr: 'src' },
];

const pageLoader = (url, outputDir = process.cwd()) => {
  log('loading page: %s', url);
  log('output directory: %s', outputDir);

  const fileName = generateFileName(url);
  const filePath = path.resolve(outputDir, fileName);
  const assetsDirName = generateAssetsDirName(url);
  const assetsDirPath = path.resolve(outputDir, assetsDirName);
  const baseUrl = new URL(url);

  log('output file: %s', filePath);

  let $;
  const assets = [];

  return axios.get(url)
    .then((response) => {
      log('page loaded, status: %d', response.status);
      $ = cheerio.load(response.data);

      resourceMapping.forEach(({ tag, attr }) => {
        $(`${tag}[${attr}]`).each((_i, elem) => {
          const attrValue = $(elem).attr(attr);
          if (!attrValue) return;

          const assetUrl = new URL(attrValue, url);
          if (assetUrl.hostname !== baseUrl.hostname) {
            log('skipping external resource: %s', assetUrl.href);
            return;
          }

          const assetFileName = generateAssetFileName(url, attrValue);
          const newAttrValue = `${assetsDirName}/${assetFileName}`;

          log('found local resource: %s -> %s', attrValue, newAttrValue);

          $(elem).attr(attr, newAttrValue);
          assets.push({
            url: assetUrl.href,
            filePath: path.join(assetsDirPath, assetFileName),
          });
        });
      });

      log('found %d local resources', assets.length);

      if (assets.length === 0) {
        return fs.writeFile(filePath, $.html());
      }

      log('creating assets directory: %s', assetsDirPath);
      return fs.mkdir(assetsDirPath, { recursive: true })
        .then(() => Promise.all(assets.map((asset) => downloadAsset(asset.url, asset.filePath))))
        .then(() => {
          log('all assets downloaded');
          return fs.writeFile(filePath, $.html());
        });
    })
    .then(() => {
      log('page saved to: %s', filePath);
      return filePath;
    });
};

export default pageLoader;
