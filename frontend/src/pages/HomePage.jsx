// src/pages/HomePage.jsx

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/useAuth'
import { supabase } from '../utils/supabaseClient'
import '../styles/HomePage.css'
import '../styles/AIChatbot.css'
import AIChatbot from '../components/AIChatbot'

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [recentPlaces] = useState([
    { id: 1, name: 'Tampines Hub', type: 'community_hall', time: '2 hours ago' },
    { id: 2, name: 'Tampines Sports Centre', type: 'gym', time: '1 day ago' },
    { id: 3, name: 'Tampines Park', type: 'park', time: '3 days ago' }
  ])

  const [onlineFriends] = useState([
    { id: 1, name: 'Alice Chen', status: 'online', avatar: '👩' },
    { id: 2, name: 'Bob Tan', status: 'online', avatar: '👨' },
    { id: 3, name: 'Charlie Lim', status: 'online', avatar: '🧑' },
    { id: 4, name: 'Diana Wong', status: 'online', avatar: '👩‍💼' }
  ])

  const [nearbyFacilities] = useState([
    { id: 1, name: 'Tampines Sports Centre', type: 'gym', distance: '0.8 km' },
    { id: 2, name: 'Tampines Hub', type: 'community_hall', distance: '1.2 km' },
    { id: 3, name: 'Tampines Park', type: 'park', distance: '1.5 km' }
  ])

  const [isChatbotOpen, setIsChatbotOpen] = useState(false)

  const getFacilityIcon = (type) => {
    const icons = {
      gym: '💪',
      community_hall: '🏛️',
      park: '🌳',
      fitness_corner: '🏋️',
      playground: '🎪',
      basketball_court: '🏀',
      badminton_court: '🏸',
      tennis_court: '🎾',
      swimming_pool: '🏊'
    }
    return icons[type] || '📍'
  }

  return (
    <div className="home-page">
      {/* Header */}
      <div className="home-header">
        <div className="home-welcome">
          <h1>Welcome back{user?.user_metadata?.display_name ? `, ${user.user_metadata.display_name}` : ''}!</h1>
          <p>Discover places and connect with friends</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="home-content">
        {/* Recents Section */}
        <div className="home-section">
          <div className="section-header">
            <h2>Recents</h2>
            <button
              className="map-shortcut-btn"
              onClick={() => navigate('/map')}
              title="Go to Map"
            >
              🗺️
            </button>
          </div>
          <div className="recents-grid">
            {recentPlaces.map((place) => (
              <div key={place.id} className="recent-card">
                <div className="recent-icon">
                  {getFacilityIcon(place.type)}
                </div>
                <div className="recent-info">
                  <h3>{place.name}</h3>
                  <p>{place.time}</p>
                </div>
                <button
                  className="recent-nav-btn"
                  onClick={() => navigate('/map')}
                  title="Navigate to this place"
                >
                  →
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Online Friends Section */}
        <div className="home-section">
          <h2>Online Friends</h2>
          <div className="friends-list">
            {onlineFriends.map((friend) => (
              <div key={friend.id} className="friend-item">
                <div className="friend-avatar">
                  {friend.avatar}
                </div>
                <div className="friend-info">
                  <span className="friend-name">{friend.name}</span>
                  <span className="friend-status">{friend.status}</span>
                </div>
                <button
                  className="friend-chat-btn"
                  onClick={() => navigate('/chats')}
                  title="Start chat"
                >
                  💬
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations Section */}
        <div className="home-section">
          <div className="section-header">
            <h2>Nearby Recommendations</h2>
            <button
              className="map-shortcut-btn"
              onClick={() => navigate('/map')}
              title="View on Map"
            >
              🗺️
            </button>
          </div>
          <div className="recommendations-grid">
            {nearbyFacilities.map((facility) => (
              <div key={facility.id} className="recommendation-card">
                <div className="facility-icon">
                  {getFacilityIcon(facility.type)}
                </div>
                <div className="facility-info">
                  <h3>{facility.name}</h3>
                  <p>{facility.distance} away</p>
                </div>
                <button
                  className="facility-nav-btn"
                  onClick={() => navigate('/map')}
                  title="Navigate here"
                >
                  →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chatbot Button */}
      <button
        className="chatbot-btn"
        onClick={() => setIsChatbotOpen(true)}
        title="Open AI Chatbot"
      >
        🤖
      </button>

      {/* AI Chatbot Modal */}
      <AIChatbot
        isOpen={isChatbotOpen}
        onClose={() => setIsChatbotOpen(false)}
      />
    </div>
  )
}