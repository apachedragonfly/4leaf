export interface Board {
  board: string
  title: string
  ws_board?: number
  meta_description?: string
  pages?: number
}

export interface BoardsResponse {
  boards: Board[]
}

export interface Post {
  no: number
  resto: number
  now: string
  time: number
  name?: string
  trip?: string
  id?: string
  sub?: string
  com?: string
  tim?: number
  filename?: string
  ext?: string
  fsize?: number
  w?: number
  h?: number
  tn_w?: number
  tn_h?: number
  replies?: number
  images?: number
  last_modified?: number
  last_replies?: Post[]
  omitted_posts?: number
  bumplimit?: number
  imagelimit?: number
  sticky?: number
  closed?: number
}

export interface CatalogPage {
  page: number
  threads: Post[]
}

export interface ThreadResponse {
  posts: Post[]
}

export interface Route {
  board: string | null
  thread: number | null
}
