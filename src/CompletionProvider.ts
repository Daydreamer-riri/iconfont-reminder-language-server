import type { Position } from 'vscode-languageserver-protocol'
import { CompletionItem } from 'vscode-languageserver-protocol'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import * as lsp from 'vscode-languageserver/node'
import { textDocuments } from './textDocuments'

import { getPROP_NAME_RE, getPROP_NAME_TERNARY_RE } from './constants'
import { configRef } from './config'
import { formatIconCode, getWordRangeAtPosition } from './utils'

export const COMPLETION_TRIGGERS = ['"', '\'']

interface FieldOptions {
  wrappingBracket: boolean
  startsWithQuote: boolean
  endsWithQuote: boolean
}

/**
 * Given the line, position and trigger, returns the identifier referencing the styles spreadsheet and the (partial) field selected with options to help construct the completion item later.
 *
 */
function getWords(
  line: string,
  position: Position,
  trigger: string,
): [string, string, FieldOptions?] | undefined {
  const text = line.slice(0, position.character)
  const index = text.search(/[\w.[\]'"\-]*$/)
  if (index === -1) {
    return undefined
  }

  const words = text.slice(index)

  if (words === '' || !words.includes(trigger)) {
    return undefined
  }

  switch (trigger) {
    // process `.` trigger
    case '.':
      return words.split('.') as [string, string]
      // process `[` trigger
    case '[': {
      const [obj, field] = words.split('[')

      let lineAhead = line.slice(position.character)
      const endsWithQuote = lineAhead.search(/^["']/) !== -1

      lineAhead = endsWithQuote ? lineAhead.slice(1) : lineAhead
      const wrappingBracket = lineAhead.search(/^\s*\]/) !== -1

      const startsWithQuote
                = field.length > 0 && (field[0] === '"' || field[0] === '\'')

      return [
        obj,
        field.slice(startsWithQuote ? 1 : 0),
        { wrappingBracket, startsWithQuote, endsWithQuote },
      ]
    }
    default: {
      throw new Error(`Unsupported trigger character ${trigger}`)
    }
  }
}

function createCompletionItem(
  trigger: string,
  name: string,
  position: Position,
  fieldOptions: FieldOptions | undefined,
): CompletionItem {
  const nameIncludesDashes = name.includes('-')
  const completionField
        = trigger === '[' || nameIncludesDashes ? `['${name}']` : name

  let completionItem: CompletionItem
  // in case of items with dashes, we need to replace the `.` and suggest the field using the subscript expression `[`
  if (trigger === '.') {
    if (nameIncludesDashes) {
      const range = lsp.Range.create(
        lsp.Position.create(position.line, position.character - 1), // replace the `.` character
        position,
      )

      completionItem = CompletionItem.create(completionField)
      completionItem.textEdit = lsp.InsertReplaceEdit.create(
        completionField,
        range,
        range,
      )
    }
    else {
      completionItem = CompletionItem.create(completionField)
    }
  }
  else {
    // trigger === '['
    const startPositionCharacter
            = position.character
            - 1 // replace the `[` character
            - (fieldOptions?.startsWithQuote ? 1 : 0) // replace the starting quote if present

    const endPositionCharacter
            = position.character
            + (fieldOptions?.endsWithQuote ? 1 : 0) // replace the ending quote if present
            + (fieldOptions?.wrappingBracket ? 1 : 0) // replace the wrapping bracket if present

    const range = lsp.Range.create(
      lsp.Position.create(position.line, startPositionCharacter),
      lsp.Position.create(position.line, endPositionCharacter),
    )

    completionItem = CompletionItem.create(completionField)
    completionItem.textEdit = lsp.InsertReplaceEdit.create(
      completionField,
      range,
      range,
    )
  }

  return completionItem
}

export class CompletionProvider {
  PROP_NAME_RE: RegExp
  PROP_NAME_TERNARY_RE: RegExp[]

  constructor() {
    this.PROP_NAME_RE = getPROP_NAME_RE('Icon')
    this.PROP_NAME_TERNARY_RE = getPROP_NAME_TERNARY_RE('Icon')
  }

  completion = async (params: lsp.CompletionParams) => {
    const textdocument = textDocuments.get(params.textDocument.uri)
    if (textdocument === undefined) {
      return []
    }

    return this.provideCompletionItems(textdocument, params.position)
  }

  async provideCompletionItems(
    document: TextDocument,
    position: Position,
  ): Promise<CompletionItem[] | null> {
    if (!configRef.value) {
      return null
    }
    const line = document.getText(
      lsp.Range.create(
        lsp.Position.create(Math.max(0, position.line - 5), 0),
        lsp.Position.create(position.line, position.character),
      ),
    )

    if (!this.PROP_NAME_RE.test(line) && !this.PROP_NAME_TERNARY_RE.some(reg => reg.test(line)))
      return null

    const { names } = configRef.value.mapGraph

    const completionItems: CompletionItem[] = names.map((icon: string) => {
      const item = lsp.CompletionItem.create(icon)
      item.detail = icon
      return item
    })

    const { mapGraph, getASCIIByName } = configRef.value

    return completionItems.map((x, i) => {
      let icon = 'init'
      try {
        icon = getASCIIByName(x.label!)!
      }
      catch (_e) {
        const e = _e as Error
        icon = `${e.name} ${e.message} ${e.stack}`
      }
      return {
        ...x,
        data: i + 1,
        kind: lsp.CompletionItemKind.Color,
        documentation: `
## ${formatIconCode(mapGraph.getCodeByName(x.label)!)}
${icon}

**${x.label}**: ${mapGraph.getCodeByName(x.label)?.slice(3)}
`,
      }
    })
  }

  provideHover: lsp.ServerRequestHandler<lsp.HoverParams, lsp.Hover | undefined | null, never, void> = async ({ position, textDocument }) => {
    if (!configRef.value) {
      return null
    }

    const document = textDocuments.get(textDocument.uri)
    if (!document) {
      return null
    }
    const line = document.getText(
      lsp.Range.create(
        lsp.Position.create(Math.max(0, position.line - 5), 0),
        lsp.Position.create(position.line, position.character),
      ),
    )
    if (!line) {
      return null
    }

    if (!this.PROP_NAME_RE.test(line) && !this.PROP_NAME_TERNARY_RE.some(reg => reg.test(line)))
      return null

    const word = document.getText(getWordRangeAtPosition(document, position)!)

    const { names } = configRef.value.mapGraph
    if (!names.includes(word)) {
      return null
    }

    const content = configRef.value.getASCIIByName(word)

    return {
      contents: {
        language: 'markdown',
        value: content ?? 'empty',
      },
    }
  }
}
