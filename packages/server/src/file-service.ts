import { readFile as fsReadFile, writeFile as fsWriteFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export class FileService {
  static async readFile(filePath: string): Promise<string | null> {
    try {
      return await fsReadFile(filePath, 'utf-8')
    } catch {
      return null
    }
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    await mkdir(join(filePath, '..'), { recursive: true })
    await fsWriteFile(filePath, content, 'utf-8')
  }
}
