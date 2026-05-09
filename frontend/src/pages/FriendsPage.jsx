// src/pages/FriendsPage.jsx
//
// Nearby · Friends · Requests · Blocked tabs.
// Tap a person → opens UserProfileView modal with full actions.

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/useAuth'
import {
  fetchNearby, fetchFriendships, fetchProfiles, updateMyLocation,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest,
  removeFriend, blockUser, unblockUser, setMute,
  getOrCreateDirectChat, ROLE_LABEL,
} from '../utils/socialApi'
import UserProfileView from '../components/UserProfileView'

const TABS = [
  { value: 'nearby',   label: '📍 Nearby'   },
  { value: 'friends',  label: '🤝 Friends'  },
  { value: 'requests', label: '📨 Requests' },
  { value: 'blocked',  label: '🚫 Blocked'  },
]

function fmtDistance(km) {
  if (km == null) return ''
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

function fmtLastSeen(ts) {
  if (!ts) return 'a while ago'
  const min = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (min < 1)   return 'just now'
  if (min < 60)  return `${min} min ago`
  if (min < 1440) return `${Math.floor(min / 60)} hr ago`
  return `${Math.floor(min / 1440)} d ago`
}

export default function FriendsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [tab,         setTab]         = useState('nearby')
  const [loading,     setLoading]     = useState(true)
  const [nearby,      setNearby]      = useState([])
  const [friendships, setFriendships] = useState([])
  const [profileMap,  setProfileMap]  = useState({})
  const [viewingUser, setViewingUser] = useState(null)
  const [errMsg,      setErrMsg]      = useState(null)

  // ── Push my GPS up so others can find me ─────────────────────────
  useEffect(() => {
    if (!user) return
    navigator.geolocation?.getCurrentPosition(pos => {
      updateMyLocation(user.id, pos.coords.latitude, pos.coords.longitude)
    }, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 })
  }, [user])

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setErrMsg(null)

    // Friendships first (always)
    const { data: friRows } = await fetchFriendships(user.id)
    const fri = friRows || []
    setFriendships(fri)

    // All related profile ids
    const ids = new Set()
    fri.forEach(f => { ids.add(f.requester_id); ids.add(f.addressee_id) })
    ids.delete(user.id)

    // Nearby
    let nearbyList = []
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, maximumAge: 60000 })
      )
      const { data } = await fetchNearby(user.id, pos.coords.latitude, pos.coords.longitude, 10)
      nearbyList = data || []
      nearbyList.forEach(u => ids.add(u.id))
    } catch {
      // No GPS — show empty nearby gracefully
    }
    setNearby(nearbyList)

    // Profile map for everyone touched
    const { data: profs } = await fetchProfiles([...ids])
    const map = {}
    for (const p of (profs || [])) map[p.id] = p
    setProfileMap(map)
    setLoading(false)
  }, [user])

  useEffect(() => { loadAll() }, [loadAll])

  // Convenience helpers
  const myId = user?.id
  const friendsAccepted = friendships.filter(f => f.status === 'accepted')
  const friendIdSet     = new Set(friendsAccepted.map(f => (f.requester_id === myId ? f.addressee_id : f.requester_id)))

  const incomingRequests = friendships.filter(f => f.status === 'pending' && f.addressee_id === myId)
  const outgoingRequests = friendships.filter(f => f.status === 'pending' && f.requester_id === myId)
  const blockedRows      = friendships.filter(f => f.status === 'blocked' && f.requester_id === myId)
  const blockedSet       = new Set(blockedRows.map(f => f.addressee_id))

  // Other-side blocks against me
  const blockedMeSet     = new Set(friendships.filter(f => f.status === 'blocked' && f.addressee_id === myId).map(f => f.requester_id))

  // Filter "Nearby" to exclude existing friends, blocked, blocked-me
  const visibleNearby = nearby.filter(u =>
    !friendIdSet.has(u.id) && !blockedSet.has(u.id) && !blockedMeSet.has(u.id)
  )

  // ── Actions ──────────────────────────────────────────────────────
  async function handleSendRequest(otherId) {
    const { error } = await sendFriendRequest(myId, otherId)
    if (error) setErrMsg(error.message)
    await loadAll()
  }
  async function handleAccept(friendshipId) {
    await acceptFriendRequest(friendshipId)
    await loadAll()
  }
  async function handleDecline(friendshipId) {
    await declineFriendRequest(friendshipId)
    await loadAll()
  }
  async function handleRemove(friendshipId) {
    if (!confirm('Remove this friend?')) return
    await removeFriend(friendshipId)
    await loadAll()
  }
  async function handleBlock(otherId) {
    if (!confirm('Block this user? You will no longer see each other.')) return
    await blockUser(myId, otherId)
    await loadAll()
  }
  async function handleUnblock(friendshipId) {
    await unblockUser(friendshipId)
    await loadAll()
  }
  async function handleToggleMute(friendship) {
    const myMuted = friendship.requester_id === myId ? friendship.muted_by_req : friendship.muted_by_add
    await setMute(friendship, myId, !myMuted)
    await loadAll()
  }
  async function handleOpenChat(otherId) {
    const { data } = await getOrCreateDirectChat(myId, otherId)
    if (data?.id) navigate(`/chat/${data.id}`)
  }

  // ── Render helpers ───────────────────────────────────────────────
  function getStatusFor(otherId) {
    const f = friendships.find(fr =>
      (fr.requester_id === myId && fr.addressee_id === otherId) ||
      (fr.requester_id === otherId && fr.addressee_id === myId)
    )
    if (!f) return { kind: 'none' }
    if (f.status === 'accepted') return { kind: 'friend', friendship: f }
    if (f.status === 'pending')  return { kind: f.requester_id === myId ? 'sent' : 'incoming', friendship: f }
    if (f.status === 'blocked')  return { kind: f.requester_id === myId ? 'blocked' : 'blocked-me', friendship: f }
    return { kind: 'none' }
  }

  return (
    <div className="friends-page">
      <div className="friends-header">
        <button className="friends-back" onClick={() => navigate('/map')} aria-label="Back">
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="friends-title">Friends</h1>
        <button className="friends-chat-btn" onClick={() => navigate('/chats')} title="Chats">
          💬
        </button>
      </div>

      {/* Tabs */}
      <div className="friends-tabs">
        {TABS.map(t => {
          const badge =
            t.value === 'requests' && incomingRequests.length > 0 ? incomingRequests.length :
            t.value === 'blocked'  && blockedRows.length      > 0 ? blockedRows.length      :
            null
          return (
            <button
              key={t.value}
              className={`friends-tab${tab === t.value ? ' active' : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
              {badge != null && <span className="friends-tab-badge">{badge}</span>}
            </button>
          )
        })}
      </div>

      {errMsg && <p className="friends-error">{errMsg}</p>}

      <div className="friends-list">
        {loading ? (
          <div className="friends-loading"><div className="friends-spinner" /></div>
        ) : (
          <>
            {/* ── Nearby ───────────────────────────────────────── */}
            {tab === 'nearby' && (
              <>
                {visibleNearby.length === 0 ? (
                  <EmptyState icon="🔍" title="No-one nearby"
                    sub="Open the map and tap around — others appear here when they share location." />
                ) : visibleNearby.map(p => {
                  const st = getStatusFor(p.id)
                  return (
                    <PersonCard
                      key={p.id}
                      person={p}
                      subtitle={`${fmtDistance(p.distKm)} away · ${fmtLastSeen(p.last_seen)}`}
                      status={st}
                      onView={() => setViewingUser(p)}
                      onAdd={() => handleSendRequest(p.id)}
                      onChat={() => handleOpenChat(p.id)}
                    />
                  )
                })}
              </>
            )}

            {/* ── Friends ──────────────────────────────────────── */}
            {tab === 'friends' && (
              <>
                {friendsAccepted.length === 0 ? (
                  <EmptyState icon="🤝" title="No friends yet"
                    sub="Find people on the Nearby tab and send a request." />
                ) : friendsAccepted.map(f => {
                  const otherId = f.requester_id === myId ? f.addressee_id : f.requester_id
                  const p = profileMap[otherId]
                  if (!p) return null
                  const myMuted = f.requester_id === myId ? f.muted_by_req : f.muted_by_add
                  return (
                    <PersonCard
                      key={f.id}
                      person={p}
                      subtitle={(p.favorite_types || []).slice(0, 3).map(t => ROLE_LABEL[t] || t).join(' · ') || 'Friend'}
                      status={{ kind: 'friend', friendship: f }}
                      muted={myMuted}
                      onView={() => setViewingUser(p)}
                      onChat={() => handleOpenChat(otherId)}
                      onMute={() => handleToggleMute(f)}
                      onRemove={() => handleRemove(f.id)}
                      onBlock={() => handleBlock(otherId)}
                    />
                  )
                })}
              </>
            )}

            {/* ── Requests ────────────────────────────────────── */}
            {tab === 'requests' && (
              <>
                {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                  <EmptyState icon="📨" title="No pending requests" sub="Friend requests show up here." />
                )}
                {incomingRequests.length > 0 && (
                  <>
                    <p className="friends-section-label">Incoming ({incomingRequests.length})</p>
                    {incomingRequests.map(f => {
                      const p = profileMap[f.requester_id]
                      if (!p) return null
                      return (
                        <PersonCard
                          key={f.id} person={p}
                          subtitle="Wants to be friends"
                          status={{ kind: 'incoming', friendship: f }}
                          onView={() => setViewingUser(p)}
                          onAccept={() => handleAccept(f.id)}
                          onDecline={() => handleDecline(f.id)}
                        />
                      )
                    })}
                  </>
                )}
                {outgoingRequests.length > 0 && (
                  <>
                    <p className="friends-section-label" style={{ marginTop: 12 }}>Sent ({outgoingRequests.length})</p>
                    {outgoingRequests.map(f => {
                      const p = profileMap[f.addressee_id]
                      if (!p) return null
                      return (
                        <PersonCard
                          key={f.id} person={p}
                          subtitle="Awaiting response"
                          status={{ kind: 'sent', friendship: f }}
                          onView={() => setViewingUser(p)}
                          onCancel={() => handleDecline(f.id)}
                        />
                      )
                    })}
                  </>
                )}
              </>
            )}

            {/* ── Blocked ──────────────────────────────────────── */}
            {tab === 'blocked' && (
              <>
                {blockedRows.length === 0 ? (
                  <EmptyState icon="🚫" title="No blocked users"
                    sub="People you block won't see your profile or chat with you." />
                ) : blockedRows.map(f => {
                  const p = profileMap[f.addressee_id]
                  if (!p) return null
                  return (
                    <PersonCard
                      key={f.id} person={p}
                      subtitle="Blocked"
                      status={{ kind: 'blocked', friendship: f }}
                      onUnblock={() => handleUnblock(f.id)}
                    />
                  )
                })}
              </>
            )}
          </>
        )}
      </div>

      {viewingUser && (
        <UserProfileView
          person={viewingUser}
          status={getStatusFor(viewingUser.id)}
          onClose={() => setViewingUser(null)}
          onAdd={() => { handleSendRequest(viewingUser.id); setViewingUser(null) }}
          onAccept={f => { handleAccept(f.id); setViewingUser(null) }}
          onDecline={f => { handleDecline(f.id); setViewingUser(null) }}
          onCancel={f => { handleDecline(f.id); setViewingUser(null) }}
          onChat={() => { handleOpenChat(viewingUser.id); setViewingUser(null) }}
          onRemove={f => { handleRemove(f.id); setViewingUser(null) }}
          onBlock={() => { handleBlock(viewingUser.id); setViewingUser(null) }}
          onUnblock={f => { handleUnblock(f.id); setViewingUser(null) }}
          onToggleMute={f => handleToggleMute(f)}
        />
      )}
    </div>
  )
}

// ── Helper components ───────────────────────────────────────────────
function EmptyState({ icon, title, sub }) {
  return (
    <div className="friends-empty">
      <p className="friends-empty-icon">{icon}</p>
      <p className="friends-empty-title">{title}</p>
      <p className="friends-empty-sub">{sub}</p>
    </div>
  )
}

function PersonCard({
  person, subtitle, status, muted,
  onView, onAdd, onAccept, onDecline, onCancel, onChat,
  onMute, onRemove, onBlock, onUnblock,
}) {
  const initials = (person.display_name || '?').slice(0, 2).toUpperCase()
  return (
    <div className="person-card">
      <button className="person-card-main" onClick={onView}>
        <div className="person-avatar">
          {person.avatar_url
            ? <img src={person.avatar_url} alt="" />
            : <span>{initials}</span>}
          {muted && <span className="person-mute-dot" title="Muted">🔕</span>}
        </div>
        <div className="person-info">
          <p className="person-name">{person.display_name || 'Anonymous'}</p>
          <p className="person-sub">{subtitle}</p>
        </div>
      </button>
      <div className="person-actions">
        {status.kind === 'none' && onAdd && (
          <button className="person-btn primary" onClick={onAdd}>+ Add</button>
        )}
        {status.kind === 'sent' && (
          <button className="person-btn ghost" onClick={() => onCancel?.(status.friendship)}>Cancel</button>
        )}
        {status.kind === 'incoming' && (
          <>
            <button className="person-btn primary"
              onClick={() => onAccept?.(status.friendship)}>Accept</button>
            <button className="person-btn ghost"
              onClick={() => onDecline?.(status.friendship)}>×</button>
          </>
        )}
        {status.kind === 'friend' && (
          <>
            {onChat && <button className="person-btn primary" onClick={onChat}>💬</button>}
            {onMute && <button className="person-btn ghost" onClick={onMute} title={muted ? 'Unmute' : 'Mute'}>{muted ? '🔔' : '🔕'}</button>}
            {onRemove && <button className="person-btn ghost" onClick={onRemove} title="Remove">🗑️</button>}
            {onBlock && <button className="person-btn danger" onClick={onBlock} title="Block">🚫</button>}
          </>
        )}
        {status.kind === 'blocked' && onUnblock && (
          <button className="person-btn ghost" onClick={onUnblock}>Unblock</button>
        )}
      </div>
    </div>
  )
}
