// src/pages/ChatListPage.jsx
// Lists all chats (direct + group) for the current user.
// "+" button opens a New-Group modal.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/useAuth'
import {
  fetchMyChats, fetchFriendships, fetchProfiles, createGroupChat,
} from '../utils/socialApi'

const GROUP_EMOJIS = ['👥','🏀','🏸','🎾','⚽','🏃','🚴','🏊','💪','🎯','🔥','🌟','🎉','🚀']

function fmtTime(ts) {
  if (!ts) return ''
  const d   = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true })
  const ms = (now - d) / 86400000
  if (ms < 7) return d.toLocaleDateString('en-SG', { weekday: 'short' })
  return d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' })
}

export default function ChatListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [chats,   setChats]   = useState([])
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await fetchMyChats(user.id)
    setChats(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  function chatLabel(chat) {
    if (chat.type === 'group') return chat.name || 'Group'
    const other = chat.members?.find(m => m.user_id !== user.id)
    return other?.profile?.display_name || 'Chat'
  }
  function chatEmoji(chat) {
    if (chat.type === 'group') return chat.emoji || '👥'
    return null
  }
  function chatAvatar(chat) {
    if (chat.type !== 'direct') return null
    return chat.members?.find(m => m.user_id !== user.id)?.profile?.avatar_url || null
  }

  return (
    <div className="chats-page">
      <div className="chats-header">
        <button className="chats-back" onClick={() => navigate('/map')} aria-label="Back">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="chats-title">Chats</h1>
        <button className="chats-new-btn" onClick={() => setShowNew(true)} title="New Group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 4v16m8-8H4"/>
          </svg>
        </button>
      </div>

      <div className="chats-list">
        {loading && <div className="chats-loading"><div className="friends-spinner" /></div>}

        {!loading && chats.length === 0 && (
          <div className="friends-empty">
            <p className="friends-empty-icon">💬</p>
            <p className="friends-empty-title">No chats yet</p>
            <p className="friends-empty-sub">Tap a friend to start chatting, or + to create a group.</p>
          </div>
        )}

        {!loading && chats.map(c => {
          const avatar = chatAvatar(c)
          const emoji  = chatEmoji(c)
          const last   = c.lastMessage
          const isUnread = last && c.lastReadAt && new Date(last.created_at) > new Date(c.lastReadAt)
          return (
            <button key={c.id} className="chat-row" onClick={() => navigate(`/chat/${c.id}`)}>
              <div className="chat-row-avatar">
                {avatar
                  ? <img src={avatar} alt="" />
                  : <span className="chat-row-emoji">{emoji || (chatLabel(c).slice(0, 2).toUpperCase())}</span>}
              </div>
              <div className="chat-row-body">
                <div className="chat-row-top">
                  <p className={`chat-row-name${isUnread ? ' unread' : ''}`}>{chatLabel(c)}</p>
                  <span className="chat-row-time">{fmtTime(last?.created_at || c.created_at)}</span>
                </div>
                <p className={`chat-row-preview${isUnread ? ' unread' : ''}`}>
                  {last
                    ? last.type === 'location'
                      ? '📍 Shared a location'
                      : last.content || ''
                    : c.type === 'group' ? `${c.members.length} member${c.members.length !== 1 ? 's' : ''}` : 'Tap to start chatting'}
                </p>
              </div>
              {isUnread && <span className="chat-row-dot" />}
            </button>
          )
        })}
      </div>

      {showNew && (
        <NewGroupModal
          myId={user.id}
          onClose={() => setShowNew(false)}
          onCreated={(chatId) => { setShowNew(false); navigate(`/chat/${chatId}`) }}
        />
      )}
    </div>
  )
}

// ── New-Group modal ────────────────────────────────────────────────
function NewGroupModal({ myId, onClose, onCreated }) {
  const [name,    setName]    = useState('')
  const [emoji,   setEmoji]   = useState('👥')
  const [friends, setFriends] = useState([])
  const [picked,  setPicked]  = useState(new Set())
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState(null)

  useEffect(() => {
    (async () => {
      const { data } = await fetchFriendships(myId)
      const accepted = (data || []).filter(f => f.status === 'accepted')
      const ids = accepted.map(f => f.requester_id === myId ? f.addressee_id : f.requester_id)
      const { data: profs } = await fetchProfiles(ids)
      setFriends(profs || [])
    })()
  }, [myId])

  function toggle(id) {
    setPicked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleCreate() {
    if (!name.trim()) { setErr('Give your group a name'); return }
    setBusy(true)
    const { data, error } = await createGroupChat(myId, name, emoji, [...picked])
    setBusy(false)
    if (error) { setErr(error.message); return }
    onCreated(data.id)
  }

  return (
    <>
      <div className="upv-overlay" onClick={onClose} />
      <div className="new-group-modal" role="dialog" aria-label="New group">
        <div className="new-group-header">
          <h2>New Group</h2>
          <button className="upv-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="new-group-body">
          <p className="new-group-label">Picture</p>
          <div className="new-group-emoji-row">
            {GROUP_EMOJIS.map(e => (
              <button key={e}
                className={`new-group-emoji${emoji === e ? ' active' : ''}`}
                onClick={() => setEmoji(e)}>{e}</button>
            ))}
          </div>

          <p className="new-group-label">Name</p>
          <input className="new-group-input"
            placeholder="e.g. Tampines Ballers"
            value={name} onChange={e => setName(e.target.value)} maxLength={50} />

          <p className="new-group-label">Add friends ({picked.size})</p>
          <div className="new-group-friend-list">
            {friends.length === 0 && (
              <p className="upv-empty" style={{ padding: 12 }}>No friends yet — add some first.</p>
            )}
            {friends.map(f => {
              const checked = picked.has(f.id)
              return (
                <label key={f.id} className="new-group-friend">
                  <input type="checkbox" checked={checked} onChange={() => toggle(f.id)} />
                  <div className="person-avatar small">
                    {f.avatar_url
                      ? <img src={f.avatar_url} alt="" />
                      : <span>{(f.display_name || '?').slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <span className="new-group-friend-name">{f.display_name || 'Anonymous'}</span>
                </label>
              )
            })}
          </div>

          {err && <p className="friends-error">{err}</p>}
        </div>

        <div className="new-group-actions">
          <button className="upv-action ghost" onClick={onClose}>Cancel</button>
          <button className="upv-action primary" onClick={handleCreate} disabled={busy}>
            {busy ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </>
  )
}
