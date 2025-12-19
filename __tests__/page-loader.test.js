import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import nock from 'nock'
import pageLoader from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const getFixturePath = filename => path.join(__dirname, '..', '__fixtures__', filename)

nock.disableNetConnect()

describe('page-loader', () => {
  let tempDir
  let beforeHtml
  let afterHtml
  let pngContent
  let cssContent
  let jsContent
  let canonicalContent

  beforeAll(async () => {
    beforeHtml = await fs.readFile(getFixturePath('before.html'), 'utf-8')
    afterHtml = await fs.readFile(getFixturePath('after.html'), 'utf-8')
    pngContent = await fs.readFile(getFixturePath('nodejs.png'))
    cssContent = 'body { background: red; }'
    jsContent = 'console.log("hello");'
    canonicalContent = '<html><body>Canonical page</body></html>'
  })

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'))
  })

  afterEach(async () => {
    nock.cleanAll()
  })

  test('should download page and save to file', async () => {
    const url = 'https://ru.hexlet.io/courses'

    nock('https://ru.hexlet.io')
      .get('/courses')
      .reply(200, '<html></html>')

    const filepath = await pageLoader(url, tempDir)

    expect(filepath).toBe(path.join(tempDir, 'ru-hexlet-io-courses.html'))

    const actualContent = await fs.readFile(filepath, 'utf-8')
    expect(actualContent).toBe('<html><head></head><body></body></html>')
  })

  test('should generate correct filename from URL', async () => {
    const url = 'https://example.com/path/to/page'

    nock('https://example.com')
      .get('/path/to/page')
      .reply(200, '<html></html>')

    const filepath = await pageLoader(url, tempDir)

    expect(path.basename(filepath)).toBe('example-com-path-to-page.html')
  })

  test('should use current directory by default', async () => {
    const url = 'https://test.com/page'

    nock('https://test.com')
      .get('/page')
      .reply(200, '<html></html>')

    const originalCwd = process.cwd()
    process.chdir(tempDir)

    try {
      const filepath = await pageLoader(url)
      expect(filepath).toBe(path.join(tempDir, 'test-com-page.html'))
    } finally {
      process.chdir(originalCwd)
    }
  })

  test('should download all local resources and update HTML links', async () => {
    const url = 'https://ru.hexlet.io/courses'

    nock('https://ru.hexlet.io')
      .get('/courses')
      .reply(200, beforeHtml)
      .get('/assets/professions/nodejs.png')
      .reply(200, pngContent, { 'Content-Type': 'image/png' })
      .get('/assets/application.css')
      .reply(200, cssContent, { 'Content-Type': 'text/css' })
      .get('/courses')
      .reply(200, canonicalContent)
      .get('/packs/js/runtime.js')
      .reply(200, jsContent, { 'Content-Type': 'application/javascript' })

    const filepath = await pageLoader(url, tempDir)

    const actualHtml = await fs.readFile(filepath, 'utf-8')
    expect(actualHtml).toBe(afterHtml)

    const imagePath = path.join(
      tempDir,
      'ru-hexlet-io-courses_files',
      'ru-hexlet-io-assets-professions-nodejs.png',
    )
    const actualImage = await fs.readFile(imagePath)
    expect(actualImage).toEqual(pngContent)
    const cssPath = path.join(
      tempDir,
      'ru-hexlet-io-courses_files',
      'ru-hexlet-io-assets-application.css',
    )
    const actualCss = await fs.readFile(cssPath, 'utf-8')
    expect(actualCss).toBe(cssContent)

    const jsPath = path.join(
      tempDir,
      'ru-hexlet-io-courses_files',
      'ru-hexlet-io-packs-js-runtime.js',
    )
    const actualJs = await fs.readFile(jsPath, 'utf-8')
    expect(actualJs).toBe(jsContent)

    const canonicalPath = path.join(
      tempDir,
      'ru-hexlet-io-courses_files',
      'ru-hexlet-io-courses.html',
    )
    const actualCanonical = await fs.readFile(canonicalPath, 'utf-8')
    expect(actualCanonical).toBe(canonicalContent)
  })

  test('should create _files directory for resources', async () => {
    const url = 'https://ru.hexlet.io/courses'

    nock('https://ru.hexlet.io')
      .get('/courses')
      .reply(200, beforeHtml)
      .get('/assets/professions/nodejs.png')
      .reply(200, pngContent, { 'Content-Type': 'image/png' })
      .get('/assets/application.css')
      .reply(200, cssContent)
      .get('/courses')
      .reply(200, canonicalContent)
      .get('/packs/js/runtime.js')
      .reply(200, jsContent)

    await pageLoader(url, tempDir)

    const filesDir = path.join(tempDir, 'ru-hexlet-io-courses_files')
    const stat = await fs.stat(filesDir)
    expect(stat.isDirectory()).toBe(true)
  })

  test('should not download resources from different hosts', async () => {
    const url = 'https://ru.hexlet.io/courses'

    nock('https://ru.hexlet.io')
      .get('/courses')
      .reply(200, beforeHtml)
      .get('/assets/professions/nodejs.png')
      .reply(200, pngContent)
      .get('/assets/application.css')
      .reply(200, cssContent)
      .get('/courses')
      .reply(200, canonicalContent)
      .get('/packs/js/runtime.js')
      .reply(200, jsContent)

    nock('https://cdn2.hexlet.io')
      .get('/assets/menu.css')
      .reply(200, 'external css')

    nock('https://js.stripe.com')
      .get('/v3/')
      .reply(200, 'external js')

    const filepath = await pageLoader(url, tempDir)
    const actualHtml = await fs.readFile(filepath, 'utf-8')

    expect(actualHtml).toContain('href="https://cdn2.hexlet.io/assets/menu.css"')
    expect(actualHtml).toContain('src="https://js.stripe.com/v3/"')
  })

  describe('error handling', () => {
    test('should throw error on network failure', async () => {
      const url = 'https://nonexistent.com/page'

      nock('https://nonexistent.com')
        .get('/page')
        .replyWithError('getaddrinfo ENOTFOUND nonexistent.com')

      await expect(pageLoader(url, tempDir)).rejects.toThrow(/nonexistent.com/)
    })

    test('should throw error on 404 response', async () => {
      const url = 'https://example.com/notfound'

      nock('https://example.com')
        .get('/notfound')
        .reply(404, 'Not Found')

      await expect(pageLoader(url, tempDir)).rejects.toThrow(/404/)
    })

    test('should throw error on 500 response', async () => {
      const url = 'https://example.com/error'

      nock('https://example.com')
        .get('/error')
        .reply(500, 'Internal Server Error')

      await expect(pageLoader(url, tempDir)).rejects.toThrow(/500/)
    })

    test('should throw error when output directory does not exist', async () => {
      const url = 'https://example.com/page'
      const nonExistentDir = '/nonexistent/directory/path'

      nock('https://example.com')
        .get('/page')
        .reply(200, '<html></html>')

      await expect(pageLoader(url, nonExistentDir)).rejects.toThrow(/ENOENT/)
    })

    test('should throw error when asset download fails', async () => {
      const url = 'https://example.com/page'
      const htmlWithImage = '<html><body><img src="/image.png"></body></html>'

      nock('https://example.com')
        .get('/page')
        .reply(200, htmlWithImage)
        .get('/image.png')
        .reply(404, 'Not Found')

      await expect(pageLoader(url, tempDir)).rejects.toThrow(/404/)
    })

    test('should throw error when asset network fails', async () => {
      const url = 'https://example.com/page'
      const htmlWithImage = '<html><body><img src="/image.png"></body></html>'

      nock('https://example.com')
        .get('/page')
        .reply(200, htmlWithImage)
        .get('/image.png')
        .replyWithError('Connection reset')

      await expect(pageLoader(url, tempDir)).rejects.toThrow()
    })
  })
})
