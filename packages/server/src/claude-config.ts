import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { dirname } from 'path'

export async function loadJsonFile<T = Record<string, unknown>>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function saveJsonFile(filePath: string, data: unknown): Promise<void> {
  const tmp = filePath + '.tmp'
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await rename(tmp, filePath)
}
