import { ConvexClient } from 'convex/browser'
import { createBridgeAgent, type BridgeAgent } from './agent'
import type { ExecutorContext } from './tools/executor'
import type {
  ClientMessage,
  BridgeEvent,
  InitMessage,
} from './protocol'
import type { ToolDefinition } from './tools/types'

export type ServerOptions = {
  port: number
  token: string
  verbose: boolean
}

type ConnectionPhase = 'awaiting_init' | 'ready'

type ConnectionState = {
  phase: ConnectionPhase
  agent: BridgeAgent | null
  executorCtx: ExecutorContext | null
  abortController: AbortController | null
}

const connections = new Map<object, ConnectionState>()

export function startServer(options: ServerOptions) {
  const { port, token, verbose } = options

  const log = verbose
    ? (...args: unknown[]) => console.log('[bridge]', ...args)
    : () => {}

  const server = Bun.serve({
    port,
    async fetch(req, server) {
      const url = new URL(req.url)

      // Health check endpoint
      if (url.pathname === '/health') {
        return new Response('ok')
      }

      // WebSocket upgrade
      const clientToken = url.searchParams.get('token')
      if (clientToken !== token) {
        log(`Auth failed: got "${clientToken?.slice(0, 8)}..."`)
        return new Response('Unauthorized', { status: 401 })
      }

      const origin = req.headers.get('origin')
      if (origin && !isAllowedOrigin(origin)) {
        log(`Origin rejected: ${origin}`)
        return new Response('Forbidden', { status: 403 })
      }

      server.upgrade(req)
    },
    websocket: {
      open(ws) {
        connections.set(ws, {
          phase: 'awaiting_init',
          agent: null,
          executorCtx: null,
          abortController: null,
        })
        log('WebSocket connected, awaiting init')
      },

      async message(ws, raw) {
        const state = connections.get(ws)
        if (!state) return

        let msg: ClientMessage
        try {
          msg = JSON.parse(raw as string)
        } catch {
          sendEvent(ws, {
            type: 'error',
            code: 'invalid_message',
            message: 'Invalid JSON',
          })
          return
        }

        switch (msg.type) {
          case 'init': {
            await handleInit(ws, state, msg, log)
            break
          }

          case 'chat': {
            if (state.phase !== 'ready' || !state.agent) {
              sendEvent(ws, {
                type: 'error',
                code: 'init_required',
                message: 'Send init message before chatting',
              })
              return
            }

            const abortController = new AbortController()
            state.abortController = abortController

            try {
              log(`Chat: "${msg.text.slice(0, 80)}..."`)
              for await (const event of state.agent.chat(
                msg.text,
                msg.model,
                msg.thinking,
                abortController.signal,
              )) {
                if (abortController.signal.aborted) break
                sendEvent(ws, event)
              }
            } catch (e: any) {
              if (!abortController.signal.aborted) {
                sendEvent(ws, {
                  type: 'error',
                  code: 'agent_error',
                  message: e?.message ?? 'Unknown error',
                })
              }
            }

            state.abortController = null
            sendEvent(ws, { type: 'done' })
            break
          }

          case 'refresh_auth': {
            if (state.executorCtx) {
              state.executorCtx.auth = {
                ...state.executorCtx.auth,
                ...msg.auth,
              }
              log('Auth refreshed')

              // If there's a Convex client and a convex token, update auth
              if (state.executorCtx.convex && msg.auth.convexToken) {
                const token = msg.auth.convexToken
                state.executorCtx.convex.setAuth(async () => token)
              }
            }
            break
          }

          case 'abort': {
            if (state.abortController) {
              state.abortController.abort()
              log('Chat aborted')
            }
            break
          }
        }
      },

      close(ws) {
        const state = connections.get(ws)
        if (state) {
          state.abortController?.abort()
          state.executorCtx?.convex?.close()
          connections.delete(ws)
          log('WebSocket disconnected')
        }
      },
    },
  })

  console.log(`Local agent bridge listening on :${port}`)
  return server
}

async function handleInit(
  ws: any,
  state: ConnectionState,
  msg: InitMessage,
  log: (...args: unknown[]) => void,
) {
  try {
    const auth = msg.auth ?? {}

    // Set up Convex client if any tools need it
    let convex: ConvexClient | null = null
    const needsConvex = msg.tools.some(
      (t: ToolDefinition) => t.handler.type === 'convex',
    )

    if (needsConvex) {
      const convexUrl = auth.convexUrl
      if (!convexUrl) {
        sendEvent(ws, {
          type: 'error',
          code: 'init_required',
          message:
            'Convex tools require auth.convexUrl in init message',
        })
        return
      }

      convex = new ConvexClient(convexUrl)
      if (auth.convexToken) {
        const token = auth.convexToken
        convex.setAuth(async () => token)
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    const executorCtx: ExecutorContext = { convex, auth }
    const agent = createBridgeAgent(msg.tools, msg.systemPrompt, executorCtx)

    state.phase = 'ready'
    state.agent = agent
    state.executorCtx = executorCtx

    log(`Initialized with ${msg.tools.length} tools`)
    sendEvent(ws, { type: 'ready' })
  } catch (e: any) {
    sendEvent(ws, {
      type: 'error',
      code: 'init_required',
      message: `Init failed: ${e.message}`,
    })
  }
}

function sendEvent(ws: any, event: BridgeEvent) {
  ws.send(JSON.stringify(event))
}

function isAllowedOrigin(origin: string): boolean {
  return /^https?:\/\/localhost(:\d+)?$/.test(origin)
}
