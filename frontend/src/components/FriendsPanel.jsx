import { useState, useEffect } from 'react'
import '../styles/FriendsPanel.css'

export default function FriendsPanel({ groupChats, activeChat, onSelectChat }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredChats, setFilteredChats] = useState([])

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredChats(groupChats)
    } else {
      setFilteredChats(
        groupChats.filter((chat) =>
          chat.name?.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    }
  }, [groupChats, searchTerm])

  return (
    <div className="friends-panel">
      <div className="friends-header">
        <h3>Squads</h3>
        <span className="squad-count">{groupChats.length}</span>
      </div>

      {/* Search bar */}
      <input
        type="text"
        className="friends-search"
        placeholder="Search squads..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {/* Friends list */}
      <div className="friends-list">
        {filteredChats.length > 0 ? (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              className={`friend-item ${activeChat?.id === chat.id ? 'active' : ''}`}
              onClick={() => onSelectChat(chat)}
            >
              <div className="friend-avatar-container">
                {chat.avatar_url ? (
                  <img src={chat.avatar_url} alt={chat.name} className="friend-avatar" />
                ) : (
                  <div className="friend-avatar-placeholder">
                    {chat.name?.[0] || 'S'}
                  </div>
                )}
                {chat.unread_count > 0 && (
                  <span className="unread-badge">{chat.unread_count}</span>
                )}
              </div>

              <div className="friend-info">
                <div className="friend-name">{chat.name}</div>
                <div className="friend-last-msg">
                  {chat.last_message || 'No messages yet'}
                </div>
              </div>

              <div className="friend-meta">
                <span className="member-count">👥 {chat.member_ids?.length || 0}</span>
                {chat.last_message_at && (
                  <span className="last-msg-time">
                    {formatTime(new Date(chat.last_message_at))}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-friends">
            <p>No squads yet</p>
            <p>Match with players to start a squad!</p>
          </div>
        )}
      </div>
    </div>
  )
}

function formatTime(date) {
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`

  return date.toLocaleDateString()
}
