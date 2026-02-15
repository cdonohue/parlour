import { readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises'

export class FileService {
  static async readFile(filePath: string): Promise<string> {
    return fsReadFile(filePath, 'utf-8')
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    await fsWriteFile(filePath, content, 'utf-8')
  }
}
