import { useEffect, useRef, useState, useCallback } from 'react'
import type {
  BridgeEvent,
  AgentMessage,
  AgentModel,
  ContentPart,
  ThinkingLevel,
  ClientMessage,
} from '../src/protocol'
import type { UseLocalAgentConfig, UseLocalAgentReturn, ConnectionStatus } from './types'

const SESSION_STORAGE_KEY = 'local-agent-token'
const TOKEN_REFRESH_INTERVAL = 45_000
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_BASE_DELAY = 1000

export function useLocalAgent(config: UseLocalAgentConfig): UseLocalAgentReturn {
  const {
    port = 3002,
    tools,
    systemPrompt,
    getAuth,
    loadMessages,
    persistMessages,
  } = config

  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [streamParts, setStreamParts] = useState<ContentPart[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // Ref for streaming parts (avoid stale closures in WS handler)
  const partsRef = useRef<ContentPart[]>([])
  const isStreamingRef = useRef(false)

  // Stable refs for config callbacks
  const persistRef = useRef(persistMessages)
  persistRef.current = persistMessages
  const getAuthRef = useRef(getAuth)
  getAuthRef.current = getAuth
  const toolsRef = useRef(tools)
  toolsRef.current = tools
  const systemPromptRef = useRef(systemPrompt)
  systemPromptRef.current = systemPrompt

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tokenRefreshInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const agentTokenRef = useRef<string | null>(null)
  const initializedRef = useRef(false)

  // Load persisted messages on mount
  useEffect(() => {
    if (initializedRef.current || !loadMessages) return
    initializedRef.current = true

    const result = loadMessages()
    if (result instanceof Promise) {
      result.then((msgs) => setMessages(msgs)).catch(() => {})
    } else {
      setMessages(result)
    }
  }, [loadMessages])

  const persist = (updatedMessages: AgentMessage[]) => {
    persistRef.current?.(updatedMessages)
  }

  const appendMessage = (msg: AgentMessage) => {
    setMessages((prev) => {
      const updated = [...prev, msg]
      persist(updated)
      return updated
    })
  }

  const resetStreamState = () => {
    partsRef.current = []
    setStreamParts([])
    isStreamingRef.current = false
    setIsStreaming(false)
  }

  // Read agent token from URL hash on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    const hash = window.location.hash
    const match = hash.match(/#agent=([^&]+)/)
    if (match) {
      const token = match[1]
      sessionStorage.setItem(SESSION_STORAGE_KEY, token)
      agentTokenRef.current = token
      // Clean hash from URL
      history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    } else {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (stored) {
        agentTokenRef.current = stored
      }
    }
  }, [])

  // WebSocket connection management
  useEffect(() => {
    const agentToken = agentTokenRef.current
    if (!agentToken) return

    let unmounted = false

    const connect = async () => {
      if (unmounted) return
      setStatus('connecting')

      const wsUrl = `ws://localhost:${port}?token=${encodeURIComponent(agentToken)}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = async () => {
        if (unmounted) {
          ws.close()
          return
        }

        // Send init message with tools and system prompt
        const auth = await getAuthRef.current?.() ?? {}
        const initMsg: ClientMessage = {
          type: 'init',
          tools: toolsRef.current,
          systemPrompt: systemPromptRef.current,
          auth,
        }
        ws.send(JSON.stringify(initMsg))

        // Start auth refresh interval
        tokenRefreshInterval.current = setInterval(async () => {
          try {
            const freshAuth = await getAuthRef.current?.()
            if (freshAuth && ws.readyState === WebSocket.OPEN) {
              const msg: ClientMessage = {
                type: 'refresh_auth',
                auth: freshAuth,
              }
              ws.send(JSON.stringify(msg))
            }
          } catch {
            // Auth refresh failure is non-fatal
          }
        }, TOKEN_REFRESH_INTERVAL)
      }

      ws.onmessage = (event) => {
        let data: BridgeEvent
        try {
          data = JSON.parse(event.data) as BridgeEvent
        } catch {
          return
        }

        switch (data.type) {
          case 'ready': {
            setStatus('connected')
            reconnectAttempts.current = 0
            break
          }

          case 'text': {
            if (!isStreamingRef.current) {
              isStreamingRef.current = true
              setIsStreaming(true)
            }
            const parts = partsRef.current
            const last = parts[parts.length - 1]
            if (last && last.type === 'text') {
              last.content += data.content
            } else {
              parts.push({ type: 'text', content: data.content })
            }
            setStreamParts([...parts])
            break
          }

          case 'tool_use': {
            if (!isStreamingRef.current) {
              isStreamingRef.current = true
              setIsStreaming(true)
            }
            partsRef.current.push({
              type: 'tool_call',
              name: data.name,
              input: data.input,
            })
            setStreamParts([...partsRef.current])
            break
          }

          case 'tool_result': {
            for (const p of partsRef.current) {
              if (p.type === 'tool_call' && p.output === undefined) {
                p.output = data.output
                break
              }
            }
            setStreamParts([...partsRef.current])
            break
          }

          case 'done': {
            const parts = partsRef.current
            if (parts.length > 0) {
              appendMessage({ role: 'assistant', parts: [...parts] })
            }
            resetStreamState()
            break
          }

          case 'error': {
            appendMessage({
              role: 'assistant',
              parts: [{ type: 'text', content: `Error: ${data.message}` }],
            })
            resetStreamState()
            break
          }
        }
      }

      ws.onclose = () => {
        if (unmounted) return

        setStatus('disconnected')
        setIsStreaming(false)
        wsRef.current = null

        if (tokenRefreshInterval.current) {
          clearInterval(tokenRefreshInterval.current)
          tokenRefreshInterval.current = null
        }

        // Auto-reconnect with backoff
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_BASE_DELAY * 2 ** reconnectAttempts.current
          reconnectAttempts.current += 1
          reconnectTimeout.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will fire after this
      }
    }

    connect()

    return () => {
      unmounted = true
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current)
        reconnectTimeout.current = null
      }
      if (tokenRefreshInterval.current) {
        clearInterval(tokenRefreshInterval.current)
        tokenRefreshInterval.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [port])

  const sendMessage = useCallback(
    (text: string, model?: AgentModel, thinking?: ThinkingLevel) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

      appendMessage({ role: 'user', content: text })

      const msg: ClientMessage = { type: 'chat', text, model, thinking }
      wsRef.current.send(JSON.stringify(msg))
    },
    [],
  )

  const abort = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: ClientMessage = { type: 'abort' }
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const clearHistory = useCallback(() => {
    setMessages([])
    resetStreamState()
    persist([])
  }, [])

  return {
    status,
    messages,
    streamParts,
    sendMessage,
    isStreaming,
    abort,
    clearHistory,
  }
}
