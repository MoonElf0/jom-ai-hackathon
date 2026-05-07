import { useState, useEffect } from 'react'
import { useAuth } from '../utils/useAuth'
import { supabase } from '../utils/supabaseClient'
import SwipeCard from '../components/SwipeCard'
import FriendsPanel from '../components/FriendsPanel'
import GroupChat from '../components/GroupChat'
import '../styles/CommunityMatcher.css'

const SAMPLE_PLAYERS = [
  {
    id: 'sample-player-1',
    display_name: 'Duo Badminton Crew',
    avatar_url: null,
    vibe: 'casual',
    skill_level: 'intermediate',
    favorite_types: ['Badminton'],
    group_size: 2,
    availability: 'This evening, 6–8 PM',
    bio: 'We are a duo looking for a third player for a friendly badminton session.',
    distance_km: 1.8,
    looking_for_match: true,
    sample: true,
  },
  {
    id: 'sample-player-2',
    display_name: 'Avery',
    avatar_url: null,
    vibe: 'competitive',
    skill_level: 'advanced',
    favorite_types: ['Badminton', 'Tennis'],
    group_size: 1,
    availability: 'Saturday morning',
    bio: 'Competitive player hoping to join a strong local group.',
    distance_km: 3.2,
    looking_for_match: true,
    sample: true,
  },
  {
    id: 'sample-player-3',
    display_name: 'Maya & Jin',
    avatar_url: null,
    vibe: 'social',
    skill_level: 'beginner',
    favorite_types: ['Badminton'],
    group_size: 2,
    availability: 'Sunday afternoon',
    bio: 'Friendly duo who want to meet a third player for a chill game.',
    distance_km: 2.5,
    looking_for_match: true,
    sample: true,
  },
]

export default function CommunityMatcher() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('squad') // 'squad' or 'game'
  const [userProfile, setUserProfile] = useState(null)
  const [availablePlayers, setAvailablePlayers] = useState([])
  const [groupChats, setGroupChats] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [loading, setLoading] = useState(true)

  // Load user profile and initial data
  useEffect(() => {
    if (!user) return
    async function loadInitialData() {
      setLoading(true)
      try {
        // Get user profile
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (profileData) {
          setUserProfile({
            ...profileData,
            vibe: profileData.vibe || 'casual', // default to casual if not set
          })
        }

        // Load available players for swiping (not current user)
        const { data: playersData } = await supabase
          .from('user_profiles')
          .select('*')
          .neq('id', user.id)
          .eq('looking_for_match', true)

        if (playersData && playersData.length > 0) {
          setAvailablePlayers(playersData)
        } else {
          setAvailablePlayers(SAMPLE_PLAYERS)
        }

        // Load group chats this user is part of
        const { data: chatsData } = await supabase
          .from('group_chats')
          .select('*')
          .contains('member_ids', [user.id])

        if (chatsData) {
          setGroupChats(chatsData)
          if (!activeChat && chatsData.length > 0) {
            setActiveChat(chatsData[0])
          }
        }
      } catch (err) {
        console.error('Error loading initial data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [user])

  // Subscribe to real-time updates for new players
  useEffect(() => {
    if (!user) return

    const subscription = supabase
      .channel('user_profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=neq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new.looking_for_match) {
            setAvailablePlayers((prev) => {
              const exists = prev.find((p) => p.id === payload.new.id)
              if (exists) {
                return prev.map((p) => (p.id === payload.new.id ? payload.new : p))
              }
              return [...prev, payload.new]
            })
          }
        }
      )
      .subscribe()

    return () => subscription.unsubscribe()
  }, [user])

  async function updateVibe(newVibe) {
    if (!user) return
    setUserProfile((prev) => ({ ...prev, vibe: newVibe }))

    const { error } = await supabase
      .from('user_profiles')
      .update({
        vibe: newVibe,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (error) {
      console.error('Failed to save vibe:', error)
    }
  }

  async function createGroupChat(targetPlayer) {
    if (!user || !targetPlayer) return null

    const chatName = targetPlayer.group_size > 1
      ? `${targetPlayer.display_name} + You`
      : `Badminton match with ${targetPlayer.display_name}`

    const memberIds = [user.id, targetPlayer.id]

    try {
      if (targetPlayer.sample) {
        const demoChat = {
          id: `local-chat-${Date.now()}`,
          name: `Demo match with ${targetPlayer.display_name}`,
          member_ids: [user.id],
          created_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_message: `Matched with ${targetPlayer.display_name}. Say hi!`,
          last_message_at: new Date().toISOString(),
          isLocalDemo: true,
        }
        setGroupChats((prev) => [demoChat, ...(prev || [])])
        setActiveChat(demoChat)
        setActiveTab('squad')
        return demoChat
      }

      const { data, error } = await supabase
        .from('group_chats')
        .insert([
          {
            name: chatName,
            member_ids: memberIds,
            created_by: user.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_message: `Matched with ${targetPlayer.display_name}. Say hi!`,
            last_message_at: new Date().toISOString(),
          },
        ])
        .select()
        .single()

      if (error) {
        console.error('Error creating group chat:', error)
        return null
      }

      if (data) {
        setGroupChats((prev) => [data, ...(prev || [])])
        setActiveChat(data)
        setActiveTab('squad')
      }

      return data
    } catch (err) {
      console.error('Error creating group chat:', err)
      return null
    }
  }

  async function handlePlayerMatch(matchedPlayer) {
    if (!matchedPlayer) return
    await createGroupChat(matchedPlayer)
  }

  const toggleLookingForMatch = async (isLooking) => {
    if (!user) return
    const { error } = await supabase
      .from('user_profiles')
      .update({
        looking_for_match: isLooking,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (userProfile) {
      setUserProfile({ ...userProfile, looking_for_match: isLooking })
    }

    if (error) {
      console.error('Failed to update looking_for_match:', error)
    }
  }

  if (loading) {
    return (
      <div className="community-matcher-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    )
  }

  return (
    <div className="community-matcher-container">
      {/* Tab navigation */}
      <div className="cm-tabs">
        <button
          className={`cm-tab-btn ${activeTab === 'squad' ? 'active' : ''}`}
          onClick={() => setActiveTab('squad')}
        >
          👥 My Squad
        </button>
        <button
          className={`cm-tab-btn ${activeTab === 'game' ? 'active' : ''}`}
          onClick={() => setActiveTab('game')}
        >
          🎮 Find a Game
        </button>
      </div>

      {/* Tab content */}
      <div className="cm-content">
        {/* Tab 1: My Squad (Friends + Chat) */}
        {activeTab === 'squad' && (
          <div className="cm-squad-panel">
            <div className="squad-header">
              <h2>My Squad</h2>
              <button
                className={`looking-btn ${userProfile?.looking_for_match ? 'active' : ''}`}
                onClick={() => toggleLookingForMatch(!userProfile?.looking_for_match)}
              >
                {userProfile?.looking_for_match ? '🔴 Looking for Match' : '⚪ Not Looking'}
              </button>
            </div>

            <div className="squad-content">
              {/* Friends list */}
              <FriendsPanel
                groupChats={groupChats}
                activeChat={activeChat}
                onSelectChat={setActiveChat}
              />

              {/* Chat panel */}
              {activeChat && (
                <GroupChat
                  chatId={activeChat.id}
                  chatName={activeChat.name}
                  memberIds={activeChat.member_ids}
                  userId={user.id}
                />
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Find a Game (Swipe Cards) */}
        {activeTab === 'game' && (
          <div className="cm-game-panel">
            <div className="game-header">
              <h2>Find a Game</h2>
              {userProfile && (
                <div className="user-vibe-selector">
                  <label>My Vibe:</label>
                  <select
                    value={userProfile.vibe || 'casual'}
                    onChange={(e) => updateVibe(e.target.value)}
                  >
                    <option value="casual">🎉 Casual</option>
                    <option value="competitive">⚡ Competitive</option>
                    <option value="social">🤝 Social</option>
                  </select>
                </div>
              )}
            </div>

            {availablePlayers.length > 0 ? (
              <SwipeCard
                players={availablePlayers}
                currentUserId={user.id}
                userVibe={userProfile?.vibe || 'casual'}
                onMatch={handlePlayerMatch}
              />
            ) : (
              <div className="no-players">
                <p>🔍 No players looking for a match right now.</p>
                <p>Come back later or enable "Looking for Match" to get discovered!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
