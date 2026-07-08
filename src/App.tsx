import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowUpDown, Bookmark, Check, ChevronLeft, ChevronRight, Copy, ExternalLink,
  House, Image as ImageIcon, Images, Menu, MessageCircle, Radio, RefreshCw,
  Palette as PaletteIcon, RotateCcw, Search, Send, Settings, Share, ShieldCheck, X,
} from 'lucide-react'
import { getBoards, getCatalog, getThread, mediaUrl, officialBoardUrl, officialThreadUrl, thumbnailUrl } from './api'
import { authorizePass, clearPass, hasAuthorizedPass, isNativeApp, submitNativeReply } from './native'
import type { Board, Post, Route } from './types'
import { formatBytes, htmlToText, navigate, parseRoute, timeAgo, useStoredState } from './utils'

type ThemeId = 'leaf' | 'yotsuba-b' | 'tomorrow' | 'photon' | 'custom'
type StoredTheme = ThemeId | 'light' | 'dark'
type Palette = {
  bg: string
  surface: string
  ink: string
  muted: string
  accent: string
  sidebar: string
  sidebarInk: string
  danger: string
}

type CatalogSort = 'bump' | 'creation' | 'files' | 'last-long' | 'last-reply' | 'ppm' | 'replies'
type CatalogSize = 'small' | 'medium' | 'large'
type FilterKind = 'keyword' | 'poster' | 'filename' | 'filetype'
interface ContentFilter { id: string; kind: FilterKind; value: string; board?: string; enabled: boolean }

const CATALOG_SORTS: { value: CatalogSort; label: string }[] = [
  { value: 'bump', label: 'Bump order' },
  { value: 'creation', label: 'Creation date' },
  { value: 'files', label: 'File count' },
  { value: 'last-long', label: 'Last long reply' },
  { value: 'last-reply', label: 'Last reply' },
  { value: 'ppm', label: 'Posts per minute' },
  { value: 'replies', label: 'Reply count' },
]

const THEME_PRESETS: Record<Exclude<ThemeId, 'custom'>, { name: string; description: string; palette: Palette }> = {
  leaf: { name: 'Leaf', description: 'Warm and quiet', palette: { bg: '#f7f3e8', surface: '#fffdf7', ink: '#1d231f', muted: '#6e756e', accent: '#26734d', sidebar: '#194e35', sidebarInk: '#ecf5ed', danger: '#a23b32' } },
  'yotsuba-b': { name: 'Yotsuba B', description: 'Cool imageboard classic', palette: { bg: '#eef2ff', surface: '#d6daf0', ink: '#000000', muted: '#5a5a78', accent: '#34345c', sidebar: '#d6daf0', sidebarInk: '#34345c', danger: '#af0a0f' } },
  tomorrow: { name: 'Tomorrow', description: 'Low-glare dark', palette: { bg: '#1d1f21', surface: '#282a2e', ink: '#c5c8c6', muted: '#969896', accent: '#81a2be', sidebar: '#161719', sidebarInk: '#c5c8c6', danger: '#cc6666' } },
  photon: { name: 'Photon', description: 'Crisp and neutral', palette: { bg: '#eeeeee', surface: '#ffffff', ink: '#333333', muted: '#767676', accent: '#1d8dc4', sidebar: '#2d2d2d', sidebarInk: '#eeeeee', danger: '#b42318' } },
}

const DEFAULT_CUSTOM_PALETTE = { ...THEME_PRESETS.leaf.palette }
const normalizeTheme = (theme: StoredTheme): ThemeId => theme === 'light' ? 'leaf' : theme === 'dark' ? 'tomorrow' : theme

export default function App() {
  const [accepted, setAccepted] = useStoredState('4leaf.accepted', false)
  const [storedTheme, setTheme] = useStoredState<StoredTheme>('4leaf.theme', 'leaf')
  const [customPalette, setCustomPalette] = useStoredState<Palette>('4leaf.customPalette', DEFAULT_CUSTOM_PALETTE)
  const theme = normalizeTheme(storedTheme)
  const [favorites, setFavorites] = useStoredState<string[]>('4leaf.favorites', ['g', 'v', 'wg'])
  const [saved, setSaved] = useStoredState<Record<string, SavedThread>>('4leaf.saved', {})
  const [threadProgress, setThreadProgress] = useStoredState<Record<string, ThreadProgress>>('4leaf.threadProgress', {})
  const [contentFilters, setContentFilters] = useStoredState<ContentFilter[]>('4leaf.contentFilters', [])
  const [route, setRoute] = useState<Route>(parseRoute)
  const [boards, setBoards] = useState<Board[]>([])
  const [boardsLoading, setBoardsLoading] = useState(true)
  const [boardsError, setBoardsError] = useState('')
  const [boardsRetry, setBoardsRetry] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const palette = theme === 'custom' ? customPalette : THEME_PRESETS[theme].palette
    const root = document.documentElement
    Object.entries(palette).forEach(([key, value]) => root.style.setProperty(`--theme-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value))
    root.style.colorScheme = isDarkColor(palette.bg) ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.bg)
  }, [theme, customPalette])
  useEffect(() => {
    const onHash = () => { setRoute(parseRoute()); setMenuOpen(false); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', onHash)
    if (!location.hash) navigate()
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    if (!accepted) return
    const controller = new AbortController()
    setBoardsLoading(true)
    setBoardsError('')
    getBoards(controller.signal)
      .then(setBoards)
      .catch((error: Error) => { if (!controller.signal.aborted) setBoardsError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setBoardsLoading(false) })
    return () => controller.abort()
  }, [accepted, boardsRetry])

  if (!accepted) return <Welcome onAccept={() => setAccepted(true)} />

  const activeBoard = boards.find((item) => item.board === route.board)
  const toggleFavorite = (board: string) => setFavorites((old) => old.includes(board) ? old.filter((b) => b !== board) : [...old, board])
  const toggleSaved = (entry: SavedThread) => setSaved((old) => {
    const key = `${entry.board}/${entry.no}`
    if (old[key]) { const next = { ...old }; delete next[key]; return next }
    return { ...old, [key]: entry }
  })

  return (
    <div className="app-shell">
      <Sidebar boards={boards} favorites={favorites} saved={saved} threadProgress={threadProgress} route={route} open={menuOpen} apiStatus={boardsError ? 'error' : boardsLoading ? 'loading' : 'connected'} onClose={() => setMenuOpen(false)} />
      <div className="page-shell">
        <Header route={route} activeBoard={activeBoard} savedCount={Object.keys(saved).length} onMenu={() => setMenuOpen(true)} onSettings={() => setSettingsOpen(true)} />
        <main>
          {!route.board && <Home boards={boards} boardsLoading={boardsLoading} boardsError={boardsError} onRetry={() => setBoardsRetry((value) => value + 1)} favorites={favorites} saved={saved} threadProgress={threadProgress} onToggleFavorite={toggleFavorite} />}
          {route.board && !route.thread && <Catalog board={route.board} info={activeBoard} favorite={favorites.includes(route.board)} filters={contentFilters} onToggleFavorite={() => toggleFavorite(route.board!)} />}
          {route.board && route.thread && <Thread key={`${route.board}/${route.thread}`} board={route.board} thread={route.thread} saved={Boolean(saved[`${route.board}/${route.thread}`])} filters={contentFilters} progress={threadProgress[`${route.board}/${route.thread}`]} onProgress={(next) => setThreadProgress((old) => ({ ...old, [`${route.board}/${route.thread}`]: next }))} onToggleSaved={toggleSaved} />}
        </main>
      </div>
      {settingsOpen && <SettingsSheet theme={theme} customPalette={customPalette} filters={contentFilters} onFilters={setContentFilters} onTheme={setTheme} onCustomPalette={setCustomPalette} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

interface SavedThread { board: string; no: number; title: string; savedAt: number }
interface ThreadProgress { lastReadPost: number; latestPost: number; unread: number; updatedAt: number }

function Welcome({ onAccept }: { onAccept: () => void }) {
  return <div className="welcome">
    <div className="brand-lockup"><Logo /><span>4leaf</span></div>
    <div className="welcome-card">
      <span className="eyebrow"><ShieldCheck size={15} /> Private by design</span>
      <h1>A quieter way to browse.</h1>
      <p>4leaf is an independent, installable reader for 4chan. Your boards, saved threads, and preferences stay on this device.</p>
      <div className="notice"><strong>Before you continue</strong><span>4chan contains user-generated content intended for adults. By continuing, you confirm you are at least 18 and agree to follow 4chan’s rules.</span></div>
      <button className="primary wide" onClick={onAccept}>I’m 18 or older <ChevronRight size={18} /></button>
      <a className="text-link" href="https://www.4chan.org/rules" target="_blank" rel="noreferrer">Read the official rules <ExternalLink size={13} /></a>
    </div>
    <p className="welcome-foot">Not affiliated with 4chan Community Support LLC.</p>
  </div>
}

function Header({ route, activeBoard, savedCount, onMenu, onSettings }: { route: Route; activeBoard?: Board; savedCount: number; onMenu: () => void; onSettings: () => void }) {
  const title = route.thread ? `Thread #${route.thread}` : activeBoard ? `/${activeBoard.board}/ — ${activeBoard.title}` : 'Today'
  return <header className="topbar">
    <div className="topbar-title">
      <button className="icon-button mobile-only" onClick={onMenu} aria-label="Open menu"><Menu /></button>
      {route.thread && <button className="icon-button" onClick={() => navigate(route.board!)} aria-label="Back to catalog"><ArrowLeft /></button>}
      <div><span className="topbar-kicker">{route.thread ? `/${route.board}/` : route.board ? 'Catalog' : 'Your leaf'}</span><h1>{title}</h1></div>
    </div>
    <div className="topbar-actions">
      {savedCount > 0 && <span className="saved-count"><Bookmark size={14} fill="currentColor" /> {savedCount}</span>}
      <button className="icon-button" onClick={onSettings} aria-label="Settings"><Settings /></button>
    </div>
  </header>
}

function Sidebar({ boards, favorites, saved, threadProgress, route, open, apiStatus, onClose }: { boards: Board[]; favorites: string[]; saved: Record<string, SavedThread>; threadProgress: Record<string, ThreadProgress>; route: Route; open: boolean; apiStatus: 'loading' | 'connected' | 'error'; onClose: () => void }) {
  const favoriteBoards = favorites.map((id) => boards.find((b) => b.board === id)).filter(Boolean) as Board[]
  return <>
    {open && <button className="scrim" onClick={onClose} aria-label="Close menu" />}
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-brand"><div className="brand-lockup"><Logo /><span>4leaf</span></div><button className="icon-button mobile-only" onClick={onClose} aria-label="Close menu"><X /></button></div>
      <nav>
        <NavItem icon={<House />} label="Home" active={!route.board} onClick={() => navigate()} />
        <div className="nav-section"><span>Favorite boards</span></div>
        {favoriteBoards.map((board) => <NavItem key={board.board} icon={<span className="board-glyph">/{board.board}/</span>} label={board.title} active={route.board === board.board} onClick={() => navigate(board.board)} />)}
        {!favoriteBoards.length && <p className="empty-nav">Star a board to keep it here.</p>}
        <div className="nav-section"><span>Saved threads</span><span>{Object.keys(saved).length}</span></div>
        {Object.values(saved).sort((a, b) => b.savedAt - a.savedAt).slice(0, 5).map((thread) =>
          <NavItem key={`${thread.board}/${thread.no}`} icon={<MessageCircle />} label={thread.title} sub={`/${thread.board}/ · #${thread.no}`} badge={threadProgress[`${thread.board}/${thread.no}`]?.unread} active={route.thread === thread.no && route.board === thread.board} onClick={() => navigate(thread.board, thread.no)} />
        )}
      </nav>
      <div className="sidebar-foot"><span className={`status-dot ${apiStatus}`} /> {apiStatus === 'error' ? 'API unavailable' : apiStatus === 'loading' ? 'Connecting to API' : 'Read-only API connected'}</div>
    </aside>
  </>
}

function NavItem({ icon, label, sub, badge, active, onClick }: { icon: React.ReactNode; label: string; sub?: string; badge?: number; active?: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span><span className="nav-copy"><strong>{label}</strong>{sub && <small>{sub}</small>}</span>{Boolean(badge) && <span className="unread-badge" aria-label={`${badge} unread posts`}>{badge! > 99 ? '99+' : badge}</span>}</button>
}

function Home({ boards, boardsLoading, boardsError, onRetry, favorites, saved, threadProgress, onToggleFavorite }: { boards: Board[]; boardsLoading: boolean; boardsError: string; onRetry: () => void; favorites: string[]; saved: Record<string, SavedThread>; threadProgress: Record<string, ThreadProgress>; onToggleFavorite: (board: string) => void }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const filtered = boards.filter((b) => `${b.board} ${b.title}`.toLowerCase().includes(query.toLowerCase()))
  const visible = query || showAll ? filtered : filtered.slice(0, 18)
  return <div className="content home-content">
    <div className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a board" aria-label="Find a board" />{query && <button onClick={() => setQuery('')} aria-label="Clear board search"><X size={17} /></button>}</div>
    {Object.keys(saved).length > 0 && <section className="section-block"><SectionHeading title="Saved threads" action="See in sidebar" /><div className="saved-grid">{Object.values(saved).sort((a, b) => b.savedAt - a.savedAt).slice(0, 3).map((item) => { const unread = threadProgress[`${item.board}/${item.no}`]?.unread; return <button className="saved-card" key={`${item.board}/${item.no}`} onClick={() => navigate(item.board, item.no)}><span>/{item.board}/</span><strong>{item.title}</strong><small>Thread #{item.no}</small>{Boolean(unread) && <em className="unread-badge">{unread! > 99 ? '99+' : unread} new</em>}<ChevronRight /></button> })}</div></section>}
    <section className="section-block">
      <SectionHeading title={query ? 'Search results' : 'All boards'} action={`${boards.length} boards`} />
      {boardsLoading ? <LoadingCards /> : boardsError ? <ErrorState message={boardsError} retry={onRetry} /> : <div className="board-grid">{visible.map((board) => <article className="board-card" key={board.board}><button className="board-card-link" onClick={() => navigate(board.board)}><div><span className="board-slug">/{board.board}/</span><strong>{board.title}</strong></div><p>{board.meta_description || 'View this board’s catalog and active threads.'}</p></button><button className={`star ${favorites.includes(board.board) ? 'selected' : ''}`} onClick={() => onToggleFavorite(board.board)} aria-label={`${favorites.includes(board.board) ? 'Remove' : 'Add'} /${board.board}/ ${favorites.includes(board.board) ? 'from' : 'to'} favorites`}><Bookmark size={17} fill={favorites.includes(board.board) ? 'currentColor' : 'none'} /></button></article>)}</div>}
      {!query && !showAll && boards.length > 18 && <button className="secondary centered" onClick={() => setShowAll(true)}>Show all boards</button>}
    </section>
  </div>
}

function Catalog({ board, info, favorite, filters, onToggleFavorite }: { board: string; info?: Board; favorite: boolean; filters: ContentFilter[]; onToggleFavorite: () => void }) {
  const [threads, setThreads] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useStoredState<CatalogSort>('4leaf.catalogSort', 'bump')
  const [catalogSize, setCatalogSize] = useStoredState<CatalogSize>('4leaf.catalogSize', 'medium')
  const [requestVersion, setRequestVersion] = useState(0)
  const load = () => setRequestVersion((value) => value + 1)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setThreads([]); setError('')
    getCatalog(board, controller.signal)
      .then(setThreads)
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [board, requestVersion])
  const visible = useMemo(() => sortCatalog(threads.filter((post) => htmlToText(`${post.sub ?? ''} ${post.com ?? ''}`).toLowerCase().includes(query.toLowerCase()) && !findMatchingFilter(post, board, filters)), sort), [threads, query, sort, board, filters])
  return <div className="content catalog-content">
    <section className="board-heading"><div><span className="board-slug large">/{board}/</span><h2>{info?.title ?? 'Board'}</h2><p>{info?.meta_description}</p></div><div className="heading-actions"><button className={`secondary ${favorite ? 'selected' : ''}`} onClick={onToggleFavorite}><Bookmark size={17} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Favorited' : 'Favorite'}</button><a className="primary" href={officialBoardUrl(board)} target="_blank" rel="noreferrer">Open official <ExternalLink size={16} /></a></div></section>
    <div className="catalog-tools">
      <div className="search-box compact"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter this catalog" aria-label="Filter this catalog" /></div>
      <label className="catalog-select"><ArrowUpDown /><span className="sr-only">Sort catalog</span><select value={sort} onChange={(event) => setSort(event.target.value as CatalogSort)} aria-label="Sort catalog">{CATALOG_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <div className="catalog-size" role="group" aria-label="Catalog size">{(['small', 'medium', 'large'] as CatalogSize[]).map((size) => <button key={size} className={catalogSize === size ? 'active' : ''} onClick={() => setCatalogSize(size)} aria-label={`${size} catalog cards`} aria-pressed={catalogSize === size} title={size}>{size[0].toUpperCase()}</button>)}</div>
      <button className="icon-button refresh" onClick={load} aria-label="Refresh"><RefreshCw size={18} /></button>
    </div>
    {loading ? <LoadingCatalog size={catalogSize} /> : error ? <ErrorState message={error} retry={load} /> : !visible.length ? <EmptySearch /> : <div className={`catalog-grid size-${catalogSize}`}>{visible.map((post) => <ThreadCard key={post.no} board={board} post={post} />)}</div>}
  </div>
}

function sortCatalog(threads: Post[], sort: CatalogSort) {
  if (sort === 'bump') return threads
  const now = Date.now() / 1000
  const value = (thread: Post) => {
    switch (sort) {
      case 'creation': return thread.time
      case 'files': return thread.images ?? 0
      case 'last-long': return lastLongReply(thread)
      case 'last-reply': return thread.last_replies?.at(-1)?.no ?? thread.no
      case 'ppm': return ((thread.replies ?? 0) + 1) / Math.max((now - thread.time) / 60, 1)
      case 'replies': return thread.replies ?? 0
      default: return 0
    }
  }
  const originalOrder = new Map(threads.map((thread, index) => [thread.no, index]))
  return [...threads].sort((a, b) => value(b) - value(a) || (originalOrder.get(a.no) ?? 0) - (originalOrder.get(b.no) ?? 0))
}

function lastLongReply(thread: Post) {
  const replies = thread.last_replies ?? []
  for (let index = replies.length - 1; index >= 0; index -= 1) {
    const reply = replies[index]
    const letterCount = htmlToText(reply.com).replace(/[^a-z]/gi, '').length
    if (letterCount >= 100) return reply.no
  }
  return thread.omitted_posts && replies[0] ? replies[0].no : thread.no
}

const FILTER_KIND_LABELS: Record<FilterKind, string> = { keyword: 'Text', poster: 'Poster', filename: 'Filename', filetype: 'File type' }
function findMatchingFilter(post: Post, board: string, filters: ContentFilter[]) {
  return filters.find((filter) => {
    if (!filter.enabled || (filter.board && filter.board !== board)) return false
    const needle = filter.value.trim().toLowerCase()
    if (!needle) return false
    if (filter.kind === 'keyword') return htmlToText(`${post.sub ?? ''} ${post.com ?? ''}`).toLowerCase().includes(needle)
    if (filter.kind === 'poster') return `${post.name ?? ''} ${post.trip ?? ''} ${post.id ?? ''}`.toLowerCase().includes(needle)
    if (filter.kind === 'filename') return `${post.filename ?? ''}${post.ext ?? ''}`.toLowerCase().includes(needle)
    return (post.ext ?? '').replace(/^\./, '').toLowerCase() === needle.replace(/^\./, '')
  })
}

function ThreadCard({ board, post }: { board: string; post: Post }) {
  const thumb = thumbnailUrl(board, post)
  return <button className="thread-card" onClick={() => navigate(board, post.no)} aria-label={`Open ${htmlToText(post.sub) || `thread ${post.no}`}`}>
    <div className="thread-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon />}{isVideo(post.ext) && <span className="media-badge">{post.ext?.slice(1).toUpperCase()}</span>}{post.sticky === 1 && <span className="sticky-badge">Pinned</span>}</div>
    <div className="thread-card-body"><div className="thread-meta"><span>{timeAgo(post.time)} ago</span><span><MessageCircle size={13} /> {post.replies ?? 0}</span><span><ImageIcon size={13} /> {post.images ?? 0}</span></div><h3>{htmlToText(post.sub) || `Thread #${post.no}`}</h3><p>{htmlToText(post.com) || 'No comment.'}</p></div>
  </button>
}

function Thread({ board, thread, saved, filters, progress, onProgress, onToggleSaved }: { board: string; thread: number; saved: boolean; filters: ContentFilter[]; progress?: ThreadProgress; onProgress: (progress: ThreadProgress) => void; onToggleSaved: (item: SavedThread) => void }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [newBoundary, setNewBoundary] = useState<number | null>(null)
  const [live, setLive] = useStoredState('4leaf.liveThreads', true)
  const [error, setError] = useState('')
  const [mediaIndex, setMediaIndex] = useState<number | null>(null)
  const [mediaOverride, setMediaOverride] = useState<Post | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [postPreview, setPostPreview] = useState<{ post: Post; left: number; top: number } | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyQuote, setReplyQuote] = useState<number | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const updateController = useRef<AbortController | null>(null)
  const updateInFlight = useRef(false)
  const postsRef = useRef<Post[]>([])
  const progressRef = useRef(progress)
  const refreshRef = useRef<() => void>(() => {})
  const initialLastRead = useRef(progress?.lastReadPost ?? 0)
  usePullDownToBoard(board, galleryOpen || mediaIndex !== null || replyOpen || postPreview !== null)
  const load = () => setRequestVersion((value) => value + 1)
  useEffect(() => { postsRef.current = posts }, [posts])
  useEffect(() => { progressRef.current = progress }, [progress])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setUpdating(false); setPosts([]); setError(''); setUpdateStatus(''); setNewBoundary(null)
    getThread(board, thread, controller.signal)
      .then((next) => {
        const lastReadPost = initialLastRead.current || next[0]?.no || 0
        const firstUnread = initialLastRead.current ? next.find((post) => post.no > initialLastRead.current)?.no ?? null : null
        const nextProgress = {
          lastReadPost,
          latestPost: next.at(-1)?.no ?? lastReadPost,
          unread: next.filter((post) => post.no > lastReadPost).length,
          updatedAt: Date.now(),
        }
        postsRef.current = next
        progressRef.current = nextProgress
        setPosts(next)
        setNewBoundary(firstUnread)
        onProgress(nextProgress)
        if (initialLastRead.current) requestAnimationFrame(() => {
          document.getElementById(firstUnread ? 'new-posts' : `p${lastReadPost}`)?.scrollIntoView({ block: firstUnread ? 'center' : 'start' })
        })
      })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [board, thread, requestVersion]) // onProgress changes after each write; this request only follows route/retry changes.
  useEffect(() => () => updateController.current?.abort(), [board, thread])
  const loadNewer = () => {
    if (loading || updateInFlight.current) return
    updateController.current?.abort()
    const controller = new AbortController()
    updateController.current = controller
    updateInFlight.current = true
    setUpdating(true); setUpdateStatus('')
    const existing = new Set(postsRef.current.map((post) => post.no))
    getThread(board, thread, controller.signal).then((next) => {
      const addedPosts = next.filter((post) => !existing.has(post.no))
      const currentProgress = progressRef.current
      const lastReadPost = currentProgress?.lastReadPost ?? next[0]?.no ?? 0
      const nextProgress = {
        lastReadPost,
        latestPost: next.at(-1)?.no ?? currentProgress?.latestPost ?? 0,
        unread: next.filter((post) => post.no > lastReadPost).length,
        updatedAt: Date.now(),
      }
      postsRef.current = next
      progressRef.current = nextProgress
      setPosts(next)
      onProgress(nextProgress)
      if (addedPosts.length) setNewBoundary((current) => current ?? addedPosts[0].no)
      setUpdateStatus(addedPosts.length ? `${addedPosts.length} new post${addedPosts.length === 1 ? '' : 's'} available.` : 'Checked just now · no new posts')
    }).catch((error: Error) => { if (!controller.signal.aborted) setUpdateStatus(error.message) }).finally(() => {
      if (updateController.current === controller) {
        updateInFlight.current = false
        if (!controller.signal.aborted) setUpdating(false)
      }
    })
  }
  refreshRef.current = loadNewer
  useEffect(() => {
    if (!live || loading || error) return
    const check = () => { if (document.visibilityState === 'visible') refreshRef.current() }
    const interval = window.setInterval(check, 30_000)
    const onVisibility = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility) }
  }, [live, loading, error, board, thread])
  useEffect(() => {
    if (!posts.length) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).map((entry) => Number((entry.target as HTMLElement).dataset.postNo)).filter(Number.isFinite)
      if (!visible.length) return
      const lastReadPost = Math.max(progressRef.current?.lastReadPost ?? 0, ...visible)
      if (lastReadPost === progressRef.current?.lastReadPost) return
      const nextProgress = {
        lastReadPost,
        latestPost: postsRef.current.at(-1)?.no ?? lastReadPost,
        unread: postsRef.current.filter((post) => post.no > lastReadPost).length,
        updatedAt: Date.now(),
      }
      progressRef.current = nextProgress
      onProgress(nextProgress)
    }, { rootMargin: '0px 0px -55% 0px', threshold: 0 })
    document.querySelectorAll<HTMLElement>('.post[data-post-no]').forEach((post) => observer.observe(post))
    return () => observer.disconnect()
  }, [posts])
  const op = posts[0]
  const media = posts.filter((post) => post.tim && post.ext && !findMatchingFilter(post, board, filters))
  const viewerMedia = mediaOverride ? [mediaOverride] : media
  const backlinks = useMemo(() => {
    const knownPosts = new Set(posts.map((post) => post.no))
    const links = new Map<number, number[]>()
    posts.forEach((source) => {
      const targets = new Set(Array.from(htmlToText(source.com).matchAll(/>>(\d+)/g), (match) => Number(match[1])))
      targets.forEach((target) => {
        if (!knownPosts.has(target) || target === source.no) return
        links.set(target, [...(links.get(target) ?? []), source.no])
      })
    })
    return links
  }, [posts])
  const title = htmlToText(op?.sub) || htmlToText(op?.com).slice(0, 60) || `Thread #${thread}`
  const boundaryCount = newBoundary ? posts.filter((post) => post.no >= newBoundary).length : 0
  const openReply = (quote?: number) => { setReplyQuote(quote ?? null); setReplyOpen(true) }
  const openPostPreview = (postNumber: number, anchor: HTMLElement) => {
    const referencedPost = posts.find((item) => item.no === postNumber)
    if (!referencedPost) return
    const rect = anchor.getBoundingClientRect()
    const width = Math.min(420, window.innerWidth - 24)
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
    const estimatedHeight = Math.min(360, window.innerHeight - 24)
    const top = rect.bottom + 8 + estimatedHeight <= window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - estimatedHeight - 8)
    setPostPreview({ post: referencedPost, left, top })
  }
  const closeMedia = () => {
    const postNumber = mediaIndex === null ? null : viewerMedia[mediaIndex]?.no
    setMediaIndex(null)
    setMediaOverride(null)
    if (postNumber) requestAnimationFrame(() => scrollToPost(postNumber))
  }
  return <div className="content thread-content">
    <div className="thread-toolbar"><div><span>{posts.length ? `${posts.length} posts` : 'Thread'}</span>{op?.closed === 1 && <span className="closed-pill">Closed</span>}</div><div><button className={`secondary live-toggle ${live ? 'selected' : ''}`} onClick={() => setLive((value) => !value)} aria-pressed={live}><Radio size={15} /> {live ? 'Live' : 'Paused'}</button><button className="secondary gallery-button" disabled={!media.length} onClick={() => setGalleryOpen(true)}><Images size={17} /> Gallery <span>{media.length}</span></button><button className={`icon-button ${saved ? 'selected' : ''}`} disabled={!op} onClick={() => onToggleSaved({ board, no: thread, title, savedAt: Date.now() })} aria-label="Save thread"><Bookmark fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" disabled={loading || updating} onClick={loadNewer} aria-label="Load newer posts"><RefreshCw className={updating ? 'spinning' : ''} /></button><button className="primary" disabled={op?.closed === 1} onClick={() => openReply()}>Reply <MessageCircle size={15} /></button></div></div>
    {loading ? <ThreadSkeleton /> : error ? <ErrorState message={error} retry={load} /> : <><div className="posts">{posts.map((post, index) => { const filter = findMatchingFilter(post, board, filters); return <Fragment key={post.no}>{post.no === newBoundary && <div className="new-posts-divider" id="new-posts"><span>{boundaryCount} new post{boundaryCount === 1 ? '' : 's'}</span></div>}<PostView board={board} post={post} op={index === 0} opNumber={op?.no ?? thread} filter={filter} backlinks={backlinks.get(post.no) ?? []} onMedia={() => { const mediaPosition = media.findIndex((item) => item.no === post.no); if (mediaPosition >= 0) { setMediaOverride(null); setMediaIndex(mediaPosition) } else if (post.tim && post.ext) { setMediaOverride(post); setMediaIndex(0) } }} onReply={() => openReply(post.no)} onPostLink={openPostPreview} /></Fragment> })}</div><div className="thread-updater" aria-live="polite"><span>{updateStatus || (live ? 'Live · checks every 30s' : 'Live updates paused')}</span><button className="secondary" disabled={updating} onClick={loadNewer}><RefreshCw className={updating ? 'spinning' : ''} /> {updating ? 'Checking…' : 'Check now'}</button></div></>}
    {postPreview && <PostPreview board={board} preview={postPreview} opNumber={op?.no ?? thread} filter={findMatchingFilter(postPreview.post, board, filters)} onClose={() => setPostPreview(null)} onOpen={() => { const postNumber = postPreview.post.no; setPostPreview(null); requestAnimationFrame(() => scrollToPost(postNumber)) }} />}
    {galleryOpen && <MediaGallery board={board} posts={media} onClose={() => setGalleryOpen(false)} onSelect={(index) => { setGalleryOpen(false); setMediaOverride(null); setMediaIndex(index) }} />}
    {mediaIndex !== null && <MediaViewer board={board} posts={viewerMedia} index={mediaIndex} onIndex={setMediaIndex} onClose={closeMedia} />}
    {replyOpen && <ReplyComposer key={`${board}/${thread}/${replyQuote ?? 'thread'}`} board={board} thread={thread} quote={replyQuote} onClose={() => setReplyOpen(false)} onPosted={() => { setReplyOpen(false); setTimeout(loadNewer, 1200) }} />}
  </div>
}

function PostView({ board, post, op, opNumber, filter, backlinks, onMedia, onReply, onPostLink }: { board: string; post: Post; op: boolean; opNumber: number; filter?: ContentFilter; backlinks: number[]; onMedia: () => void; onReply: () => void; onPostLink: (post: number, anchor: HTMLElement) => void }) {
  const thumb = thumbnailUrl(board, post)
  const text = htmlToText(post.com)
  const [revealed, setRevealed] = useState(false)
  if (filter && !revealed) return <article className="post filtered-post" id={`p${post.no}`} data-post-no={post.no}>
    <div><strong>Post No.{post.no} filtered</strong><span>{FILTER_KIND_LABELS[filter.kind]} matches “{filter.value}”{filter.board && ` on /${filter.board}/`}</span></div>
    <button className="secondary" onClick={() => setRevealed(true)}>Show post</button>
  </article>
  return <article className={`post ${op ? 'op' : ''}`} id={`p${post.no}`} data-post-no={post.no}>
    <div className="post-head"><div><span className="avatar">{(post.name || 'A')[0]}</span><div><strong>{post.name || 'Anonymous'}{post.trip && <small> {post.trip}</small>}</strong><span>{post.now} · No.{post.no}</span></div></div><button className="post-reply-button" onClick={onReply}><MessageCircle /> Reply</button></div>
    {post.sub && <h3 className="post-subject">{htmlToText(post.sub)}</h3>}
    <div className={`post-content ${thumb ? 'has-media' : ''}`}>
      {thumb && <button className="post-media" onClick={onMedia} aria-label={`Open ${post.filename || 'attached media'}`}><img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>{post.ext?.slice(1).toUpperCase()} · {formatBytes(post.fsize)}{post.w && ` · ${post.w}×${post.h}`}</span>{isVideo(post.ext) && <span className="play">▶</span>}</button>}
      <Comment text={text} opNumber={opNumber} onPostLink={onPostLink} />
    </div>
    {backlinks.length > 0 && <div className="post-backlinks"><span>Replies:</span>{backlinks.map((reply) => <button key={reply} className="post-link" onClick={(event) => onPostLink(reply, event.currentTarget)}>&gt;&gt;{reply}</button>)}</div>}
  </article>
}

function scrollToPost(post: number) {
  document.getElementById(`p${post}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function usePullDownToBoard(board: string, disabled: boolean) {
  const gesture = useRef<{ x: number; y: number; lastX: number; lastY: number; startedAt: number } | null>(null)
  useEffect(() => {
    const start = (event: TouchEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (disabled || event.touches.length !== 1 || window.scrollY > 2 || !target?.closest('.thread-content') || target.closest('input, textarea, select, [contenteditable="true"]')) {
        gesture.current = null
        return
      }
      const touch = event.touches[0]
      gesture.current = { x: touch.clientX, y: touch.clientY, lastX: touch.clientX, lastY: touch.clientY, startedAt: performance.now() }
    }
    const move = (event: TouchEvent) => {
      const current = gesture.current
      if (!current || event.touches.length !== 1) return
      const touch = event.touches[0]
      current.lastX = touch.clientX
      current.lastY = touch.clientY
      const deltaX = touch.clientX - current.x
      const deltaY = touch.clientY - current.y
      if (deltaY > 12 && deltaY > Math.abs(deltaX) * 1.25) event.preventDefault()
    }
    const finish = (event: TouchEvent) => {
      const current = gesture.current
      gesture.current = null
      if (!current || disabled) return
      const touch = event.changedTouches[0]
      const endX = touch?.clientX ?? current.lastX
      const endY = touch?.clientY ?? current.lastY
      const deltaX = endX - current.x
      const deltaY = endY - current.y
      if (deltaY >= 84 && deltaY > Math.abs(deltaX) * 1.35 && performance.now() - current.startedAt < 1200) navigate(board)
    }
    const cancel = () => { gesture.current = null }
    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: false })
    document.addEventListener('touchend', finish, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', finish)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [board, disabled])
}

function Comment({ text, opNumber, onPostLink }: { text: string; opNumber: number; onPostLink: (post: number, anchor: HTMLElement) => void }) {
  return <div className="comment">{text.split('\n').map((line, i) => {
    const normalizedLine = line.replace(new RegExp(`(>>${opNumber})\\s*\\(OP\\)`, 'g'), '$1')
    return <p key={i} className={line.startsWith('>') && !line.startsWith('>>') ? 'quote' : ''}>{normalizedLine.split(/(>>\d+)/g).map((part, j) => {
    const postNumber = part.match(/^>>\d+$/) ? Number(part.slice(2)) : null
    return postNumber ? <button key={j} className="post-link" onClick={(event) => onPostLink(postNumber, event.currentTarget)}>{part}{postNumber === opNumber && <span className="op-marker"> (OP)</span>}</button> : part
  })}</p>})}</div>
}

function PostPreview({ board, preview, opNumber, filter, onClose, onOpen }: { board: string; preview: { post: Post; left: number; top: number }; opNumber: number; filter?: ContentFilter; onClose: () => void; onOpen: () => void }) {
  const previewRef = useRef<HTMLElement | null>(null)
  const { post, left, top } = preview
  const thumb = thumbnailUrl(board, post)
  useEffect(() => {
    previewRef.current?.focus()
    const dismissOutside = (event: PointerEvent) => {
      if (!previewRef.current?.contains(event.target as Node)) onClose()
    }
    const dismissWithEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    addEventListener('pointerdown', dismissOutside)
    addEventListener('keydown', dismissWithEscape)
    return () => {
      removeEventListener('pointerdown', dismissOutside)
      removeEventListener('keydown', dismissWithEscape)
    }
  }, [post.no, onClose])
  return <aside ref={previewRef} className="post-preview" style={{ left, top }} role="dialog" aria-label={`Preview post ${post.no}`} tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen() } }}>
    {filter ? <div className="filtered-preview"><strong>Filtered post</strong><span>{FILTER_KIND_LABELS[filter.kind]} matches “{filter.value}”</span><small>Open it to reveal the post.</small></div> : <>
    <div className="post-preview-head"><div><span className="avatar">{(post.name || 'A')[0]}</span><div><strong>{post.name || 'Anonymous'}{post.trip && <small> {post.trip}</small>}</strong><span>{post.now} · No.{post.no}</span></div></div><span>View post</span></div>
    {post.sub && <h3 className="post-subject">{htmlToText(post.sub)}</h3>}
    {thumb && <div className="post-preview-media"><img src={thumb} alt="" referrerPolicy="no-referrer" />{isVideo(post.ext) && <i>▶</i>}</div>}
    <div className="post-preview-comment">{markOpQuoteText(htmlToText(post.com), opNumber) || 'No comment.'}</div>
    </>}
  </aside>
}

function markOpQuoteText(text: string, opNumber: number) {
  const quote = `>>${opNumber}`
  return text.replace(new RegExp(`${quote}\\s*(?:\\(OP\\))?`, 'g'), `${quote} (OP)`)
}

function MediaViewer({ board, posts, index, onIndex, onClose }: { board: string; posts: Post[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const dialogRef = useDialogAccessibility<HTMLDivElement>(onClose)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const touchAxis = useRef<'pending' | 'horizontal' | 'vertical'>('pending')
  const suppressClick = useRef(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoPositions = useRef(new Map<string, number>())
  const settleTimer = useRef<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [settling, setSettling] = useState(false)
  const post = posts[index]
  const url = mediaUrl(board, post)!
  const previousIndex = (index - 1 + posts.length) % posts.length
  const nextIndex = (index + 1) % posts.length
  const rememberVideoPosition = () => {
    const video = videoRef.current
    if (video && Number.isFinite(video.currentTime)) videoPositions.current.set(url, video.currentTime)
  }
  const navigateMedia = (direction: -1 | 1) => {
    if (settling || posts.length < 2) return
    rememberVideoPosition()
    setSettling(true)
    const stageWidth = dialogRef.current?.querySelector<HTMLElement>('.media-stage')?.clientWidth ?? window.innerWidth
    setDragOffset(direction * -stageWidth)
    settleTimer.current = window.setTimeout(() => {
      onIndex(direction === 1 ? nextIndex : previousIndex)
      setSettling(false)
      setDragOffset(0)
    }, 220)
  }
  const startSwipe = (event: React.TouchEvent) => {
    if (settling) return
    const touch = event.touches[0]
    const video = videoRef.current
    if (video) {
      const rect = video.getBoundingClientRect()
      const controlHeight = Math.min(72, Math.max(48, rect.height * .16))
      const insideControls = touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.bottom - controlHeight && touch.clientY <= rect.bottom
      if (insideControls) return
    }
    touchStart.current = { x: touch.clientX, y: touch.clientY }
    touchAxis.current = 'pending'
  }
  const moveSwipe = (event: React.TouchEvent) => {
    const start = touchStart.current
    if (!start || settling) return
    const touch = event.touches[0]
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (touchAxis.current === 'pending' && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 7) {
      touchAxis.current = Math.abs(deltaX) > Math.abs(deltaY) * 1.1 ? 'horizontal' : 'vertical'
    }
    if (touchAxis.current !== 'horizontal') return
    setDragOffset(deltaX)
  }
  const finishSwipe = (event: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start || touchAxis.current !== 'horizontal') return
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    suppressClick.current = true
    if (Math.abs(deltaX) >= 50 && posts.length > 1) navigateMedia(deltaX < 0 ? 1 : -1)
    else {
      setSettling(true)
      setDragOffset(0)
      settleTimer.current = window.setTimeout(() => setSettling(false), 220)
    }
  }
  useEffect(() => {
    const video = dialogRef.current?.querySelector('video')
    if (!video) return
    videoRef.current = video
    const restore = () => {
      const saved = videoPositions.current.get(url)
      if (saved !== undefined) video.currentTime = Math.min(saved, video.duration)
    }
    const remember = () => {
      if (Number.isFinite(video.currentTime)) videoPositions.current.set(url, video.currentTime)
    }
    if (video.readyState >= 1) restore()
    else video.addEventListener('loadedmetadata', restore, { once: true })
    video.addEventListener('timeupdate', remember)
    return () => {
      remember()
      video.removeEventListener('loadedmetadata', restore)
      video.removeEventListener('timeupdate', remember)
      if (videoRef.current === video) videoRef.current = null
    }
  }, [url])
  useEffect(() => () => { if (settleTimer.current !== null) clearTimeout(settleTimer.current) }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') navigateMedia(-1)
      if (event.key === 'ArrowRight') navigateMedia(1)
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })
  const renderSlide = (slidePost: Post, active: boolean, position: string) => {
    const slideUrl = mediaUrl(board, slidePost)!
    return <div className="media-slide" key={position} aria-hidden={!active}>
      {active && isVideo(slidePost.ext)
        ? <video key={slideUrl} src={slideUrl} controls autoPlay playsInline loop onClick={(event) => event.stopPropagation()} />
        : <img src={active ? slideUrl : (thumbnailUrl(board, slidePost) ?? slideUrl)} alt={active ? slidePost.filename || 'Full-size media' : ''} referrerPolicy="no-referrer" draggable={false} onClick={(event) => event.stopPropagation()} />}
    </div>
  }
  return <div ref={dialogRef} className="media-viewer" role="dialog" aria-modal="true" aria-label="Media viewer" tabIndex={-1}>
    <button className="media-close" onClick={onClose} aria-label="Close media viewer"><X /></button>
    {posts.length > 1 && <><button className="media-nav previous" onClick={() => navigateMedia(-1)} aria-label="Previous media"><ChevronLeft /></button><button className="media-nav next" onClick={() => navigateMedia(1)} aria-label="Next media"><ChevronRight /></button></>}
    <div className="media-stage" onTouchStart={startSwipe} onTouchMove={moveSwipe} onTouchEnd={finishSwipe} onTouchCancel={() => { touchStart.current = null; setDragOffset(0) }} onClickCapture={(event) => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation() } }} onClick={onClose}>
      <div className={`media-track ${settling ? 'settling' : ''}`} style={{ transform: `translate3d(calc(-100% + ${dragOffset}px), 0, 0)` }}>
        {renderSlide(posts[previousIndex], false, 'previous')}
        {renderSlide(post, true, 'current')}
        {renderSlide(posts[nextIndex], false, 'next')}
      </div>
    </div>
    <div className="media-caption"><strong>{post.filename}{post.ext}</strong><span>{formatBytes(post.fsize)} · {post.w}×{post.h}</span><em>{index + 1} / {posts.length}</em></div>
  </div>
}

function MediaGallery({ board, posts, onSelect, onClose }: { board: string; posts: Post[]; onSelect: (index: number) => void; onClose: () => void }) {
  const dialogRef = useDialogAccessibility<HTMLDivElement>(onClose)
  return <div ref={dialogRef} className="gallery-view" role="dialog" aria-modal="true" aria-labelledby="gallery-title" tabIndex={-1}><header><div><span className="eyebrow">/{board}/ thread media</span><h2 id="gallery-title">Gallery</h2></div><div><span>{posts.length} files</span><button className="icon-button" onClick={onClose} aria-label="Close gallery"><X /></button></div></header><div className="gallery-grid">{posts.map((post, index) => <button key={post.no} onClick={() => onSelect(index)} aria-label={`Open ${post.filename || `media from post ${post.no}`}`}><img src={thumbnailUrl(board, post)!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /><span>{post.ext?.slice(1).toUpperCase()} · No.{post.no}</span>{isVideo(post.ext) && <i>▶</i>}</button>)}</div></div>
}

function ReplyComposer({ board, thread, quote, onClose, onPosted }: { board: string; thread: number; quote: number | null; onClose: () => void; onPosted: () => void }) {
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose)
  const [draft, setDraft] = useStoredState(`4leaf.draft.${board}.${thread}`, '')
  const [status, setStatus] = useState('')
  const [name, setName] = useStoredState('4leaf.postName', '')
  const [options, setOptions] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [spoiler, setSpoiler] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    if (!quote) return
    const marker = `>>${quote}`
    setDraft((old) => old.includes(marker) ? old : `${old}${old && !old.endsWith('\n') ? '\n' : ''}${marker}\n`)
  }, [quote])
  const continueTo4chan = async () => {
    if (!draft.trim()) return
    const copy = navigator.clipboard?.writeText(draft) ?? Promise.reject(new Error('Clipboard unavailable'))
    window.open(`${officialThreadUrl(board, thread)}#p${thread}`, '_blank', 'noopener,noreferrer')
    try {
      await copy
      setStatus('Copied. Paste it into the official reply box.')
    } catch {
      setStatus('Copy the draft manually, then continue to 4chan.')
    }
  }
  const postNative = async () => {
    if (!draft.trim() && !file) return
    setSubmitting(true); setStatus('Posting…')
    try {
      const result = await submitNativeReply({ board, thread, comment: draft, name, options, file, spoiler })
      if (result.error) { setStatus(result.error); return }
      setDraft(''); setFile(null); setStatus(`Posted as No.${result.post}.`); onPosted()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The reply could not be posted.')
    } finally { setSubmitting(false) }
  }
  return <><button className="scrim visible reply-scrim" onClick={onClose} aria-label="Close quick reply" /><aside ref={dialogRef} className="reply-composer" role="dialog" aria-modal="true" aria-labelledby="reply-title" tabIndex={-1}><div className="sheet-head"><div><span className="eyebrow">/{board}/ · No.{thread}</span><h2 id="reply-title">Quick reply</h2></div><button className="icon-button" onClick={onClose} aria-label="Close quick reply"><X /></button></div>{isNativeApp && <div className="composer-fields"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" aria-label="Name" /><input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Options (e.g. sage)" aria-label="Post options" /></div>}<textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply…" aria-label="Reply text" /><div className="composer-count">{draft.length.toLocaleString()} characters</div>{isNativeApp ? <div className="native-attachment"><label><ImageIcon /> <span>{file ? file.name : 'Attach image or WebM'}</span><input type="file" accept="image/*,.webm,video/webm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label><label className="spoiler-toggle"><input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} /> Spoiler</label></div> : <div className="handoff-note"><ShieldCheck /><p><strong>Secure posting handoff</strong><span>The web app copies your draft and opens 4chan for final submission. Install the native build to post directly.</span></p></div>}{status && <p className="composer-status" aria-live="polite">{status}</p>}<div className="composer-actions"><button className="secondary" disabled={!draft && !file} onClick={() => { setDraft(''); setFile(null) }}><X size={16} /> Clear</button>{isNativeApp ? <button className="primary" disabled={submitting || (!draft.trim() && !file)} onClick={postNative}><Send size={16} /> {submitting ? 'Posting…' : 'Post reply'}</button> : <button className="primary" disabled={!draft.trim()} onClick={continueTo4chan}><Copy size={16} /> Copy & continue <Send size={15} /></button>}</div></aside></>
}

function SettingsSheet({ theme, customPalette, filters, onTheme, onCustomPalette, onFilters, onClose }: { theme: ThemeId; customPalette: Palette; filters: ContentFilter[]; onTheme: (theme: ThemeId) => void; onCustomPalette: (palette: Palette) => void; onFilters: (filters: ContentFilter[] | ((old: ContentFilter[]) => ContentFilter[])) => void; onClose: () => void }) {
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose)
  const standalone = matchMedia('(display-mode: standalone)').matches
  const changeColor = (key: keyof Palette, value: string) => {
    onCustomPalette({ ...customPalette, [key]: value })
    onTheme('custom')
  }
  return <><button className="scrim visible" onClick={onClose} aria-label="Close settings" /><aside ref={dialogRef} className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}><div className="sheet-head"><div><span className="eyebrow">4leaf</span><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X /></button></div>
    <section className="appearance-settings">
      <div className="settings-section-head"><div><h3>Theme</h3><p>Presets inspired by familiar 4chan X styles.</p></div><PaletteIcon /></div>
      <div className="theme-grid">{Object.entries(THEME_PRESETS).map(([id, preset]) => <button key={id} className={`theme-option ${theme === id ? 'active' : ''}`} onClick={() => onTheme(id as ThemeId)} aria-pressed={theme === id}>
        <span className="theme-swatches" aria-hidden="true"><i style={{ background: preset.palette.bg }} /><i style={{ background: preset.palette.surface }} /><i style={{ background: preset.palette.accent }} /><i style={{ background: preset.palette.ink }} /></span>
        <span><strong>{preset.name}</strong><small>{preset.description}</small></span>{theme === id && <Check />}
      </button>)}</div>
      <div className={`custom-theme ${theme === 'custom' ? 'active' : ''}`}>
        <div className="custom-theme-head"><div><strong>Custom colors</strong><span>Changes preview instantly.</span></div><button className="reset-colors" onClick={() => { onCustomPalette(DEFAULT_CUSTOM_PALETTE); onTheme('custom') }}><RotateCcw /> Reset</button></div>
        <div className="color-grid">{(Object.keys(COLOR_LABELS) as (keyof Palette)[]).map((key) => <ColorControl key={key} label={COLOR_LABELS[key]} value={customPalette[key]} onChange={(value) => changeColor(key, value)} />)}</div>
      </div>
    </section>
    <ContentFilterSettings filters={filters} onFilters={onFilters} />
    <section><h3>Install 4leaf</h3>{standalone ? <div className="installed"><Check /> Installed on this device</div> : <div className="install-note"><Share /><p><strong>Add to your Home Screen</strong><span>In Safari, tap Share, then “Add to Home Screen.”</span></p></div>}</section>
    <section><h3>4chan Pass</h3>{isNativeApp ? <NativePassPanel /> : <><p className="settings-copy">Pass authorization must happen on 4chan so Safari can store its secure cookie. Once authorized, use “Open official” or “Reply” from 4leaf.</p><a className="secondary wide" href="https://sys.4chan.org/auth" target="_blank" rel="noreferrer">Authorize on 4chan <ExternalLink size={16} /></a></>}</section>
    <p className="fine-print">4leaf uses 4chan’s read-only JSON API. It never receives or stores your Pass token or PIN.</p>
  </aside></>
}

function ContentFilterSettings({ filters, onFilters }: { filters: ContentFilter[]; onFilters: (filters: ContentFilter[] | ((old: ContentFilter[]) => ContentFilter[])) => void }) {
  const [kind, setKind] = useState<FilterKind>('keyword')
  const [value, setValue] = useState('')
  const [board, setBoard] = useState('')
  const addFilter = (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedValue = value.trim()
    if (!normalizedValue) return
    const normalizedBoard = board.trim().toLowerCase().replaceAll('/', '')
    onFilters((old) => [...old, { id: crypto.randomUUID(), kind, value: normalizedValue, board: normalizedBoard || undefined, enabled: true }])
    setValue('')
  }
  return <section className="content-filter-settings">
    <div className="settings-section-head"><div><h3>Content filters</h3><p>Collapse matching posts and threads. Rules stay on this device.</p></div><ShieldCheck /></div>
    <form className="filter-builder" onSubmit={addFilter}>
      <select value={kind} onChange={(event) => setKind(event.target.value as FilterKind)} aria-label="Filter type">{Object.entries(FILTER_KIND_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder={kind === 'filetype' ? 'e.g. webm' : `Match ${FILTER_KIND_LABELS[kind].toLowerCase()}`} aria-label="Filter value" />
      <input value={board} onChange={(event) => setBoard(event.target.value)} placeholder="Board (optional)" aria-label="Limit filter to board" autoCapitalize="none" />
      <button className="primary" type="submit" disabled={!value.trim()}>Add rule</button>
    </form>
    {filters.length ? <div className="filter-list">{filters.map((filter) => <div className={`filter-rule ${filter.enabled ? '' : 'disabled'}`} key={filter.id}>
      <label><input type="checkbox" checked={filter.enabled} onChange={() => onFilters((old) => old.map((item) => item.id === filter.id ? { ...item, enabled: !item.enabled } : item))} /><span><strong>{FILTER_KIND_LABELS[filter.kind]} · {filter.value}</strong><small>{filter.board ? `Only /${filter.board}/` : 'All boards'}</small></span></label>
      <button onClick={() => onFilters((old) => old.filter((item) => item.id !== filter.id))} aria-label={`Delete ${filter.value} filter`}><X /></button>
    </div>)}</div> : <p className="empty-filters">No filter rules yet.</p>}
  </section>
}

const COLOR_LABELS: Record<keyof Palette, string> = { bg: 'Background', surface: 'Cards', ink: 'Text', muted: 'Muted text', accent: 'Accent', sidebar: 'Sidebar', sidebarInk: 'Sidebar text', danger: 'Danger' }
const validHex = (value: string) => /^#[\da-f]{6}$/i.test(value)
function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => validHex(draft) ? onChange(draft) : setDraft(value)
  return <label className="color-control"><span>{label}</span><span className="color-value">
    <input type="color" value={validHex(value) ? value : '#000000'} onChange={(event) => onChange(event.target.value)} aria-label={`${label} color`} />
    <input type="text" value={draft} maxLength={7} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur() } }} spellCheck={false} aria-label={`${label} hex value`} />
  </span></label>
}
function isDarkColor(hex: string) {
  if (!validHex(hex)) return false
  const [red, green, blue] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((channel) => Number.parseInt(channel, 16) / 255)
  const luminance = [red, green, blue].map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  return .2126 * luminance[0] + .7152 * luminance[1] + .0722 * luminance[2] < .35
}

function NativePassPanel() {
  const [token, setToken] = useState('')
  const [pin, setPin] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Checking authorization…')
  useEffect(() => { hasAuthorizedPass().then((value) => { setAuthorized(value); setMessage(value ? 'Pass authorized on this device.' : 'Authorize a Pass to post without CAPTCHA.') }) }, [])
  const submit = async () => {
    setBusy(true); setMessage('Authorizing…')
    try {
      const result = await authorizePass(token, pin)
      setAuthorized(result.ok); setMessage(result.message)
      if (result.ok) { setToken(''); setPin('') }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authorization failed.') }
    finally { setBusy(false) }
  }
  const disconnect = async () => { await clearPass(); setAuthorized(false); setMessage('Pass removed from this device.') }
  return <div className="pass-panel">{authorized ? <><div className="installed"><Check /> Pass authorized</div><button className="secondary wide" onClick={disconnect}>Remove Pass</button></> : <><div className="pass-fields"><input autoCapitalize="none" autoCorrect="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="10-character token" aria-label="Pass token" /><input inputMode="numeric" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="6-digit PIN" aria-label="Pass PIN" /></div><button className="primary wide" disabled={busy || !token.trim() || !pin.trim()} onClick={submit}>{busy ? 'Authorizing…' : 'Authorize Pass'}</button></>}<p className="settings-copy" aria-live="polite">{message} Credentials are sent directly to 4chan and are never saved by 4leaf.</p></div>
}

function useDialogAccessibility<T extends HTMLElement>(onClose: () => void) {
  const dialogRef = useRef<T>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hidden)
    const frame = requestAnimationFrame(() => {
      if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) { event.preventDefault(); dialog.focus(); return }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [])

  return dialogRef
}

function Logo() {
  return <span className="logo"><svg viewBox="0 0 64 64" aria-hidden="true">
    <path className="logo-stem" d="M35 35c5.8 6.4 9.4 14 11.5 22.5" />
    <path d="M32 34c-4.2-4.3-12-7.7-12-16A12 12 0 0 1 44 18c0 8.3-7.8 11.7-12 16Z" />
    <path d="M30 32c4.3-4.2 7.7-12 16-12a12 12 0 0 1 0 24c-8.3 0-11.7-7.8-16-12Z" />
    <path d="M32 30c4.2 4.3 12 7.7 12 16a12 12 0 0 1-24 0c0-8.3 7.8-11.7 12-16Z" />
    <path d="M34 32c-4.3 4.2-7.7 12-16 12a12 12 0 0 1 0-24c8.3 0 11.7 7.8 16 12Z" />
  </svg></span>
}
function isVideo(ext?: string) { return ext === '.webm' || ext === '.mp4' }
function SectionHeading({ title, action }: { title: string; action: string }) { return <div className="section-heading"><h2>{title}</h2><span>{action}</span></div> }
function LoadingCards() { return <div className="board-grid">{Array.from({ length: 12 }, (_, i) => <div className="board-card skeleton" key={i} />)}</div> }
function LoadingCatalog({ size = 'medium' }: { size?: CatalogSize }) { return <div className={`catalog-grid size-${size}`}>{Array.from({ length: 12 }, (_, i) => <div className="thread-card skeleton" key={i} />)}</div> }
function ThreadSkeleton() { return <div className="posts">{Array.from({ length: 5 }, (_, i) => <div className="post skeleton" key={i} />)}</div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state-card"><span>That leaf blew away.</span><h2>{message}</h2><button className="secondary" onClick={retry}><RefreshCw size={16} /> Try again</button></div> }
function EmptySearch() { return <div className="state-card"><Search /><h2>No matching threads</h2><span>Try a broader phrase.</span></div> }
