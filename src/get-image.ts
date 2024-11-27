import { readFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import asciifyImage from 'asciify-image'

export function toSvg(path: string, fontSize: number) {
  return (color: string) =>
    `<svg viewBox='0 0 1035 1035' width='${fontSize}px' height='${fontSize}px' xmlns='http://www.w3.org/2000/svg' style='transform:rotateX(180deg) scale(.9);transform-origin:center;'><path fill='#${color}' d='${path}'></path></svg>`
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const cache = new Map<string, string>()
export async function toASCII(svg: string) {
  const cacheKey = svg
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!
  }
  await sleep(1000)
  const resvg = new Resvg(svg)
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()
  const res = await asciifyImage(pngBuffer, { width: pngData.width, height: pngData.height, format: 'string', color: false })
  const ascii = Array.isArray(res) ? res.reverse().join('\n') : res.split('\n').reverse().join('\n')
  cache.set(cacheKey, ascii)
  return ascii
}

export function parseIconfont(resolvedSvgPath: string, fontSize: number) {
  try {
    if (!resolvedSvgPath)
      return {}
    const str = readFileSync(resolvedSvgPath, 'utf-8')

    // 构建单个 icon 的数据结构
    const singleIconRegx
      = /<glyph[\s\S]*?glyph-name="([^"]+)"[\s\S]*?unicode="([^"]+)"[\s\S]*?d="([^"]+)"[\s\S]*?\/>/g
    const codeMap: Record<string, { ascii?: string, _promise?: Promise<string>, resolved: boolean }> = {}

    let match = singleIconRegx.exec(str)
    while (match) {
      const [, , code, path] = match
      const item: { ascii?: string, resolved: boolean } = { resolved: false }
      const getAnsi = () => {
        const asciiPromise = toASCII(toSvg(path, fontSize)('ffffff'))
        asciiPromise.then(res => item.ascii = res)
        return asciiPromise
      }
      getAnsi()
      codeMap[code] = item
      match = singleIconRegx.exec(str)
    }

    return codeMap
  }
  catch (error) {
    console.error(error)
    return {}
  }
}
