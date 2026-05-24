import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

type StorageRecord = Record<string, string>

function createStorageMock() {
  let store: StorageRecord = {}

  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key: string, value: string) {
      store[key] = String(value)
    },
    removeItem(key: string) {
      delete store[key]
    },
    clear() {
      store = {}
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null
    },
    get length() {
      return Object.keys(store).length
    },
  } satisfies Storage
}

const localStorageMock = createStorageMock()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => 'test-random-id',
  })
}

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  fill: vi.fn(),
  lineTo: vi.fn(),
  moveTo: vi.fn(),
  stroke: vi.fn(),
  shadowBlur: 0,
  shadowColor: '',
  fillStyle: '',
  lineWidth: 0,
  strokeStyle: '',
})) as typeof HTMLCanvasElement.prototype.getContext

Element.prototype.scrollTo = vi.fn()

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  arc: vi.fn(),
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  fill: vi.fn(),
  fillStyle: '',
  lineTo: vi.fn(),
  lineWidth: 0,
  moveTo: vi.fn(),
  shadowBlur: 0,
  shadowColor: '',
  stroke: vi.fn(),
  strokeStyle: '',
}))
