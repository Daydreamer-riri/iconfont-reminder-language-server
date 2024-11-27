import path from 'node:path'
import fs from 'node:fs'
import jiti from 'jiti'
import { parse } from 'json5'
import { parseIconfont } from './get-image'

// type MapGraph = NonNullable<Awaited<ReturnType<typeof createMapGraph>>>

// interface Config {
//   mapGraph
// }

type Config = NonNullable<Awaited<ReturnType<typeof resolveConfig>>>

export const configRef: { value: Config | null, _promise: Promise<Config | null> | null } = { value: null, _promise: null }

export function getConfig() {
  const vscodeSettings = path.resolve(process.cwd(), '.vscode/settings.json')
  if (!fs.existsSync(vscodeSettings)) {
    return false
  }
  const content = fs.readFileSync(vscodeSettings, 'utf8')
  const settings = parse<{ ['iconfontReminder.mapFilePath']?: string, ['iconfontReminder.svgPath']?: string }>(content)
  if (!settings) {
    return false
  }
  const dotVscodeDir = path.join(process.cwd(), '.vscode')
  if (!settings['iconfontReminder.mapFilePath'] || !settings['iconfontReminder.svgPath']) {
    return false
  }

  const mapFile = path.resolve(dotVscodeDir, settings['iconfontReminder.mapFilePath'])
  const svgFile = path.resolve(dotVscodeDir, settings['iconfontReminder.svgPath'])

  if (!fs.existsSync(mapFile) || !fs.existsSync(svgFile))
    return false

  return { mapFilePath: settings['iconfontReminder.mapFilePath'], svgPath: settings['iconfontReminder.svgPath'] }
}

export async function resolveConfig({ svgPath, mapFilePath }: { svgPath: string, mapFilePath: string }) {
  const dotVscodeDir = path.join(process.cwd(), '.vscode')
  const mapFile = path.resolve(dotVscodeDir, mapFilePath)
  const svgFile = path.resolve(dotVscodeDir, svgPath)

  if (!fs.existsSync(mapFile) || !fs.existsSync(svgFile))
    return null

  const originMap: Record<string, string> = await jiti(mapFile, {
    interopDefault: true,
    cache: false,
    requireCache: false,
  })(mapFile).default

  const entries = Object.entries(originMap)
  const names = Object.keys(originMap)
  const codes = Object.values(originMap)

  const nameToCodeMap = new Map(entries)
  const codeToNameMap = new Map(entries.map(entry => [entry[1], entry[0]]))

  function getNameByCode(code: string) {
    return codeToNameMap.get(code)
  }

  function getCodeByName(name: string) {
    return nameToCodeMap.get(name)
  }

  const codeMap = parseIconfont(svgFile, 24)

  function getASCIIByName(name: string) {
    const code = getCodeByName(name)
    if (!code)
      return null
    return codeMap[code].ascii ?? 'Loading...'
  }

  const mapGraph = { originMap, getCodeByName, getNameByCode, names, codes }
  const config = { mapGraph, codeMap, getCodeByName, getASCIIByName }
  configRef.value = config

  return config
}
