import * as lsp from 'vscode-languageserver/node'

import {
  COMPLETION_TRIGGERS,
  CompletionProvider,
} from './CompletionProvider'
import { textDocuments } from './textDocuments'
import { configRef, getConfig, resolveConfig } from './config'

export function createConnection(): lsp.Connection {
  const fileConfig = getConfig()
  const noop = { listen: () => {} } as lsp.Connection

  if (!fileConfig) {
    return noop
  }

  const configPromise = resolveConfig(fileConfig)
  configRef._promise = configPromise

  const connection = lsp.createConnection(process.stdin, process.stdout)

  textDocuments.listen(connection)

  const completionProvider = new CompletionProvider()
  // const definitionProvider = new CSSModulesDefinitionProvider()

  connection.onInitialize(({ capabilities, initializationOptions }) => {
    // if (initializationOptions) {
    // }
    const hasWorkspaceFolderCapability = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    )
    const result: lsp.InitializeResult = {
      capabilities: {
        textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
        hoverProvider: true,
        definitionProvider: false,
        implementationProvider: false,
        completionProvider: {
          triggerCharacters: COMPLETION_TRIGGERS,
          resolveProvider: true,
        },
      },
    }
    if (hasWorkspaceFolderCapability) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true,
        },
      }
    }

    return result
  })

  connection.onCompletion(completionProvider.completion)
  connection.onHover(completionProvider.provideHover)

  // connection.onDefinition(definitionProvider.definition)
  // connection.onImplementation(definitionProvider.definition)
  //
  // connection.onHover(definitionProvider.hover)

  return connection
}
