import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import type { Position } from 'vscode-languageserver-protocol'
import type { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument'
import * as lsp from 'vscode-languageserver/node'

// import { resolveAliasedImport } from './utils/resolveAliasedImport'

export function formatIconCode(codeStr: string) {
  if (typeof codeStr != 'string') {
    return codeStr
  }

  const code = codeStr.replace(/&#x([0-9a-fA-F]+);/g, (all, hex) => {
    return String.fromCodePoint(Number.parseInt(hex, 0x10))
  })
  return code
}

export function getCurrentDirFromUri(uri: DocumentUri) {
  const filePath = url.fileURLToPath(uri)
  return path.dirname(filePath)
}

export type CamelCaseValues = false | true | 'dashes'

export function genImportRegExp(importName: string): RegExp {
  const file = '(.+\\.(styl|sass|scss|less|css))'
  const fromOrRequire = '(?:from\\s+|=\\s+require(?:<any>)?\\()'
  const requireEndOptional = '\\)?'
  const pattern = `\\b${importName}\\s+${fromOrRequire}["']${file}["']${requireEndOptional}`

  return new RegExp(pattern)
}

function isRelativeFilePath(str: string): boolean {
  return str.startsWith('../') || str.startsWith('./')
}

export type StringTransformer = (str: string) => string

export function isImportLineMatch(
  line: string,
  matches: RegExpExecArray,
  current: number,
): boolean {
  if (matches === null) {
    return false
  }

  const start1 = line.indexOf(matches[1]) + 1
  const start2 = line.indexOf(matches[2]) + 1

  // check current character is between match words
  return (
    (current > start2 && current < start2 + matches[2].length)
    || (current > start1 && current < start1 + matches[1].length)
  )
}

export function getWords(
  line: string,
  position: Position,
): [string, string] | null {
  const headText = line.slice(0, position.character)
  const startIndex = headText.search(/[\w.]*$/)
  // not found or not clicking object field
  if (startIndex === -1 || !headText.slice(startIndex).includes('.')) {
    // check if this is a subscript expression instead
    const startIndex = headText.search(/[\w"'[\-]*$/)
    if (
      startIndex === -1
      || !headText.slice(startIndex).includes('[')
    ) {
      return null
    }

    const match = /^([\w\-['"]*)/.exec(line.slice(startIndex))
    if (match === null) {
      return null
    }

    const [styles, className] = match[1].split('[')

    // remove wrapping quotes around class name (both `'` or `"`)
    const unwrappedName = className.substring(1, className.length - 1)

    return [styles, unwrappedName] as [string, string]
  }

  const match = /^([\w.]*)/.exec(line.slice(startIndex))
  if (match === null) {
    return null
  }

  return match[1].split('.') as [string, string]
}

export function getWordRangeAtPosition(document: TextDocument, position: Position): lsp.Range | null {
  const text = document.getText()
  const offset = document.offsetAt(position)
  const startSpace = text.lastIndexOf(' ', offset - 1) + 1
  const startSQ = text.lastIndexOf('\'', offset - 1) + 1
  const startDQ = text.lastIndexOf('"', offset - 1) + 1
  const start = Math.max(startSpace, startSQ, startDQ)

  const endSpace = text.indexOf(' ', offset)
  const endSQ = text.indexOf('\'', offset)
  const endDQ = text.indexOf('"', offset)
  const end = Math.min(endSpace, endSQ, endDQ)
  if (start === -1 || end === -1) {
    return null
  }
  return lsp.Range.create(document.positionAt(start), document.positionAt(end))
}

interface ClassnamePostion {
  line: number
  column: number
}

export interface Classname {
  position: ClassnamePostion
  declarations: string[]
  comments: string[]
}

type ClassnameDict = Record<string, Classname>

export function log(...args: unknown[]) {
  const timestamp = new Date().toLocaleTimeString('en-GB', { hour12: false })
  const msg = args
    .map(x =>
      typeof x === 'object' ? `\n${JSON.stringify(x, null, 2)}` : x,
    )
    .join('\n\t')

  fs.appendFileSync('/tmp/log-cssmodules', `\n[${timestamp}] ${msg}\n`)
}

function sanitizeSelector(selector: string) {
  return selector
    .replace(/\\n|\\t/g, '')
    .replace(/\s+/, ' ')
    .trim()
}

// https://github.com/wkillerud/some-sass/blob/main/vscode-extension/src/utils/string.ts
export function getEOL(text: string): string {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === '\r') {
      if (i + 1 < text.length && text.charAt(i + 1) === '\n') {
        return '\r\n'
      }
      return '\r'
    }
    if (ch === '\n') {
      return '\n'
    }
  }
  return '\n'
}
