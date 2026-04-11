export interface WebSocketOptions {
  onOpen?: () => void
  onMessage?: (message: unknown) => void
}

export interface WebSocketClient {
  send: (message: unknown) => void
  close: () => void
  readyState: () => 'connecting' | 'open' | 'closed'
}

function inferWebSocketUrl(): string {
  const { protocol, host } = window.location
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:'

  return `${wsProtocol}//${host}/ws`
}

export function createWebSocketClient(options: WebSocketOptions): WebSocketClient {
  const socket = new WebSocket(inferWebSocketUrl())

  socket.addEventListener('open', () => {
    options.onOpen?.()
  })

  socket.addEventListener('message', (event) => {
    try {
      options.onMessage?.(JSON.parse(event.data as string))
    } catch {
      // ignore malformed frames
    }
  })

  return {
    send(message) {
      socket.send(JSON.stringify(message))
    },
    close() {
      socket.close()
    },
    readyState() {
      if (socket.readyState === WebSocket.OPEN) {
        return 'open'
      }

      if (socket.readyState === WebSocket.CONNECTING) {
        return 'connecting'
      }

      return 'closed'
    }
  }
}
