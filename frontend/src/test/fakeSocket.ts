import { vi } from 'vitest'

/**
 * Controllable `WebSocket` stand-in for jsdom, which ships a real implementation
 * that cannot be driven from tests. Install it on `globalThis` before mounting
 * components that open sockets and drive each instance via the helpers.
 */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  static last(): FakeWebSocket {
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
    if (!socket) throw new Error('No FakeWebSocket has been created yet')
    return socket
  }

  static reset(): void {
    FakeWebSocket.instances = []
  }

  readonly url: string
  readyState = 0
  sent: string[] = []

  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchClose(code, reason)
  }

  /** Simulates the server accepting the connection. */
  open(): void {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }

  /** Simulates a server frame; `payload` is serialised as JSON. */
  receive(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }

  /** Simulates the server dropping the connection with a close code. */
  serverClose(code = 1006, reason = ''): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.dispatchClose(code, reason)
  }

  sentJson(): unknown[] {
    return this.sent.map((frame) => JSON.parse(frame) as unknown)
  }

  private dispatchClose(code: number, reason: string): void {
    this.onclose?.({ code, reason } as CloseEvent)
  }
}

export function installFakeWebSocket(): void {
  FakeWebSocket.reset()
  vi.stubGlobal('WebSocket', FakeWebSocket)
}

export function uninstallFakeWebSocket(): void {
  vi.unstubAllGlobals()
  FakeWebSocket.reset()
}
