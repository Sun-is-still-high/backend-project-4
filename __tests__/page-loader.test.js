import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import nock from 'nock';
import pageLoader from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const getFixturePath = (filename) => path.join(__dirname, '..', '__fixtures__', filename);

nock.disableNetConnect();

describe('page-loader', () => {
  let tempDir;
  let expectedContent;

  beforeAll(async () => {
    expectedContent = await fs.readFile(getFixturePath('expected.html'), 'utf-8');
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
  });

  afterEach(async () => {
    nock.cleanAll();
  });

  test('should download page and save to file', async () => {
    const url = 'https://ru.hexlet.io/courses';

    nock('https://ru.hexlet.io')
      .get('/courses')
      .reply(200, expectedContent);

    const filepath = await pageLoader(url, tempDir);

    expect(filepath).toBe(path.join(tempDir, 'ru-hexlet-io-courses.html'));

    const actualContent = await fs.readFile(filepath, 'utf-8');
    expect(actualContent).toBe(expectedContent);
  });

  test('should generate correct filename from URL', async () => {
    const url = 'https://example.com/path/to/page';

    nock('https://example.com')
      .get('/path/to/page')
      .reply(200, '<html></html>');

    const filepath = await pageLoader(url, tempDir);

    expect(path.basename(filepath)).toBe('example-com-path-to-page.html');
  });

  test('should use current directory by default', async () => {
    const url = 'https://test.com/page';

    nock('https://test.com')
      .get('/page')
      .reply(200, '<html></html>');

    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const filepath = await pageLoader(url);
      expect(filepath).toBe(path.join(tempDir, 'test-com-page.html'));
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('should handle network errors', async () => {
    const url = 'https://nonexistent.com/page';

    nock('https://nonexistent.com')
      .get('/page')
      .replyWithError('Network error');

    await expect(pageLoader(url, tempDir)).rejects.toThrow();
  });

  test('should handle 404 errors', async () => {
    const url = 'https://example.com/notfound';

    nock('https://example.com')
      .get('/notfound')
      .reply(404);

    await expect(pageLoader(url, tempDir)).rejects.toThrow();
  });
});
