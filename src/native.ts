import { Capacitor, CapacitorCookies } from '@capacitor/core'

export const isNativeApp = Capacitor.isNativePlatform()

export interface NativePostInput {
  board: string
  thread: number
  comment: string
  name?: string
  options?: string
  password?: string
  file?: File | null
  spoiler?: boolean
}

export interface NativePostResult {
  post?: number
  thread?: number
  error?: string
}

export async function authorizePass(token: string, pin: string): Promise<{ ok: boolean; message: string }> {
  if (!isNativeApp) return { ok: false, message: 'Pass authorization is only available in the native app.' }

  const body = new URLSearchParams({ id: token.trim(), pin: pin.trim(), long_login: '1' })
  const response = await fetch('https://sys.4chan.org/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    credentials: 'include',
  })
  const text = await response.text()
  const cookies = await CapacitorCookies.getCookies({ url: 'https://sys.4chan.org' })
  const authorized = Boolean(cookies.pass_enabled || cookies.pass_id)

  if (authorized) return { ok: true, message: '4chan Pass authorized on this device.' }
  return { ok: false, message: extractError(text) || '4chan did not authorize these Pass credentials.' }
}

export async function hasAuthorizedPass(): Promise<boolean> {
  if (!isNativeApp) return false
  const cookies = await CapacitorCookies.getCookies({ url: 'https://sys.4chan.org' })
  return Boolean(cookies.pass_enabled || cookies.pass_id)
}

export async function clearPass(): Promise<void> {
  if (!isNativeApp) return
  await CapacitorCookies.clearCookies({ url: 'https://sys.4chan.org' })
}

export async function submitNativeReply(input: NativePostInput): Promise<NativePostResult> {
  if (!isNativeApp) return { error: 'Native posting is unavailable in the web app.' }

  const form = new FormData()
  form.append('mode', 'regist')
  form.append('resto', String(input.thread))
  form.append('name', input.name ?? '')
  form.append('email', input.options ?? '')
  form.append('com', input.comment)
  form.append('pwd', input.password || getPostPassword())
  if (input.spoiler) form.append('spoiler', 'on')
  if (input.file) form.append('upfile', input.file, input.file.name)

  const response = await fetch(`https://sys.4chan.org/${input.board}/post`, {
    method: 'POST',
    headers: { Referer: `https://boards.4chan.org/${input.board}/thread/${input.thread}` },
    body: form,
    credentials: 'include',
  })
  const text = await response.text()
  const success = text.match(/thread:(\d+),no:(\d+)/)
  if (success) return { thread: Number(success[1]), post: Number(success[2]) }

  return { error: extractError(text) || `4chan rejected the reply (${response.status}).` }
}

function getPostPassword(): string {
  const key = '4leaf.postPassword'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const value = crypto.getRandomValues(new Uint32Array(2)).join('').slice(0, 12)
  localStorage.setItem(key, value)
  return value
}

function extractError(html: string): string | null {
  const match = html.match(/id=["']errmsg["'][^>]*>([\s\S]*?)<\//i)
    ?? html.match(/class=["'][^"']*error[^"']*["'][^>]*>([\s\S]*?)<\//i)
  if (!match) return null
  return new DOMParser().parseFromString(match[1], 'text/html').body.textContent?.trim() || null
}
