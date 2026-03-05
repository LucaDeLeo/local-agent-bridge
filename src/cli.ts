#!/usr/bin/env bun
import { randomBytes } from 'crypto'
import { startServer } from './server'

// ── Parse CLI flags ──

function getFlag(name: string, defaultValue: string): string {
  const flag = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  return flag?.split('=')[1] ?? defaultValue
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(`
local-agent-bridge — Run an AI agent bridge server

Usage:
  local-agent-bridge [options]

Options:
  --port=<number>   Port to listen on (default: 3002)
  --open=<url>      Open URL in browser with token in hash fragment
  --verbose         Enable verbose logging
  --help            Show this help message

The bridge token is generated randomly on each start and printed to stdout.
Pass it to your app via the URL hash: https://yourapp.com#agent=<token>
`)
  process.exit(0)
}

const port = parseInt(getFlag('port', '3002'), 10)
const openUrl = getFlag('open', '')
const verbose = hasFlag('verbose')

// ── Generate bridge token ──

const token = randomBytes(32).toString('base64url')

console.log('Local agent bridge starting...')
console.log(`WebSocket: ws://localhost:${port}`)
console.log(`Token: ${token}`)
console.log()

// ── Open browser if --open specified ──

if (openUrl) {
  const targetUrl = `${openUrl}#agent=${token}`
  console.log(`Opening ${targetUrl}`)
  const open = await import('open')
  await open.default(targetUrl)
}

console.log('Bridge ready. Waiting for connections...')
console.log('Press Ctrl+C to stop.')
console.log()

// ── Start server ──

startServer({ port, token, verbose })
