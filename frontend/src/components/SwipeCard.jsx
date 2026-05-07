import { useState, useRef, useEffect } from 'react'
import { supabase } from '../utils/supabaseClient'
import '../styles/SwipeCard.css'

export default function SwipeCard({ players, currentUserId, userVibe, onMatch }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [cards, setCards] = useState([])
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)
  const cardRef = useRef(null)

  useEffect(() => {
    if (players.length > 0) {
      setCards(players)
      setCurrentIndex(0)
    }
  }, [players])

  const currentPlayer = cards[currentIndex]

  const handleSwipe = async (direction) => {
    if (!currentPlayer) return

    // Record the interaction
    try {
      await supabase.from('player_interactions').insert({
        user_id: currentUserId,
        target_user_id: currentPlayer.id,
        interaction_type: direction, // 'like' or 'skip'
        created_at: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Error recording interaction:', err)
    }

    // Move to next card
    if (direction === 'like') {
      onMatch(currentPlayer)
      // Could trigger group chat creation here
    }

    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1)
      // Trigger card animation
      if (cardRef.current) {
        cardRef.current.classList.add(direction === 'like' ? 'swipe-right' : 'swipe-left')
        setTimeout(() => {
          cardRef.current?.classList.remove('swipe-right', 'swipe-left')
        }, 300)
      }
    }
  }

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = (e) => {
    setTouchEnd(e.changedTouches[0].clientX)
    detectSwipe(e.changedTouches[0].clientX)
  }

  const detectSwipe = (endX) => {
    const difference = touchStart - endX
    const isLeftSwipe = difference > 50
    const isRightSwipe = difference < -50

    if (isLeftSwipe) {
      handleSwipe('skip')
    } else if (isRightSwipe) {
      handleSwipe('like')
    }
  }

  if (!currentPlayer) {
    return (
      <div className="swipe-card-container">
        <div className="no-cards">
          <p>🎉 You've seen everyone!</p>
          <p>Check back soon for new players.</p>
        </div>
      </div>
    )
  }

  const skillColor = {
    beginner: '#4CAF50',
    intermediate: '#FF9800',
    advanced: '#F44336',
  }

  const distanceInKm = currentPlayer.distance_km || Math.random() * 10

  return (
    <div className="swipe-card-container">
      <div
        className="swipe-card"
        ref={cardRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Card Header with Avatar */}
        <div className="card-header">
          {currentPlayer.avatar_url ? (
            <img
              src={currentPlayer.avatar_url}
              alt={currentPlayer.display_name}
              className="card-avatar"
            />
          ) : (
            <div className="card-avatar-placeholder">
              {currentPlayer.display_name?.[0] || 'P'}
            </div>
          )}
        </div>

        {/* Card Content */}
        <div className="card-content">
          <div className="card-title">
            <h3>{currentPlayer.display_name || 'Player'}</h3>
            <span className="card-distance">
              📍 {distanceInKm.toFixed(1)} km away
            </span>
          </div>

          {/* Player Stats */}
          <div className="card-stats">
            {/* Skill Level */}
            {currentPlayer.skill_level && (
              <div className="stat-item">
                <span className="stat-label">Skill Level:</span>
                <span
                  className="stat-value skill-badge"
                  style={{ backgroundColor: skillColor[currentPlayer.skill_level] || '#999' }}
                >
                  {currentPlayer.skill_level.charAt(0).toUpperCase() +
                    currentPlayer.skill_level.slice(1)}
                </span>
              </div>
            )}

            {/* Vibe Preference */}
            {currentPlayer.vibe && (
              <div className="stat-item">
                <span className="stat-label">Vibe:</span>
                <span className="stat-value">
                  {currentPlayer.vibe === 'casual'
                    ? '🎉 Casual'
                    : currentPlayer.vibe === 'competitive'
                      ? '⚡ Competitive'
                      : '🤝 Social'}
                </span>
              </div>
            )}

            {/* Group Size */}
            {currentPlayer.group_size && (
              <div className="stat-item">
                <span className="stat-label">Group Size:</span>
                <span className="stat-value">{currentPlayer.group_size} player(s)</span>
              </div>
            )}

            {/* Sports */}
            {currentPlayer.favorite_types && currentPlayer.favorite_types.length > 0 && (
              <div className="stat-item">
                <span className="stat-label">Sports:</span>
                <div className="stat-tags">
                  {currentPlayer.favorite_types.slice(0, 3).map((sport) => (
                    <span key={sport} className="tag">
                      {sport}
                    </span>
                  ))}
                  {currentPlayer.favorite_types.length > 3 && (
                    <span className="tag">+{currentPlayer.favorite_types.length - 3}</span>
                  )}
                </div>
              </div>
            )}

            {/* Availability */}
            {currentPlayer.availability && (
              <div className="stat-item">
                <span className="stat-label">Available:</span>
                <span className="stat-value">{currentPlayer.availability}</span>
              </div>
            )}
          </div>

          {/* Bio */}
          {currentPlayer.bio && (
            <div className="card-bio">
              <p>{currentPlayer.bio}</p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="card-actions">
          <button className="btn-pass" onClick={() => handleSwipe('skip')}>
            ❌ Pass
          </button>
          <button className="btn-match" onClick={() => handleSwipe('like')}>
            ❤️ Match
          </button>
        </div>
      </div>

      {/* Card counter */}
      <div className="card-counter">
        {currentIndex + 1} / {cards.length}
      </div>
    </div>
  )
}
