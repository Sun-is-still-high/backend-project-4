import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const generateFileName = (url) => {
  const urlObj = new URL(url);
  const urlWithoutProtocol = `${urlObj.hostname}${urlObj.pathname}`;
  const name = urlWithoutProtocol
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '');
  return `${name}.html`;
};

const pageLoader = (url, outputDir = process.cwd()) => {
  const fileName = generateFileName(url);
  const filePath = path.resolve(outputDir, fileName);

  return axios.get(url)
    .then((response) => fs.writeFile(filePath, response.data))
    .then(() => filePath);
};

export default pageLoader;
