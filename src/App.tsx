import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, Bookmark, Check, ChevronLeft, ChevronRight, Copy, ExternalLink,
  House, Image as ImageIcon, Images, Menu, MessageCircle, Moon, RefreshCw,
  Search, Send, Settings, Share, ShieldCheck, Sun, X,
} from 'lucide-react'
import { getBoards, getCatalog, getThread, mediaUrl, officialBoardUrl, officialThreadUrl, thumbnailUrl } from './api'
import { authorizePass, clearPass, hasAuthorizedPass, isNativeApp, submitNativeReply } from './native'
import type { Board, Post, Route } from './types'
import { formatBytes, htmlToText, navigate, parseRoute, timeAgo, useStoredState } from './utils'

type Theme = 'light' | 'dark'

export default function App() {
  const [accepted, setAccepted] = useStoredState('4leaf.accepted', false)
  const [theme, setTheme] = useStoredState<Theme>('4leaf.theme', 'light')
  const [favorites, setFavorites] = useStoredState<string[]>('4leaf.favorites', ['g', 'v', 'wg'])
  const [saved, setSaved] = useStoredState<Record<string, SavedThread>>('4leaf.saved', {})
  const [route, setRoute] = useState<Route>(parseRoute)
  const [boards, setBoards] = useState<Board[]>([])
  const [boardsLoading, setBoardsLoading] = useState(true)
  const [boardsError, setBoardsError] = useState('')
  const [boardsRetry, setBoardsRetry] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151714' : '#f7f3e8')
  }, [theme])
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
      <Sidebar boards={boards} favorites={favorites} saved={saved} route={route} open={menuOpen} apiStatus={boardsError ? 'error' : boardsLoading ? 'loading' : 'connected'} onClose={() => setMenuOpen(false)} />
      <div className="page-shell">
        <Header route={route} activeBoard={activeBoard} savedCount={Object.keys(saved).length} onMenu={() => setMenuOpen(true)} onSettings={() => setSettingsOpen(true)} />
        <main>
          {!route.board && <Home boards={boards} boardsLoading={boardsLoading} boardsError={boardsError} onRetry={() => setBoardsRetry((value) => value + 1)} favorites={favorites} saved={saved} onToggleFavorite={toggleFavorite} />}
          {route.board && !route.thread && <Catalog board={route.board} info={activeBoard} favorite={favorites.includes(route.board)} onToggleFavorite={() => toggleFavorite(route.board!)} />}
          {route.board && route.thread && <Thread board={route.board} thread={route.thread} saved={Boolean(saved[`${route.board}/${route.thread}`])} onToggleSaved={toggleSaved} />}
        </main>
      </div>
      {settingsOpen && <SettingsSheet theme={theme} onTheme={setTheme} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

interface SavedThread { board: string; no: number; title: string; savedAt: number }

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

function Sidebar({ boards, favorites, saved, route, open, apiStatus, onClose }: { boards: Board[]; favorites: string[]; saved: Record<string, SavedThread>; route: Route; open: boolean; apiStatus: 'loading' | 'connected' | 'error'; onClose: () => void }) {
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
          <NavItem key={`${thread.board}/${thread.no}`} icon={<MessageCircle />} label={thread.title} sub={`/${thread.board}/ · #${thread.no}`} active={route.thread === thread.no && route.board === thread.board} onClick={() => navigate(thread.board, thread.no)} />
        )}
      </nav>
      <div className="sidebar-foot"><span className={`status-dot ${apiStatus}`} /> {apiStatus === 'error' ? 'API unavailable' : apiStatus === 'loading' ? 'Connecting to API' : 'Read-only API connected'}</div>
    </aside>
  </>
}

function NavItem({ icon, label, sub, active, onClick }: { icon: React.ReactNode; label: string; sub?: string; active?: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span><span className="nav-copy"><strong>{label}</strong>{sub && <small>{sub}</small>}</span></button>
}

function Home({ boards, boardsLoading, boardsError, onRetry, favorites, saved, onToggleFavorite }: { boards: Board[]; boardsLoading: boolean; boardsError: string; onRetry: () => void; favorites: string[]; saved: Record<string, SavedThread>; onToggleFavorite: (board: string) => void }) {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const filtered = boards.filter((b) => `${b.board} ${b.title}`.toLowerCase().includes(query.toLowerCase()))
  const visible = query || showAll ? filtered : filtered.slice(0, 18)
  return <div className="content home-content">
    <div className="search-box"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a board" aria-label="Find a board" />{query && <button onClick={() => setQuery('')} aria-label="Clear board search"><X size={17} /></button>}</div>
    {Object.keys(saved).length > 0 && <section className="section-block"><SectionHeading title="Saved threads" action="See in sidebar" /><div className="saved-grid">{Object.values(saved).sort((a, b) => b.savedAt - a.savedAt).slice(0, 3).map((item) => <button className="saved-card" key={`${item.board}/${item.no}`} onClick={() => navigate(item.board, item.no)}><span>/{item.board}/</span><strong>{item.title}</strong><small>Thread #{item.no}</small><ChevronRight /></button>)}</div></section>}
    <section className="section-block">
      <SectionHeading title={query ? 'Search results' : 'All boards'} action={`${boards.length} boards`} />
      {boardsLoading ? <LoadingCards /> : boardsError ? <ErrorState message={boardsError} retry={onRetry} /> : <div className="board-grid">{visible.map((board) => <article className="board-card" key={board.board}><button className="board-card-link" onClick={() => navigate(board.board)}><div><span className="board-slug">/{board.board}/</span><strong>{board.title}</strong></div><p>{board.meta_description || 'View this board’s catalog and active threads.'}</p></button><button className={`star ${favorites.includes(board.board) ? 'selected' : ''}`} onClick={() => onToggleFavorite(board.board)} aria-label={`${favorites.includes(board.board) ? 'Remove' : 'Add'} /${board.board}/ ${favorites.includes(board.board) ? 'from' : 'to'} favorites`}><Bookmark size={17} fill={favorites.includes(board.board) ? 'currentColor' : 'none'} /></button></article>)}</div>}
      {!query && !showAll && boards.length > 18 && <button className="secondary centered" onClick={() => setShowAll(true)}>Show all boards</button>}
    </section>
  </div>
}

function Catalog({ board, info, favorite, onToggleFavorite }: { board: string; info?: Board; favorite: boolean; onToggleFavorite: () => void }) {
  const [threads, setThreads] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
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
  const visible = useMemo(() => threads.filter((p) => htmlToText(`${p.sub ?? ''} ${p.com ?? ''}`).toLowerCase().includes(query.toLowerCase())), [threads, query])
  return <div className="content catalog-content">
    <section className="board-heading"><div><span className="board-slug large">/{board}/</span><h2>{info?.title ?? 'Board'}</h2><p>{info?.meta_description}</p></div><div className="heading-actions"><button className={`secondary ${favorite ? 'selected' : ''}`} onClick={onToggleFavorite}><Bookmark size={17} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? 'Favorited' : 'Favorite'}</button><a className="primary" href={officialBoardUrl(board)} target="_blank" rel="noreferrer">Open official <ExternalLink size={16} /></a></div></section>
    <div className="catalog-tools"><div className="search-box compact"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter this catalog" aria-label="Filter this catalog" /></div><button className="icon-button refresh" onClick={load} aria-label="Refresh"><RefreshCw size={18} /></button></div>
    {loading ? <LoadingCatalog /> : error ? <ErrorState message={error} retry={load} /> : !visible.length ? <EmptySearch /> : <div className="catalog-grid">{visible.map((post) => <ThreadCard key={post.no} board={board} post={post} />)}</div>}
  </div>
}

function ThreadCard({ board, post }: { board: string; post: Post }) {
  const thumb = thumbnailUrl(board, post)
  return <button className="thread-card" onClick={() => navigate(board, post.no)} aria-label={`Open ${htmlToText(post.sub) || `thread ${post.no}`}`}>
    <div className="thread-thumb">{thumb ? <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <ImageIcon />}{post.ext === '.webm' && <span className="media-badge">WEBM</span>}{post.sticky === 1 && <span className="sticky-badge">Pinned</span>}</div>
    <div className="thread-card-body"><div className="thread-meta"><span>{timeAgo(post.time)} ago</span><span><MessageCircle size={13} /> {post.replies ?? 0}</span><span><ImageIcon size={13} /> {post.images ?? 0}</span></div><h3>{htmlToText(post.sub) || `Thread #${post.no}`}</h3><p>{htmlToText(post.com) || 'No comment.'}</p></div>
  </button>
}

function Thread({ board, thread, saved, onToggleSaved }: { board: string; thread: number; saved: boolean; onToggleSaved: (item: SavedThread) => void }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [error, setError] = useState('')
  const [mediaIndex, setMediaIndex] = useState<number | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyQuote, setReplyQuote] = useState<number | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const updateController = useRef<AbortController | null>(null)
  const load = () => setRequestVersion((value) => value + 1)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setUpdating(false); setPosts([]); setError(''); setUpdateStatus('')
    getThread(board, thread, controller.signal)
      .then(setPosts)
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [board, thread, requestVersion])
  useEffect(() => () => updateController.current?.abort(), [board, thread])
  const loadNewer = () => {
    if (loading || updating) return
    updateController.current?.abort()
    const controller = new AbortController()
    updateController.current = controller
    setUpdating(true); setUpdateStatus('')
    const existing = new Set(posts.map((post) => post.no))
    getThread(board, thread, controller.signal).then((next) => {
      const added = next.filter((post) => !existing.has(post.no)).length
      setPosts(next)
      setUpdateStatus(added ? `${added} new post${added === 1 ? '' : 's'} loaded.` : 'No new posts.')
      if (added) requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }))
    }).catch((error: Error) => { if (!controller.signal.aborted) setUpdateStatus(error.message) }).finally(() => { if (!controller.signal.aborted) setUpdating(false) })
  }
  const op = posts[0]
  const media = posts.filter((post) => post.tim && post.ext)
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
  const openReply = (quote?: number) => { setReplyQuote(quote ?? null); setReplyOpen(true) }
  return <div className="content thread-content">
    <div className="thread-toolbar"><div><span>{posts.length ? `${posts.length} posts` : 'Thread'}</span>{op?.closed === 1 && <span className="closed-pill">Closed</span>}</div><div><button className="secondary gallery-button" disabled={!media.length} onClick={() => setGalleryOpen(true)}><Images size={17} /> Gallery <span>{media.length}</span></button><button className={`icon-button ${saved ? 'selected' : ''}`} disabled={!op} onClick={() => onToggleSaved({ board, no: thread, title, savedAt: Date.now() })} aria-label="Save thread"><Bookmark fill={saved ? 'currentColor' : 'none'} /></button><button className="icon-button" disabled={loading || updating} onClick={loadNewer} aria-label="Load newer posts"><RefreshCw className={updating ? 'spinning' : ''} /></button><button className="primary" disabled={op?.closed === 1} onClick={() => openReply()}>Reply <MessageCircle size={15} /></button></div></div>
    {loading ? <ThreadSkeleton /> : error ? <ErrorState message={error} retry={load} /> : <><div className="posts">{posts.map((post, index) => <PostView key={post.no} board={board} post={post} op={index === 0} backlinks={backlinks.get(post.no) ?? []} onMedia={() => setMediaIndex(media.findIndex((item) => item.no === post.no))} onReply={() => openReply(post.no)} />)}</div><div className="thread-updater" aria-live="polite"><span>{updateStatus || `${posts.length} posts loaded`}</span><button className="secondary" disabled={updating} onClick={loadNewer}><RefreshCw className={updating ? 'spinning' : ''} /> {updating ? 'Checking…' : 'Load newer posts'}</button></div></>}
    {galleryOpen && <MediaGallery board={board} posts={media} onClose={() => setGalleryOpen(false)} onSelect={(index) => { setGalleryOpen(false); setMediaIndex(index) }} />}
    {mediaIndex !== null && <MediaViewer board={board} posts={media} index={mediaIndex} onIndex={setMediaIndex} onClose={() => setMediaIndex(null)} />}
    {replyOpen && <ReplyComposer key={`${board}/${thread}/${replyQuote ?? 'thread'}`} board={board} thread={thread} quote={replyQuote} onClose={() => setReplyOpen(false)} onPosted={() => { setReplyOpen(false); setTimeout(loadNewer, 1200) }} />}
  </div>
}

function PostView({ board, post, op, backlinks, onMedia, onReply }: { board: string; post: Post; op: boolean; backlinks: number[]; onMedia: () => void; onReply: () => void }) {
  const thumb = thumbnailUrl(board, post)
  const text = htmlToText(post.com)
  return <article className={`post ${op ? 'op' : ''}`} id={`p${post.no}`}>
    <div className="post-head"><div><span className="avatar">{(post.name || 'A')[0]}</span><div><strong>{post.name || 'Anonymous'}{post.trip && <small> {post.trip}</small>}</strong><span>{post.now} · No.{post.no}</span></div></div><button className="post-reply-button" onClick={onReply}><MessageCircle /> Reply</button></div>
    {post.sub && <h3 className="post-subject">{htmlToText(post.sub)}</h3>}
    <div className={`post-content ${thumb ? 'has-media' : ''}`}>
      {thumb && <button className="post-media" onClick={onMedia} aria-label={`Open ${post.filename || 'attached media'}`}><img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>{post.ext?.slice(1).toUpperCase()} · {formatBytes(post.fsize)}{post.w && ` · ${post.w}×${post.h}`}</span>{post.ext === '.webm' && <span className="play">▶</span>}</button>}
      <Comment text={text} />
    </div>
    {backlinks.length > 0 && <div className="post-backlinks"><span>Replies:</span>{backlinks.map((reply) => <button key={reply} className="post-link" onClick={() => scrollToPost(reply)}>&gt;&gt;{reply}</button>)}</div>}
  </article>
}

function scrollToPost(post: number) {
  document.getElementById(`p${post}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Comment({ text }: { text: string }) {
  return <div className="comment">{text.split('\n').map((line, i) => <p key={i} className={line.startsWith('>') && !line.startsWith('>>') ? 'quote' : ''}>{line.split(/(>>\d+)/g).map((part, j) => part.match(/^>>\d+$/) ? <button key={j} className="post-link" onClick={() => scrollToPost(Number(part.slice(2)))}>{part}</button> : part)}</p>)}</div>
}

function MediaViewer({ board, posts, index, onIndex, onClose }: { board: string; posts: Post[]; index: number; onIndex: (index: number) => void; onClose: () => void }) {
  const dialogRef = useDialogAccessibility<HTMLDivElement>(onClose)
  const post = posts[index]
  const url = mediaUrl(board, post)!
  const previous = () => onIndex((index - 1 + posts.length) % posts.length)
  const next = () => onIndex((index + 1) % posts.length)
  useEffect(() => { const key = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') previous(); if (e.key === 'ArrowRight') next() }; addEventListener('keydown', key); return () => removeEventListener('keydown', key) })
  return <div ref={dialogRef} className="media-viewer" role="dialog" aria-modal="true" aria-label="Media viewer" tabIndex={-1}><button className="media-close" onClick={onClose} aria-label="Close media viewer"><X /></button>{posts.length > 1 && <><button className="media-nav previous" onClick={previous} aria-label="Previous media"><ChevronLeft /></button><button className="media-nav next" onClick={next} aria-label="Next media"><ChevronRight /></button></>}<div className="media-stage" onClick={onClose}>{post.ext === '.webm' ? <video key={url} src={url} controls autoPlay playsInline loop onClick={(e) => e.stopPropagation()} /> : <img src={url} alt={post.filename || 'Full-size media'} referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />}</div><div className="media-caption"><strong>{post.filename}{post.ext}</strong><span>{formatBytes(post.fsize)} · {post.w}×{post.h}</span><em>{index + 1} / {posts.length}</em></div></div>
}

function MediaGallery({ board, posts, onSelect, onClose }: { board: string; posts: Post[]; onSelect: (index: number) => void; onClose: () => void }) {
  const dialogRef = useDialogAccessibility<HTMLDivElement>(onClose)
  return <div ref={dialogRef} className="gallery-view" role="dialog" aria-modal="true" aria-labelledby="gallery-title" tabIndex={-1}><header><div><span className="eyebrow">/{board}/ thread media</span><h2 id="gallery-title">Gallery</h2></div><div><span>{posts.length} files</span><button className="icon-button" onClick={onClose} aria-label="Close gallery"><X /></button></div></header><div className="gallery-grid">{posts.map((post, index) => <button key={post.no} onClick={() => onSelect(index)} aria-label={`Open ${post.filename || `media from post ${post.no}`}`}><img src={thumbnailUrl(board, post)!} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /><span>{post.ext?.slice(1).toUpperCase()} · No.{post.no}</span>{post.ext === '.webm' && <i>▶</i>}</button>)}</div></div>
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

function SettingsSheet({ theme, onTheme, onClose }: { theme: Theme; onTheme: (theme: Theme) => void; onClose: () => void }) {
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose)
  const standalone = matchMedia('(display-mode: standalone)').matches
  return <><button className="scrim visible" onClick={onClose} aria-label="Close settings" /><aside ref={dialogRef} className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}><div className="sheet-head"><div><span className="eyebrow">4leaf</span><h2 id="settings-title">Settings</h2></div><button className="icon-button" onClick={onClose} aria-label="Close settings"><X /></button></div>
    <section><h3>Appearance</h3><div className="segmented"><button className={theme === 'light' ? 'active' : ''} onClick={() => onTheme('light')}><Sun /> Light</button><button className={theme === 'dark' ? 'active' : ''} onClick={() => onTheme('dark')}><Moon /> Dark</button></div></section>
    <section><h3>Install 4leaf</h3>{standalone ? <div className="installed"><Check /> Installed on this device</div> : <div className="install-note"><Share /><p><strong>Add to your Home Screen</strong><span>In Safari, tap Share, then “Add to Home Screen.”</span></p></div>}</section>
    <section><h3>4chan Pass</h3>{isNativeApp ? <NativePassPanel /> : <><p className="settings-copy">Pass authorization must happen on 4chan so Safari can store its secure cookie. Once authorized, use “Open official” or “Reply” from 4leaf.</p><a className="secondary wide" href="https://sys.4chan.org/auth" target="_blank" rel="noreferrer">Authorize on 4chan <ExternalLink size={16} /></a></>}</section>
    <p className="fine-print">4leaf uses 4chan’s read-only JSON API. It never receives or stores your Pass token or PIN.</p>
  </aside></>
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

function Logo() { return <span className="logo"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M47 48C16 50 7 23 26 13 43 5 52 25 51 45Z"/><path d="M53 48C84 50 93 23 74 13 57 5 48 25 49 45Z"/><path d="M47 53C16 50 7 77 26 87 43 95 52 75 51 55Z"/><path d="M53 53C84 50 93 77 74 87 57 95 48 75 49 55Z"/><path d="m48 52 9 40 6-3-10-39Z"/></svg></span> }
function SectionHeading({ title, action }: { title: string; action: string }) { return <div className="section-heading"><h2>{title}</h2><span>{action}</span></div> }
function LoadingCards() { return <div className="board-grid">{Array.from({ length: 12 }, (_, i) => <div className="board-card skeleton" key={i} />)}</div> }
function LoadingCatalog() { return <div className="catalog-grid">{Array.from({ length: 12 }, (_, i) => <div className="thread-card skeleton" key={i} />)}</div> }
function ThreadSkeleton() { return <div className="posts">{Array.from({ length: 5 }, (_, i) => <div className="post skeleton" key={i} />)}</div> }
function ErrorState({ message, retry }: { message: string; retry: () => void }) { return <div className="state-card"><span>That leaf blew away.</span><h2>{message}</h2><button className="secondary" onClick={retry}><RefreshCw size={16} /> Try again</button></div> }
function EmptySearch() { return <div className="state-card"><Search /><h2>No matching threads</h2><span>Try a broader phrase.</span></div> }
