// src/components/GroupSettingsModal.jsx
//
// Tabs: Info · Members · My Roles
//   - Info     → name + emoji "picture" (admin-only edit)
//   - Members  → kick / transfer admin (admin-only); member can leave
//   - My Roles → self-assign sport/hobby tags (anyone can set their own)

import { useEffect, useState } from 'react'
import {
  HOBBY_ROLES, ROLE_LABEL,
  updateGroupInfo, addGroupMember, removeGroupMember,
  transferAdmin, setMyRoles, fetchFriendships, fetchProfiles,
} from '../utils/socialApi'

const GROUP_EMOJIS = ['👥','🏀','🏸','🎾','⚽','🏃','🚴','🏊','💪','🎯','🔥','🌟','🎉','🚀','🏆','🌳']

const TABS = [
  { value: 'info',    label: 'Info'     },
  { value: 'members', label: 'Members'  },
  { value: 'roles',   label: 'My Roles' },
]

export default function GroupSettingsModal({ chat, members, isAdmin, myId, onClose, onUpdated, onLeft }) {
  const [tab,  setTab]  = useState('info')

  return (
    <>
      <div className="upv-overlay" onClick={onClose} />
      <div className="group-settings-modal">
        <div className="new-group-header">
          <h2>{chat.emoji} {chat.name}</h2>
          <button className="upv-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="group-settings-tabs">
          {TABS.map(t => (
            <button key={t.value}
              className={`friends-tab${tab === t.value ? ' active' : ''}`}
              onClick={() => setTab(t.value)}>{t.label}</button>
          ))}
        </div>

        {tab === 'info'    && <InfoTab    chat={chat} isAdmin={isAdmin} onUpdated={onUpdated} />}
        {tab === 'members' && <MembersTab chat={chat} members={members} isAdmin={isAdmin} myId={myId}
                                          onUpdated={onUpdated} onLeft={onLeft} />}
        {tab === 'roles'   && <RolesTab   members={members} myId={myId} onUpdated={onUpdated} />}
      </div>
    </>
  )
}

// ── Info ──────────────────────────────────────────────────────────
function InfoTab({ chat, isAdmin, onUpdated }) {
  const [name,  setName]  = useState(chat.name || '')
  const [emoji, setEmoji] = useState(chat.emoji || '👥')
  const [busy,  setBusy]  = useState(false)
  const [msg,   setMsg]   = useState(null)

  async function save() {
    setBusy(true)
    const { error } = await updateGroupInfo(chat.id, { name: name.trim() || 'Group', emoji })
    setBusy(false)
    setMsg(error ? error.message : 'Saved')
    setTimeout(() => setMsg(null), 1800)
    if (!error) onUpdated?.()
  }

  return (
    <div style={{ padding: 16 }}>
      <p className="new-group-label">Group Picture</p>
      <div className="new-group-emoji-row">
        {GROUP_EMOJIS.map(e => (
          <button key={e}
            className={`new-group-emoji${emoji === e ? ' active' : ''}`}
            disabled={!isAdmin}
            onClick={() => setEmoji(e)}>{e}</button>
        ))}
      </div>

      <p className="new-group-label">Group Name</p>
      <input className="new-group-input"
        value={name} onChange={e => setName(e.target.value)}
        disabled={!isAdmin} maxLength={50} />

      {!isAdmin && (
        <p className="upv-empty" style={{ marginTop: 12 }}>Only the admin can edit group info.</p>
      )}

      {isAdmin && (
        <button className="upv-action primary" style={{ marginTop: 14 }} onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      )}
      {msg && <p className="friends-section-label" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  )
}

// ── Members ───────────────────────────────────────────────────────
function MembersTab({ chat, members, isAdmin, myId, onUpdated, onLeft }) {
  const [showAdd, setShowAdd] = useState(false)
  const myMember = members.find(m => m.user_id === myId)

  async function kick(member) {
    if (!confirm(`Remove ${member.profile?.display_name || 'this member'} from the group?`)) return
    await removeGroupMember(member.id)
    onUpdated?.()
  }
  async function makeAdmin(member) {
    if (!confirm(`Make ${member.profile?.display_name} the new admin? You will become a regular member.`)) return
    await transferAdmin(myMember.id, member.id)
    onUpdated?.()
  }
  async function leave() {
    if (!confirm('Leave this group?')) return
    await removeGroupMember(myMember.id)
    onLeft?.()
  }

  return (
    <div style={{ padding: 8 }}>
      {isAdmin && (
        <button className="upv-action ghost" style={{ width: '100%', marginBottom: 8 }}
          onClick={() => setShowAdd(true)}>➕ Add a friend</button>
      )}

      {members.map(m => {
        const me = m.user_id === myId
        const adminTag = m.role === 'admin'
        return (
          <div key={m.id} className="person-card" style={{ marginBottom: 6 }}>
            <div className="person-card-main">
              <div className="person-avatar">
                {m.profile?.avatar_url
                  ? <img src={m.profile.avatar_url} alt="" />
                  : <span>{(m.profile?.display_name || '?').slice(0, 2).toUpperCase()}</span>}
              </div>
              <div className="person-info">
                <p className="person-name">
                  {m.profile?.display_name || 'Anonymous'}{me ? ' (you)' : ''}
                  {adminTag && <span className="member-admin-tag"> 👑 Admin</span>}
                </p>
                <p className="person-sub">
                  {(m.roles || []).map(r => ROLE_LABEL[r] || r).join(' · ') || 'No roles'}
                </p>
              </div>
            </div>
            <div className="person-actions">
              {isAdmin && !me && m.role !== 'admin' && (
                <>
                  <button className="person-btn ghost" onClick={() => makeAdmin(m)} title="Make admin">👑</button>
                  <button className="person-btn danger" onClick={() => kick(m)} title="Remove">🗑️</button>
                </>
              )}
              {me && !isAdmin && (
                <button className="person-btn danger" onClick={leave}>Leave</button>
              )}
            </div>
          </div>
        )
      })}

      {isAdmin && showAdd && (
        <AddMemberPicker
          chatId={chat.id} myId={myId} excludeIds={members.map(m => m.user_id)}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); onUpdated?.() }}
        />
      )}
    </div>
  )
}

function AddMemberPicker({ chatId, myId, excludeIds, onClose, onAdded }) {
  const [friends, setFriends] = useState([])
  const [busy,    setBusy]    = useState(false)
  const excludeSet = new Set(excludeIds)

  useEffect(() => {
    (async () => {
      const { data } = await fetchFriendships(myId)
      const accepted = (data || []).filter(f => f.status === 'accepted')
      const ids = accepted.map(f => f.requester_id === myId ? f.addressee_id : f.requester_id)
                         .filter(id => !excludeSet.has(id))
      const { data: profs } = await fetchProfiles(ids)
      setFriends(profs || [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId])

  async function add(id) {
    setBusy(true)
    await addGroupMember(chatId, id)
    setBusy(false)
    onAdded?.()
  }

  return (
    <>
      <div className="upv-overlay" onClick={onClose} />
      <div className="loc-picker">
        <div className="new-group-header">
          <h2>Add to Group</h2>
          <button className="upv-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="loc-picker-list">
          {friends.length === 0 && (
            <p className="upv-empty" style={{ padding: 16 }}>No friends available to add.</p>
          )}
          {friends.map(f => (
            <button key={f.id} className="loc-picker-item" onClick={() => add(f.id)} disabled={busy}>
              <div className="person-avatar small">
                {f.avatar_url
                  ? <img src={f.avatar_url} alt="" />
                  : <span>{(f.display_name || '?').slice(0, 2).toUpperCase()}</span>}
              </div>
              <span className="chat-row-name" style={{ flex: 1 }}>{f.display_name || 'Anonymous'}</span>
              <span className="upv-action ghost" style={{ padding: '4px 10px' }}>+ Add</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── My Roles ──────────────────────────────────────────────────────
function RolesTab({ members, myId, onUpdated }) {
  const me = members.find(m => m.user_id === myId)
  const [picked, setPicked] = useState(new Set(me?.roles || []))
  const [busy,   setBusy]   = useState(false)
  const [msg,    setMsg]    = useState(null)

  function toggle(role) {
    setPicked(prev => {
      const next = new Set(prev)
      next.has(role) ? next.delete(role) : next.add(role)
      return next
    })
  }

  async function save() {
    if (!me) return
    setBusy(true)
    await setMyRoles(me.id, [...picked])
    setBusy(false)
    setMsg('Saved')
    setTimeout(() => setMsg(null), 1500)
    onUpdated?.()
  }

  return (
    <div style={{ padding: 16 }}>
      <p className="upv-section-label" style={{ margin: 0 }}>
        Pick the sports / hobbies you want to be tagged for in this group.
      </p>
      <p className="friends-section-label" style={{ margin: '4px 0 12px' }}>
        Others can mention <span className="chatroom-mention">@basketball</span> and everyone with that role gets notified.
      </p>

      <div className="upv-tags" style={{ gap: 8 }}>
        {HOBBY_ROLES.map(r => {
          const active = picked.has(r.value)
          return (
            <button key={r.value}
              className={`profile-fav-pill${active ? ' active' : ''}`}
              onClick={() => toggle(r.value)}>{r.label}</button>
          )
        })}
      </div>

      <button className="upv-action primary" style={{ marginTop: 14, width: '100%' }} onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save Roles'}
      </button>
      {msg && <p className="friends-section-label" style={{ marginTop: 8, textAlign: 'center' }}>{msg}</p>}
    </div>
  )
}
