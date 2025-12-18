import axios from 'axios';
import debug from 'debug';
import fs from 'fs/promises';
import Listr from 'listr';
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

const handleError = (error, context) => {
  log('error occurred: %s', error.message);

  if (error.response) {
    const { status, config } = error.response;
    const errorMessage = `Request failed with status code ${status}: ${config.url}`;
    log('HTTP error: %s', errorMessage);
    const newError = new Error(errorMessage);
    newError.code = status;
    throw newError;
  }

  if (error.request) {
    const errorMessage = `Network error: ${error.message} (${context})`;
    log('Network error: %s', errorMessage);
    const newError = new Error(errorMessage);
    newError.code = 'ENETWORK';
    throw newError;
  }

  if (error.code === 'ENOENT') {
    const errorMessage = `ENOENT: no such file or directory '${error.path || context}'`;
    log('File system error: %s', errorMessage);
    const newError = new Error(errorMessage);
    newError.code = 'ENOENT';
    throw newError;
  }

  if (error.code === 'EACCES' || error.code === 'EPERM') {
    const errorMessage = `${error.code}: permission denied '${error.path || context}'`;
    log('Permission error: %s', errorMessage);
    const newError = new Error(errorMessage);
    newError.code = error.code;
    throw newError;
  }

  throw error;
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
    })
    .catch((error) => handleError(error, assetUrl));
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
    .catch((error) => handleError(error, url))
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
        return fs.writeFile(filePath, $.html())
          .catch((error) => handleError(error, filePath));
      }

      log('creating assets directory: %s', assetsDirPath);
      return fs.mkdir(assetsDirPath, { recursive: true })
        .then(() => {
          const tasks = assets.map((asset) => ({
            title: asset.url,
            task: () => downloadAsset(asset.url, asset.filePath),
          }));

          const listr = new Listr(tasks, { concurrent: true });
          return listr.run();
        })
        .then(() => {
          log('all assets downloaded');
          return fs.writeFile(filePath, $.html());
        })
        .catch((error) => handleError(error, filePath));
    })
    .then(() => {
      log('page saved to: %s', filePath);
      return filePath;
    });
};

export default pageLoader;
