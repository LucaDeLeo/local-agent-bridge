# local-agent-bridge

A generic bridge that lets any web app add a conversational AI sidebar powered by the user's existing Claude Code login. No API key needed — it reuses the local Claude Code OAuth session. Zero per-token cost to the developer.

The bridge runs locally on the user's machine, connects to the Anthropic Agent SDK, and exposes a WebSocket server that your frontend connects to via a React hook.

## How it works

```
┌─────────────┐     WebSocket      ┌──────────────┐     Agent SDK     ┌───────────┐
│  Browser     │ ◄──────────────► │  Bridge       │ ◄──────────────► │  Claude   │
│  (React hook)│   init/chat/done  │  (Bun server) │   query/stream   │  API      │
└─────────────┘                    └──────────────┘                   └───────────┘
```

1. User starts the bridge CLI locally
2. Browser opens with a one-time token in the URL hash
3. React hook connects via WebSocket and sends an `init` message with tool definitions
4. User chats — the bridge streams responses back in real-time

## Quick start

### Install

```bash
bun add local-agent-bridge
```

### Start the bridge

```bash
# Uses your existing Claude Code OAuth session — no API key needed
bunx local-agent-bridge --port=3002 --open=http://localhost:5173 --verbose
```

This generates a token, opens your app with `#agent=<token>`, and starts the WebSocket server.

### Use the React hook

```tsx
import { useLocalAgent, type ToolDefinition } from 'local-agent-bridge'

const tools: ToolDefinition[] = [
  {
    name: 'get_user',
    description: 'Get user by ID',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' }
      },
      required: ['userId']
    },
    handler: {
      type: 'http',
      url: 'https://api.example.com/users/{userId}',
      method: 'GET',
      authHeader: 'Authorization',
      authKey: 'apiToken'
    }
  }
]

function Chat() {
  const {
    status,
    messages,
    streamParts,
    sendMessage,
    isStreaming,
    abort,
    clearHistory,
  } = useLocalAgent({
    tools,
    systemPrompt: 'You are a helpful assistant.',
    getAuth: async () => ({ apiToken: 'Bearer ...' }),
  })

  return (
    <div>
      <p>Status: {status}</p>
      {messages.map((msg, i) => (
        <div key={i}>{msg.role === 'user' ? msg.content : msg.parts.map(p => p.type === 'text' ? p.content : `[${p.name}]`).join('')}</div>
      ))}
      {isStreaming && <div>Streaming...</div>}
      <input onKeyDown={e => {
        if (e.key === 'Enter') {
          sendMessage(e.currentTarget.value)
          e.currentTarget.value = ''
        }
      }} />
    </div>
  )
}
```

## Tool handlers

Tools are defined in the browser and sent to the bridge in the `init` message. Each tool has a `handler` that tells the bridge how to execute it:

### Static

Returns a fixed value. Useful for configuration or mock data.

```ts
{ type: 'static', value: { version: '1.0', features: ['a', 'b'] } }
```

### HTTP

Calls an external API. Supports URL template substitution, auth headers, query params.

```ts
{
  type: 'http',
  url: 'https://api.example.com/items/{itemId}',
  method: 'GET',
  authHeader: 'Authorization',
  authKey: 'bearerToken',
}
```

### Convex

Calls a Convex function by string path. Requires `convexUrl` and optionally `convexToken` in the auth record.

```ts
{
  type: 'convex',
  functionPath: 'api.users.getUser',
  staticArgs: { orgId: '123' },
}
```

## WebSocket protocol

### Client → Bridge

| Message | Description |
|---------|-------------|
| `init` | Send tool definitions, system prompt, and auth tokens |
| `chat` | Send a user message (optionally specify model/thinking level) |
| `refresh_auth` | Update auth tokens (called automatically every 45s) |
| `abort` | Cancel the current streaming response |

### Bridge → Client

| Event | Description |
|-------|-------------|
| `ready` | Bridge initialized, ready for chat |
| `text` | Streaming text delta |
| `tool_use` | Agent is calling a tool |
| `tool_result` | Tool execution result |
| `done` | Response complete |
| `error` | Error with code and message |

## CLI options

```
--port=<number>   Port to listen on (default: 3002)
--open=<url>      Open URL in browser with token in hash fragment
--verbose         Enable verbose logging
--help            Show help
```

## Auth flow

1. CLI generates a random 32-byte token on startup
2. Token is passed to the browser via URL hash (`#agent=<token>`) — never sent to your server
3. Hook stores token in `sessionStorage` for reconnects
4. WebSocket connection includes token as query param (localhost only)
5. `getAuth()` callback provides app-specific tokens, refreshed every 45s

## Models & thinking

The `sendMessage` function accepts optional `model` and `thinking` parameters:

```ts
sendMessage('Analyze this data', 'claude-opus-4-6', 'high')
```

**Models:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`

**Thinking levels:** `off`, `adaptive` (default), `high`, `max`

## Requirements

- [Bun](https://bun.sh) runtime
- [Claude Code](https://claude.ai/claude-code) installed and logged in (the bridge reuses its OAuth session)
- React 18+ (for the hook)

## License

MIT
