import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const planPath = path.resolve(projectRoot, '..', 'ttangbu-4week-frontend-backend-plan-ko.md')
const evidenceDir = path.join(projectRoot, '.sisyphus', 'evidence')

interface TaskStatus {
  taskId: string
  checked: boolean
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)))
    } else {
      files.push(fullPath)
    }
  }

  return files
}

function parseTaskStatuses(plan: string): TaskStatus[] {
  const statuses: TaskStatus[] = []
  const regex = /- \[(x| )\] (T\d+)\./g
  let match = regex.exec(plan)
  while (match) {
    statuses.push({ taskId: match[2], checked: match[1] === 'x' })
    match = regex.exec(plan)
  }
  return statuses
}

function parseExpectedEvidence(plan: string): string[] {
  const expected: string[] = []
  const regex = /-> `([^`]+)`/g
  let match = regex.exec(plan)
  while (match) {
    const raw = match[1]
    const normalized = raw.startsWith('.sisyphus/evidence/')
      ? raw.replace('.sisyphus/evidence/', '')
      : raw
    expected.push(normalized)
    match = regex.exec(plan)
  }
  return [...new Set(expected)]
}

async function generateF1(plan: string): Promise<void> {
  const tasks = parseTaskStatuses(plan)
  const required = tasks.filter((task) => Number(task.taskId.slice(1)) <= 20)
  const completed = required.filter((task) => task.checked)
  const pending = required.filter((task) => !task.checked)

  const lines = [
    'Final Wave F1: Plan Compliance Audit',
    `Generated at: ${new Date().toISOString()}`,
    `Plan file: ${planPath}`,
    '',
    `Total tasks (T1~T20): ${required.length}`,
    `Completed: ${completed.length}`,
    `Pending: ${pending.length}`,
    '',
    'Task status:',
    ...required.map((task) => `  - ${task.taskId}: ${task.checked ? 'DONE' : 'PENDING'}`),
    '',
    `Result: ${pending.length === 0 ? 'PASS' : 'FAIL'}`,
  ]

  await writeFile(path.join(evidenceDir, 'final-f1-plan-audit.txt'), `${lines.join('\n')}\n`, 'utf-8')
}

async function generateF3(plan: string): Promise<void> {
  const expectedEvidence = parseExpectedEvidence(plan)
  const lines = [
    'Final Wave F3: QA Evidence Matrix',
    `Generated at: ${new Date().toISOString()}`,
    '',
  ]

  let foundCount = 0
  for (const evidenceName of expectedEvidence) {
    const fullPath = path.join(evidenceDir, evidenceName)
    let exists = false
    let size = 0
    try {
      const fileStat = await stat(fullPath)
      exists = fileStat.isFile()
      size = fileStat.size
    } catch {
      exists = false
    }

    if (exists) {
      foundCount += 1
    }

    lines.push(`  - ${evidenceName}: ${exists ? `PASS (size=${size})` : 'FAIL (missing)'}`)
  }

  const coverage = expectedEvidence.length
    ? ((foundCount / expectedEvidence.length) * 100).toFixed(1)
    : '100.0'

  lines.push('')
  lines.push(`Expected evidence files: ${expectedEvidence.length}`)
  lines.push(`Found evidence files: ${foundCount}`)
  lines.push(`Coverage: ${coverage}%`)
  lines.push(`Result: ${foundCount === expectedEvidence.length ? 'PASS' : 'FAIL'}`)

  await writeFile(path.join(evidenceDir, 'final-f3-qa-matrix.txt'), `${lines.join('\n')}\n`, 'utf-8')
}

async function generateF4(): Promise<void> {
  const sourceRoots = [
    path.join(projectRoot, 'backend', 'src'),
    path.join(projectRoot, 'frontend', 'src'),
  ]

  const forbiddenPatterns = [
    { label: 'payment', regex: /\bstripe\b|\bpaypal\b|\bpayment\b/i },
    { label: 'websocket', regex: /\bwebsocket\b|\bsocket\.io\b/i },
    { label: 'geo-search', regex: /\bpostgis\b|\bgeospatial\b/i },
    { label: 'microservice', regex: /\bmicroservice\b|\bevent bus\b/i },
  ]

  const findings: Array<{ file: string; label: string; line: number; excerpt: string }> = []

  for (const root of sourceRoots) {
    const files = await walkFiles(root)
    const targetFiles = files.filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))

    for (const filePath of targetFiles) {
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        for (const pattern of forbiddenPatterns) {
          if (pattern.regex.test(line)) {
            findings.push({
              file: path.relative(projectRoot, filePath),
              label: pattern.label,
              line: i + 1,
              excerpt: line.trim(),
            })
          }
        }
      }
    }
  }

  const lines = [
    'Final Wave F4: Scope Fidelity Check',
    `Generated at: ${new Date().toISOString()}`,
    'Scan scope: backend/src + frontend/src',
    '',
    ...forbiddenPatterns.map((pattern) => `Policy keyword: ${pattern.label}`),
    '',
  ]

  if (findings.length === 0) {
    lines.push('No forbidden-scope indicators found in source files.')
    lines.push('Result: PASS')
  } else {
    lines.push('Potential scope-drift findings:')
    for (const finding of findings) {
      lines.push(`  - ${finding.file}:${finding.line} [${finding.label}] ${finding.excerpt}`)
    }
    lines.push('Result: FAIL')
  }

  await writeFile(path.join(evidenceDir, 'final-f4-scope-fidelity.txt'), `${lines.join('\n')}\n`, 'utf-8')
}

async function main(): Promise<void> {
  const plan = await readFile(planPath, 'utf-8')
  await generateF1(plan)
  await generateF3(plan)
  await generateF4()
  console.log('Generated: final-f1-plan-audit.txt, final-f3-qa-matrix.txt, final-f4-scope-fidelity.txt')
}

main().catch((error) => {
  console.error('Failed to generate final wave evidence:', error)
  process.exit(1)
})
