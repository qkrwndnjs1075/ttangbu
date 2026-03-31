import { access, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const evidenceDir = path.join(projectRoot, '.sisyphus', 'evidence')

const requiredArtifacts = [
  'docs/FEATURES.md',
  'docs/ERD.md',
  'docs/API.md',
  'docs/FINAL_REPORT.md',
]

const routeFiles = [
  { file: 'backend/src/routes/health.ts', basePath: '/health' },
  { file: 'backend/src/routes/auth.ts', basePath: '/auth' },
  { file: 'backend/src/routes/listings.ts', basePath: '/listings' },
  { file: 'backend/src/routes/applications.ts', basePath: '/applications' },
  { file: 'backend/src/routes/messages.ts', basePath: '' },
]

function normalizePath(basePath: string, routePath: string): string {
  if (routePath === '/') {
    return basePath || '/'
  }

  if (!basePath) {
    return routePath
  }

  return `${basePath}${routePath.startsWith('/') ? routePath : `/${routePath}`}`
}

async function buildArtifactCheck(): Promise<void> {
  const lines: string[] = []
  let allPresent = true

  for (const relativePath of requiredArtifacts) {
    const absolutePath = path.join(projectRoot, relativePath)
    try {
      await access(absolutePath)
      const stats = await stat(absolutePath)
      const pass = stats.size > 0
      if (!pass) {
        allPresent = false
      }
      lines.push(`${relativePath}: ${pass ? 'PASS' : 'FAIL'} (size=${stats.size} bytes)`)
    } catch {
      allPresent = false
      lines.push(`${relativePath}: FAIL (missing)`)
    }
  }

  lines.unshift('Task: task-20-artifact-check')
  lines.splice(1, 0, `Generated at: ${new Date().toISOString()}`)
  lines.push('')
  lines.push(`Result: ${allPresent ? 'PASS' : 'FAIL'}`)

  await writeFile(
    path.join(evidenceDir, 'task-20-artifact-check.txt'),
    `${lines.join('\n')}\n`,
    'utf-8'
  )
}

async function extractCodeEndpoints(): Promise<string[]> {
  const endpoints = new Set<string>()

  for (const routeFile of routeFiles) {
    const absolutePath = path.join(projectRoot, routeFile.file)
    const source = await readFile(absolutePath, 'utf-8')
    const regex = /(health|auth|listings|applications|messages)\.(get|post|patch)\('([^']+)'/g
    let match = regex.exec(source)

    while (match) {
      const method = match[2].toUpperCase()
      const routePath = match[3]
      const fullPath = normalizePath(routeFile.basePath, routePath)
      endpoints.add(`${method} ${fullPath}`)
      match = regex.exec(source)
    }
  }

  return [...endpoints].sort()
}

async function buildApiFidelityCheck(): Promise<void> {
  const apiDocPath = path.join(projectRoot, 'docs', 'API.md')
  const apiDoc = await readFile(apiDocPath, 'utf-8')
  const codeEndpoints = await extractCodeEndpoints()

  const missing = codeEndpoints.filter((endpoint) => !apiDoc.includes(endpoint))
  const pass = missing.length === 0

  const lines: string[] = [
    'Task: task-20-api-fidelity',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Code endpoints detected: ${codeEndpoints.length}`,
    `Documented endpoints matched: ${codeEndpoints.length - missing.length}`,
    '',
    'Endpoint coverage:',
    ...codeEndpoints.map((endpoint) => `  - ${endpoint}${missing.includes(endpoint) ? ' [MISSING]' : ''}`),
    '',
    `Result: ${pass ? 'PASS' : 'FAIL'}`,
  ]

  await writeFile(
    path.join(evidenceDir, 'task-20-api-fidelity.txt'),
    `${lines.join('\n')}\n`,
    'utf-8'
  )
}

async function main(): Promise<void> {
  await buildArtifactCheck()
  await buildApiFidelityCheck()
  console.log('Generated: task-20-artifact-check.txt, task-20-api-fidelity.txt')
}

main().catch((error) => {
  console.error('Failed to generate T20 evidence:', error)
  process.exit(1)
})
