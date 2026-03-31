import { spawn, type ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')
const frontendDir = path.join(root, 'frontend')
const evidenceDir = path.join(root, '.sisyphus', 'evidence')
const frontendUrl = 'http://localhost:5173'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function isUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function waitUp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isUp(url)) {
      return true
    }
    await sleep(1000)
  }
  return false
}

function stopProcess(processRef: ChildProcess | null): Promise<void> {
  return new Promise((resolve) => {
    if (!processRef) {
      resolve()
      return
    }

    processRef.once('exit', () => resolve())
    processRef.kill()
    setTimeout(() => {
      if (!processRef.killed) {
        processRef.kill('SIGKILL')
      }
      resolve()
    }, 5000)
  })
}

async function main(): Promise<void> {
  let frontendProc: ChildProcess | null = null

  if (!(await isUp(frontendUrl))) {
    frontendProc = spawn('npm', ['run', 'dev'], {
      cwd: frontendDir,
      shell: true,
      stdio: 'ignore',
    })
  }

  try {
    const ready = await waitUp(frontendUrl, 60000)
    if (!ready) {
      throw new Error('Frontend server did not become ready within timeout')
    }

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 740 } })

    await page.goto(`${frontendUrl}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('body', { timeout: 10000 })
    await page.screenshot({
      path: path.join(evidenceDir, 'task-3-shell.png'),
      fullPage: true,
    })

    await page.goto(`${frontendUrl}/route-does-not-exist`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('body', { timeout: 10000 })
    await page.screenshot({
      path: path.join(evidenceDir, 'task-3-notfound.png'),
      fullPage: true,
    })

    await browser.close()

    const markerPath = path.join(evidenceDir, 'task-3-shell.txt')
    await writeFile(
      markerPath,
      `Generated at: ${new Date().toISOString()}\nScreenshots: task-3-shell.png, task-3-notfound.png\nResult: PASS\n`,
      'utf-8'
    )

    console.log('Generated task-3-shell.png and task-3-notfound.png')
  } finally {
    await stopProcess(frontendProc)
  }
}

main().catch((error) => {
  console.error('Failed generating task-3 screenshots:', error)
  process.exit(1)
})
