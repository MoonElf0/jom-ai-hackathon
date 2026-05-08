// src/pages/ChatRoomPage.jsx
//
// 1-on-1 OR group chat. Features:
//   • Realtime via Supabase channel
//   • @mentions: by user (@john) or by role (@basketball)
//     → resolved on send → recipients get a 'mention' notification
//   • Location share: "📍 Share location" picker → message renders as a map card
//     → tapping the card sends user back to /map?routeTo=<facility-id|lat,lng,name>
//   • Group: ⚙️ icon opens GroupSettingsModal (admin can edit name/emoji/members)
//
// URL: /chat/:chatId

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../utils/useAuth'
import {
  fetchMessages, sendTextMessage, sendLocationMessage,
  subscribeToChat, parseMentions, resolveMentionRecipients,
  createNotification, markChatRead, HOBBY_ROLES, ROLE_LABEL,
} from '../utils/socialApi'
import GroupSettingsModal from '../components/GroupSettingsModal'

export default function ChatRoomPage() {
  const { chatId } = useParams()
  const navigate   = useNavigate()
  const { user }   = useAuth()

  const [chat,     setChat]     = useState(null)
  const [members,  setMembers]  = useState([])
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [showLocPicker, setShowLocPicker] = useState(false)
  const [showSettings,  setShowSettings]  = useState(false)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [mentionQuery,    setMentionQuery]    = useState('')

  const bodyRef    = useRef(null)
  const inputRef   = useRef(null)
  const subRef     = useRef(null)

  const myMember = members.find(m => m.user_id === user?.id)
  const isAdmin  = myMember?.role === 'admin'

  // ── Load chat + members + messages ───────────────────────────────
  const reload = useCallback(async () => {
    if (!chatId || !user) return
    setLoading(true)
    const [{ data: chatRow }, { data: memRows }, { data: msgs }] = await Promise.all([
      supabase.from('chats').select('*').eq('id', chatId).single(),
      supabase.from('chat_members')
        .select('id, chat_id, user_id, role, roles, last_read_at, profile:user_profiles(id, display_name, avatar_url)')
        .eq('chat_id', chatId),
      fetchMessages(chatId, 200),
    ])
    setChat(chatRow)
    setMembers(memRows || [])
    setMessages(msgs || [])
    setLoading(false)
    // mark read
    const me = (memRows || []).find(m => m.user_id === user.id)
    if (me) markChatRead(me.id)
  }, [chatId, user])

  useEffect(() => { reload() }, [reload])

  // ── Realtime subscription ───────────────────────────────────────
  useEffect(() => {
    if (!chatId) return
    subRef.current = subscribeToChat(chatId, async (newRow) => {
      // hydrate sender info
      const { data: prof } = await supabase
        .from('user_profiles').select('id, display_name, avatar_url')
        .eq('id', newRow.sender_id).single()
      setMessages(prev => {
        if (prev.some(m => m.id === newRow.id)) return prev
        return [...prev, { ...newRow, sender: prof }]
      })
    })
    return () => { subRef.current && supabase.removeChannel(subRef.current) }
  }, [chatId])

  // ── Auto-scroll on new message ───────────────────────────────────
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [messages.length])

  // ── @mention live menu ──────────────────────────────────────────
  function handleInputChange(e) {
    const v = e.target.value
    setInput(v)
    // if last token starts with @ and has no space yet → show menu
    const m = v.match(/@([a-zA-Z0-9_]*)$/)
    if (m) {
      setMentionQuery(m[1].toLowerCase())
      setShowMentionMenu(true)
    } else {
      setShowMentionMenu(false)
    }
  }

  const mentionCandidates = useMemo(() => {
    if (!showMentionMenu) return []
    const q = mentionQuery
    const userOpts = members
      .filter(m => m.user_id !== user?.id)
      .map(m => ({
        kind: 'user', id: m.user_id, raw: '@' + (m.profile?.display_name || '').replace(/\s+/g, ''),
        label: m.profile?.display_name || 'Anonymous',
        avatar: m.profile?.avatar_url, hint: 'user',
      }))
      .filter(o => !q || o.label.toLowerCase().replace(/\s+/g, '').startsWith(q))
    const roleOpts = HOBBY_ROLES
      .filter(r => !q || r.value.startsWith(q) || r.label.toLowerCase().includes(q))
      .map(r => ({ kind: 'role', id: r.value, raw: '@' + r.value.split('_')[0], label: r.label, hint: 'role' }))
    return [...userOpts, ...roleOpts].slice(0, 6)
  }, [members, user, mentionQuery, showMentionMenu])

  function applyMention(opt) {
    const replaced = input.replace(/@([a-zA-Z0-9_]*)$/, opt.raw + ' ')
    setInput(replaced)
    setShowMentionMenu(false)
    inputRef.current?.focus()
  }

  // ── Send text ───────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text) return
    const mentions = parseMentions(text, members)
    setInput('')
    setShowMentionMenu(false)

    const { data: msg } = await sendTextMessage(chatId, user.id, text, mentions)
    if (msg) {
      setMessages(prev => [...prev.filter(m => m.id !== msg.id), msg])
      // notify mention recipients
      const recipients = resolveMentionRecipients(mentions, members).filter(id => id !== user.id)
      for (const rid of recipients) {
        await createNotification(rid, 'mention', msg.id, {
          chat_id: chatId, chat_name: chat?.name || 'Chat',
          sender_name: user?.user_metadata?.display_name || user?.email,
          preview: text.slice(0, 80),
        })
      }
    }
  }

  // ── Send location ───────────────────────────────────────────────
  async function handleSendLocation(location, note) {
    setShowLocPicker(false)
    const { data: msg } = await sendLocationMessage(chatId, user.id, location, note)
    if (msg) setMessages(prev => [...prev.filter(m => m.id !== msg.id), msg])
  }

  // ── Tap a location bubble → route on the map ────────────────────
  function handleLocationTap(loc) {
    // /map?goto=lat,lng,name
    const q = new URLSearchParams({
      goto: `${loc.lat},${loc.lng}`,
      name: loc.name || 'Shared location',
    }).toString()
    navigate(`/map?${q}`)
  }

  // ── Render ──────────────────────────────────────────────────────
  if (!loading && !chat) {
    return (
      <div className="chats-page">
        <div className="chats-header">
          <button className="chats-back" onClick={() => navigate('/chats')}>←</button>
          <h1 className="chats-title">Not found</h1>
        </div>
        <p className="upv-empty" style={{ padding: 32 }}>Chat doesn't exist or you don't have access.</p>
      </div>
    )
  }

  const otherDirect = chat?.type === 'direct'
    ? members.find(m => m.user_id !== user?.id)?.profile
    : null
  const headerName  = chat?.type === 'group'
    ? `${chat.emoji || '👥'}  ${chat.name}`
    : otherDirect?.display_name || 'Chat'

  return (
    <div className="chatroom-page">

      {/* Header */}
      <div className="chatroom-header">
        <button className="chats-back" onClick={() => navigate('/chats')} aria-label="Back">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="chatroom-title-wrap">
          <p className="chatroom-title">{headerName}</p>
          {chat?.type === 'group' && (
            <p className="chatroom-sub">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        {chat?.type === 'group' && (
          <button className="chats-new-btn" onClick={() => setShowSettings(true)} title="Group settings">⚙️</button>
        )}
      </div>

      {/* Messages */}
      <div className="chatroom-body" ref={bodyRef}>
        {loading && <div className="chats-loading"><div className="friends-spinner" /></div>}
        {!loading && messages.length === 0 && (
          <p className="upv-empty" style={{ padding: 32 }}>No messages yet — say hi!</p>
        )}
        {messages.map(m => {
          const mine     = m.sender_id === user?.id
          const senderNm = m.sender?.display_name || 'Anonymous'
          const isSystem = m.type === 'system'
          if (isSystem) {
            return <p key={m.id} className="chatroom-system">{m.content}</p>
          }
          return (
            <div key={m.id} className={`chatroom-msg ${mine ? 'mine' : 'theirs'}`}>
              {!mine && chat?.type === 'group' && (
                <p className="chatroom-msg-sender">{senderNm}</p>
              )}
              {m.type === 'location' ? (
                <button className="chatroom-loc-card" onClick={() => handleLocationTap(m.location_data)}>
                  <span className="chatroom-loc-icon">📍</span>
                  <div>
                    <p className="chatroom-loc-name">{m.location_data?.name || 'Location'}</p>
                    {m.location_data?.address && <p className="chatroom-loc-addr">{m.location_data.address}</p>}
                    <p className="chatroom-loc-cta">Tap to navigate →</p>
                  </div>
                </button>
              ) : (
                <div className="chatroom-bubble">
                  <MessageText text={m.content} />
                </div>
              )}
              <p className="chatroom-time">{fmtMsgTime(m.created_at)}</p>
            </div>
          )
        })}
      </div>

      {/* Mention menu */}
      {showMentionMenu && mentionCandidates.length > 0 && (
        <div className="chatroom-mention-menu">
          {mentionCandidates.map(o => (
            <button key={`${o.kind}-${o.id}`} className="chatroom-mention-item" onClick={() => applyMention(o)}>
              {o.kind === 'user' && o.avatar
                ? <img src={o.avatar} alt="" className="person-avatar small" />
                : <span className="person-avatar small"><span>{o.kind === 'user' ? o.label.slice(0,2).toUpperCase() : o.label.slice(0,2)}</span></span>}
              <span className="chatroom-mention-label">{o.label}</span>
              <span className="chatroom-mention-hint">{o.hint}</span>
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="chatroom-composer">
        <button className="chatroom-attach" onClick={() => setShowLocPicker(true)} title="Send a place">📍</button>
        <input
          ref={inputRef}
          className="chatroom-input"
          type="text"
          placeholder="Type a message… (@name or @sport to mention)"
          value={input}
          onChange={handleInputChange}
          onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
        />
        <button className="chatroom-send" onClick={handleSend} disabled={!input.trim()}>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {showLocPicker && (
        <LocationPicker
          onClose={() => setShowLocPicker(false)}
          onSend={handleSendLocation}
        />
      )}

      {showSettings && chat?.type === 'group' && (
        <GroupSettingsModal
          chat={chat}
          members={members}
          isAdmin={isAdmin}
          myId={user.id}
          onClose={() => setShowSettings(false)}
          onUpdated={reload}
          onLeft={() => navigate('/chats')}
        />
      )}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────
function fmtMsgTime(ts) {
  if (!ts) return ''
  const d   = new Date(ts)
  const now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true })
    : d.toLocaleString('en-SG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
}

// Render text with @mention highlights
function MessageText({ text }) {
  if (!text) return null
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g)
  return parts.map((p, i) =>
    p.startsWith('@') ? <span key={i} className="chatroom-mention">{p}</span> : <span key={i}>{p}</span>
  )
}

// ── Location picker ─────────────────────────────────────────────────
// Lets user choose from saved facilities OR type a free-form name.
function LocationPicker({ onClose, onSend }) {
  const { user } = useAuth()
  const [facilities, setFacilities] = useState([])
  const [query, setQuery] = useState('')
  const [note,  setNote]  = useState('')

  useEffect(() => {
    (async () => {
      const { data: saved } = await supabase
        .from('saved_facilities')
        .select('facility_id, facilities(id, name, type, address, lat, lng)')
        .eq('user_id', user.id)
      const f1 = (saved || []).map(s => s.facilities).filter(Boolean)
      // also fetch a few default facilities so something always shows
      const { data: more } = await supabase
        .from('facilities').select('id, name, type, address, lat, lng').limit(20)
      const dedup = [...f1]
      for (const m of (more || [])) if (!dedup.find(x => x.id === m.id)) dedup.push(m)
      setFacilities(dedup)
    })()
  }, [user])

  const filtered = facilities.filter(f =>
    !query || f.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 25)

  return (
    <>
      <div className="upv-overlay" onClick={onClose} />
      <div className="loc-picker">
        <div className="new-group-header">
          <h2>📍 Share a Place</h2>
          <button className="upv-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: '12px 16px' }}>
          <input className="new-group-input" placeholder="Search facilities…"
            value={query} onChange={e => setQuery(e.target.value)} />
          <input className="new-group-input" style={{ marginTop: 8 }}
            placeholder="Add a note (optional)…"
            value={note} onChange={e => setNote(e.target.value)} maxLength={120} />
        </div>
        <div className="loc-picker-list">
          {filtered.length === 0 && <p className="upv-empty" style={{ padding: 16 }}>No matches.</p>}
          {filtered.map(f => (
            <button key={f.id} className="loc-picker-item"
              onClick={() => onSend({
                lat: f.lat, lng: f.lng, name: f.name, address: f.address, facility_id: f.id,
              }, note)}
            >
              <span style={{ fontSize: 18 }}>📍</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="chat-row-name">{f.name}</p>
                <p className="chat-row-preview">{(ROLE_LABEL[f.type] || f.type)}{f.address ? ` · ${f.address}` : ''}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
