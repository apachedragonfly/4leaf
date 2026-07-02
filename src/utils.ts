import type { Route } from './types'

export function parseRoute(): Route {
  const match = location.hash.match(/^#\/([^/]+)(?:\/thread\/(\d+))?/)
  return { board: match?.[1] ?? null, thread: match?.[2] ? Number(match[2]) : null }
}

export function navigate(board?: string, thread?: number) {
  location.hash = board ? `#/${board}${thread ? `/thread/${thread}` : ''}` : '#/'
}

export function htmlToText(html?: string): string {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html.replaceAll('<br>', '\n'), 'text/html')
  return doc.body.textContent?.trim() ?? ''
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

export function useStoredState<T>(key: string, initial: T): [T, (value: T | ((old: T) => T)) => void] {
  const React = requireReact()
  const [value, setValue] = React.useState<T>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? '') as T } catch { return initial }
  })
  const update = (next: T | ((old: T) => T)) => setValue((old: T) => {
    const resolved = typeof next === 'function' ? (next as (old: T) => T)(old) : next
    localStorage.setItem(key, JSON.stringify(resolved))
    return resolved
  })
  return [value, update]
}

// Kept local to avoid a second hooks module while retaining generic inference.
import * as ReactNamespace from 'react'
function requireReact() { return ReactNamespace }
