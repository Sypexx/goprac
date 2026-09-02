import type { QueuedValue } from './types'

const QUEUE_KEY = 'offline_queue'

// ---------- Оффлайн-очередь (localStorage) ----------

export function loadQueue(): QueuedValue[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveQueue(q: QueuedValue[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

// ---------- Генерация UUID ----------

export function genUUID(): string {
  // crypto.randomUUID доступен только в secure-контексте (HTTPS/localhost),
  // поэтому для работы по сети используем fallback
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 version 4 через crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  // Последний fallback для совсем старых браузеров
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
