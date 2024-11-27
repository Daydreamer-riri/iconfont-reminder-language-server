#!/usr/bin/env node

import { version } from '../package.json'
import { createConnection } from './connection'

const args = process.argv

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${version}`)
  process.exit(0)
}

createConnection().listen()
