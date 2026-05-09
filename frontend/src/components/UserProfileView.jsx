// src/components/UserProfileView.jsx
// Modal panel that shows another user's profile + contextual actions.

import { ROLE_LABEL } from '../utils/socialApi'

export default function UserProfileView({
  person, status,
  onClose, onAdd, onAccept, onDecline, onCancel, onChat,
  onRemove, onBlock, onUnblock, onToggleMute,
}) {
  if (!person) return null
  const initials = (person.display_name || '?').slice(0, 2).toUpperCase()
  const fav = person.favorite_types || []
  const myMuted =
    status?.kind === 'friend'
      ? (status.friendship.requester_id === person.id ? status.friendship.muted_by_add : status.friendship.muted_by_req)
      : false

  return (
    <>
      <div className="upv-overlay" onClick={onClose} />
      <div className="upv-panel" role="dialog" aria-label={`${person.display_name || 'User'} profile`}>

        <button className="upv-close" onClick={onClose} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>

        <div className="upv-hero">
          {person.avatar_url
            ? <img src={person.avatar_url} alt="" className="upv-avatar" />
            : <div className="upv-avatar upv-avatar-initials">{initials}</div>}
          <h2 className="upv-name">{person.display_name || 'Anonymous'}</h2>
          {status?.kind === 'friend'    && <p className="upv-relation">🤝 Friend</p>}
          {status?.kind === 'sent'      && <p className="upv-relation">📤 Request sent</p>}
          {status?.kind === 'incoming'  && <p className="upv-relation">📥 Wants to be friends</p>}
          {status?.kind === 'blocked'   && <p className="upv-relation">🚫 Blocked</p>}
          {status?.kind === 'blocked-me'&& <p className="upv-relation">⚠️ Unavailable</p>}
        </div>

        <div className="upv-body">
          {person.bio && (
            <div className="upv-section">
              <p className="upv-section-label">About</p>
              <p className="upv-bio">{person.bio}</p>
            </div>
          )}

          {fav.length > 0 && (
            <div className="upv-section">
              <p className="upv-section-label">Hobbies & Interests</p>
              <div className="upv-tags">
                {fav.map(t => (
                  <span key={t} className="upv-tag">{ROLE_LABEL[t] || t}</span>
                ))}
              </div>
            </div>
          )}

          {!person.bio && fav.length === 0 && (
            <p className="upv-empty">This user hasn't filled in their profile yet.</p>
          )}
        </div>

        <div className="upv-actions">
          {status?.kind === 'none' && onAdd && (
            <button className="upv-action primary" onClick={onAdd}>➕ Add Friend</button>
          )}
          {status?.kind === 'sent' && (
            <button className="upv-action ghost"
              onClick={() => onCancel?.(status.friendship)}>Cancel Request</button>
          )}
          {status?.kind === 'incoming' && (
            <>
              <button className="upv-action primary"
                onClick={() => onAccept?.(status.friendship)}>✓ Accept</button>
              <button className="upv-action ghost"
                onClick={() => onDecline?.(status.friendship)}>Decline</button>
            </>
          )}
          {status?.kind === 'friend' && (
            <>
              <button className="upv-action primary" onClick={onChat}>💬 Chat</button>
              <button className="upv-action ghost"
                onClick={() => onToggleMute?.(status.friendship)}>
                {myMuted ? '🔔 Unmute' : '🔕 Mute'}
              </button>
              <button className="upv-action ghost"
                onClick={() => onRemove?.(status.friendship)}>🗑️ Remove</button>
              <button className="upv-action danger" onClick={onBlock}>🚫 Block</button>
            </>
          )}
          {status?.kind === 'blocked' && (
            <button className="upv-action ghost"
              onClick={() => onUnblock?.(status.friendship)}>Unblock</button>
          )}
        </div>
      </div>
    </>
  )
}
