const fs = require('fs')
const path = require('path')

const PLAYWRIGHT_MODULE_CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE_PATH,
  path.resolve(__dirname, '../node_modules/playwright'),
  '/tmp/e2e/node_modules/playwright'
].filter(Boolean)

function loadPlaywright() {
  let lastError
  for (const modulePath of PLAYWRIGHT_MODULE_CANDIDATES) {
    try {
      return require(modulePath)
    } catch (error) {
      lastError = error
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`无法加载 Playwright，请设置 PLAYWRIGHT_MODULE_PATH${detail}`)
}

function isExecutable(filePath) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return false
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function findExecutable(rootPath, depth = 0) {
  if (!rootPath || depth > 8) return null

  let entries
  try {
    entries = fs.readdirSync(rootPath, { withFileTypes: true })
  } catch {
    return null
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(rootPath, entry.name))
    .filter((filePath) => isExecutable(filePath))
    .filter((filePath) => [
      'Google Chrome for Testing',
      'chrome',
      'chrome.exe'
    ].includes(path.basename(filePath)))

  if (files.length) return files[0]

  const directories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((left, right) => right.name.localeCompare(left.name))

  for (const directory of directories) {
    const executable = findExecutable(path.join(rootPath, directory.name), depth + 1)
    if (executable) return executable
  }

  return null
}

function resolveChromeExecutable() {
  const configuredPath = process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH
  if (configuredPath) {
    if (!isExecutable(configuredPath)) {
      throw new Error(`Chrome 可执行文件不存在或不可执行: ${configuredPath}`)
    }
    return configuredPath
  }

  const home = process.env.HOME || process.env.USERPROFILE || ''
  const cacheRoots = [
    process.env.PUPPETEER_CACHE_DIR,
    path.join(home, 'Library/Caches/puppeteer'),
    path.join(home, '.cache/puppeteer'),
    path.join(process.env.LOCALAPPDATA || '', 'puppeteer')
  ].filter(Boolean)

  for (const cacheRoot of cacheRoots) {
    const executable = findExecutable(cacheRoot)
    if (executable) return executable
  }

  return null
}

const playwright = loadPlaywright()
const chromium = new Proxy(playwright.chromium, {
  get(target, property, receiver) {
    if (property === 'launch') {
      return (options = {}) => {
        const launchOptions = { ...options }
        if (!launchOptions.executablePath) {
          const executablePath = resolveChromeExecutable()
          if (executablePath) launchOptions.executablePath = executablePath
        }
        return target.launch(launchOptions)
      }
    }

    const value = Reflect.get(target, property, receiver)
    return typeof value === 'function' ? value.bind(target) : value
  }
})

module.exports = {
  ...playwright,
  chromium,
  resolveChromeExecutable
}
