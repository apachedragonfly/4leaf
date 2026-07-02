import type { Board, BoardsResponse, CatalogPage, Post, ThreadResponse } from './types'

const API = `${import.meta.env.BASE_URL}api/4chan`
const MEDIA = 'https://i.4cdn.org'

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}${path}`, { signal })
  if (!response.ok) throw new Error(response.status === 404 ? 'This thread has expired.' : `4chan returned ${response.status}.`)
  return response.json() as Promise<T>
}

export async function getBoards(signal?: AbortSignal): Promise<Board[]> {
  const data = await getJson<BoardsResponse>('/boards.json', signal)
  return data.boards
}

export async function getCatalog(board: string, signal?: AbortSignal): Promise<Post[]> {
  const pages = await getJson<CatalogPage[]>(`/${board}/catalog.json`, signal)
  return pages.flatMap((page) => page.threads)
}

export async function getThread(board: string, thread: number, signal?: AbortSignal): Promise<Post[]> {
  const data = await getJson<ThreadResponse>(`/${board}/thread/${thread}.json`, signal)
  return data.posts
}

export const thumbnailUrl = (board: string, post: Post) => post.tim ? `${MEDIA}/${board}/${post.tim}s.jpg` : null
export const mediaUrl = (board: string, post: Post) => post.tim && post.ext ? `${MEDIA}/${board}/${post.tim}${post.ext}` : null
export const officialThreadUrl = (board: string, thread: number) => `https://boards.4chan.org/${board}/thread/${thread}`
export const officialBoardUrl = (board: string) => `https://boards.4chan.org/${board}/`
