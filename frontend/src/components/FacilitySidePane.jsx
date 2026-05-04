import { useState } from 'react'
import '../index.css' // Or wherever the styles are, we will add them to index.css

const TYPE_COLOURS = {
  fitness_corner: '#22d3ee', playground: '#4ade80', basketball_court: '#f97316',
  badminton_court: '#a78bfa', tennis_court: '#fbbf24', swimming_pool: '#38bdf8',
  multi_purpose_court: '#f472b6', gym: '#fb923c', jogging_track: '#86efac',
  sheltered_pavilion: '#94a3b8',
}

function formatType(t) {
  return (t || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function FacilitySidePane({ facility, onClose, onNavigateTo, user, isSaved, onSaveToggle }) {
  const [activeTab, setActiveTab] = useState('overview')

  if (!facility) return null

  return (
    <div className="side-pane">
      <button className="side-pane-close" onClick={onClose}>✕</button>
      
      <div className="side-pane-image">
        <span className="image-placeholder-text">📸 No photos yet</span>
      </div>

      <div className="side-pane-content">
        <h2 className="side-pane-title">{facility.name}</h2>
        <div className="side-pane-rating">
          <span className="rating-score">4.2</span>
          <span className="rating-stars">★★★★☆</span>
          <span className="rating-count">(18)</span>
          <span className="rating-price">· Free</span>
        </div>
        <p className="side-pane-type" style={{ color: TYPE_COLOURS[facility.type] || '#6366f1' }}>
          {formatType(facility.type)}
          {facility.is_verified === false && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>★ Community spot</span>}
        </p>

        <div className="side-pane-tabs">
          <button className={`side-pane-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={`side-pane-tab ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>Reviews</button>
          <button className={`side-pane-tab ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')}>About</button>
        </div>

        <div className="side-pane-actions">
          <button className="side-pane-action-btn" onClick={() => { onNavigateTo?.(facility); onClose(); }}>
            <div className="side-pane-action-icon" style={{ background: '#0ea5e9' }}>🚌</div>
            <span>Directions</span>
          </button>
          <button className="side-pane-action-btn" onClick={() => onSaveToggle?.(facility)}>
            <div className="side-pane-action-icon" style={{ background: isSaved ? '#f43f5e' : '#334155' }}>{isSaved ? '❤️' : '🤍'}</div>
            <span>Save</span>
          </button>
          <button className="side-pane-action-btn">
            <div className="side-pane-action-icon" style={{ background: '#334155' }}>📱</div>
            <span>Send to phone</span>
          </button>
          <button className="side-pane-action-btn">
            <div className="side-pane-action-icon" style={{ background: '#334155' }}>🔗</div>
            <span>Share</span>
          </button>
        </div>

        <div className="side-pane-tab-content">
          {activeTab === 'overview' && (
            <>
              <div className="side-pane-info-row">
                <span className="side-pane-info-icon">📍</span>
                <span className="side-pane-info-text">{facility.address || 'Tampines, Singapore'}</span>
              </div>
              <div className="side-pane-info-row">
                <span className="side-pane-info-icon">🕒</span>
                <span className="side-pane-info-text" style={{ color: '#10b981' }}>Open 24 Hours</span>
              </div>
              {(facility.is_sheltered || facility.is_indoor) && (
                <div className="side-pane-info-row">
                  <span className="side-pane-info-icon">✨</span>
                  <span className="side-pane-info-text">
                    {facility.is_sheltered && "Sheltered"}
                    {facility.is_indoor && (facility.is_sheltered ? ' · Indoor' : 'Indoor')}
                  </span>
                </div>
              )}
            </>
          )}

          {activeTab === 'reviews' && (
            <>
              {user ? (
                <div className="side-pane-review-input-container">
                  <input type="text" placeholder="Share your experience..." className="side-pane-review-input" />
                  <button className="side-pane-post-review-btn">Post</button>
                </div>
              ) : (
                <p className="side-pane-login-prompt">Log in to post a review.</p>
              )}
              
              <div className="side-pane-review-card">
                <div className="side-pane-review-header">
                  <div className="side-pane-reviewer-avatar">JD</div>
                  <div>
                    <p className="side-pane-reviewer-name">John D.</p>
                    <p className="side-pane-reviewer-stars">★★★★★ <span className="side-pane-review-time">2 months ago</span></p>
                  </div>
                </div>
                <p className="side-pane-review-body">Great courts, usually empty in the mornings! Very clean and well maintained.</p>
              </div>
            </>
          )}

          {activeTab === 'about' && (
            <>
              <h3 style={{ fontSize: '14px', marginBottom: '8px', color: '#e2e8f0' }}>About this facility</h3>
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                This is a public {formatType(facility.type).toLowerCase()} located in Tampines. 
                Maintained by the town council, it is available for residents to use on a first-come, first-served basis.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
