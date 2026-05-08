// src/utils/socialApi.js
// All Supabase calls for friends + chats + groups + notifications.

import { supabase } from './supabaseClient'

// ── Sport / hobby roles available in groups ─────────────────────────
export const HOBBY_ROLES = [
  { value: 'basketball_court',    label: '🏀 Basketball'   },
  { value: 'badminton_court',     label: '🏸 Badminton'    },
  { value: 'tennis_court',        label: '🎾 Tennis'       },
  { value: 'volleyball_court',    label: '🏐 Volleyball'   },
  { value: 'football_field',      label: '⚽ Football'     },
  { value: 'futsal_court',        label: '🥅 Futsal'       },
  { value: 'gym',                 label: '💪 Gym'          },
  { value: 'fitness_corner',      label: '🏋️ Fitness'     },
  { value: 'swimming_pool',       label: '🏊 Swimming'     },
  { value: 'jogging_track',       label: '🏃 Jogging'      },
  { value: 'cycling_path',        label: '🚴 Cycling'      },
  { value: 'multi_purpose_court', label: '🏟️ Multi-Purpose'},
  { value: 'skate_park',          label: '🛹 Skate'        },
]

export const ROLE_LABEL = Object.fromEntries(HOBBY_ROLES.map(r => [r.value, r.label]))

// ════════════════════════════════════════════════════════════════════
// USER PROFILE LOOKUPS
// ════════════════════════════════════════════════════════════════════

export async function updateMyLocation(userId, lat, lng) {
  if (!userId || lat == null || lng == null) return
  return supabase.from('user_profiles').upsert({
    id:        userId,
    last_lat:  lat,
    last_lng:  lng,
    last_seen: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
}

export async function getProfile(userId) {
  return supabase.from('user_profiles').select('*').eq('id', userId).single()
}

export async function fetchNearby(myId, lat, lng, radiusKm = 5) {
  const dLat = radiusKm / 111
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url, bio, favorite_types, last_lat, last_lng, last_seen, share_location')
    .neq('id', myId)
    .eq('share_location', true)
    .gte('last_lat', lat - dLat)
    .lte('last_lat', lat + dLat)
    .gte('last_lng', lng - dLng)
    .lte('last_lng', lng + dLng)
    .not('last_lat', 'is', null)
    .order('last_seen', { ascending: false })
    .limit(50)
  if (error) return { data: [], error }
  const withDist = (data || [])
    .map(u => ({ ...u, distKm: haversine(lat, lng, u.last_lat, u.last_lng) }))
    .filter(u => u.distKm <= radiusKm)
    .sort((a, b) => a.distKm - b.distKm)
  return { data: withDist, error: null }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ════════════════════════════════════════════════════════════════════
// FRIENDSHIPS
// ════════════════════════════════════════════════════════════════════

export async function fetchFriendships(myId) {
  return supabase
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
    .order('updated_at', { ascending: false })
}

export async function fetchProfiles(userIds) {
  if (!userIds.length) return { data: [], error: null }
  return supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url, bio, favorite_types, last_seen')
    .in('id', userIds)
}

export async function sendFriendRequest(myId, otherId) {
  return supabase.from('friendships').insert({
    requester_id: myId,
    addressee_id: otherId,
    status: 'pending',
  })
}

export async function acceptFriendRequest(friendshipId) {
  return supabase.from('friendships').update({
    status: 'accepted',
    updated_at: new Date().toISOString(),
  }).eq('id', friendshipId)
}

export async function declineFriendRequest(friendshipId) {
  return supabase.from('friendships').delete().eq('id', friendshipId)
}

export async function removeFriend(friendshipId) {
  return supabase.from('friendships').delete().eq('id', friendshipId)
}

export async function blockUser(myId, otherId) {
  await supabase.from('friendships').delete()
    .or(`and(requester_id.eq.${myId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${myId})`)
  return supabase.from('friendships').insert({
    requester_id: myId,
    addressee_id: otherId,
    status: 'blocked',
  })
}

export async function unblockUser(friendshipId) {
  return supabase.from('friendships').delete().eq('id', friendshipId)
}

export async function setMute(friendship, myId, muted) {
  const patch = friendship.requester_id === myId
    ? { muted_by_req: muted }
    : { muted_by_add: muted }
  return supabase.from('friendships').update(patch).eq('id', friendship.id)
}

// ════════════════════════════════════════════════════════════════════
// CHATS
// ════════════════════════════════════════════════════════════════════

export async function fetchMyChats(myId) {
  const { data: memberships, error } = await supabase
    .from('chat_members')
    .select('chat_id, role, last_read_at, chat:chats(*)')
    .eq('user_id', myId)
  if (error) return { data: [], error }

  const chatIds = memberships.map(m => m.chat_id)
  if (!chatIds.length) return { data: [], error: null }

  const [{ data: members }, { data: lastMsgs }] = await Promise.all([
    supabase.from('chat_members')
      .select('chat_id, user_id, role, profile:user_profiles(id, display_name, avatar_url)')
      .in('chat_id', chatIds),
    supabase.from('messages')
      .select('chat_id, content, type, created_at, sender_id')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false }),
  ])

  const lastByChat = {}
  for (const m of (lastMsgs || [])) if (!lastByChat[m.chat_id]) lastByChat[m.chat_id] = m

  const list = memberships.map(m => ({
    ...m.chat,
    myRole:      m.role,
    lastReadAt:  m.last_read_at,
    members:     (members || []).filter(x => x.chat_id === m.chat_id),
    lastMessage: lastByChat[m.chat_id] || null,
  })).sort((a, b) => new Date(b.lastMessage?.created_at || b.created_at) - new Date(a.lastMessage?.created_at || a.created_at))
  return { data: list, error: null }
}

export async function getOrCreateDirectChat(myId, otherId) {
  const { data: mine } = await supabase
    .from('chat_members')
    .select('chat_id, chat:chats!inner(*)')
    .eq('user_id', myId)
    .eq('chat.type', 'direct')

  if (mine && mine.length) {
    const ids = mine.map(m => m.chat_id)
    const { data: theirs } = await supabase
      .from('chat_members')
      .select('chat_id')
      .eq('user_id', otherId)
      .in('chat_id', ids)
    if (theirs && theirs.length) {
      return { data: { id: theirs[0].chat_id }, error: null }
    }
  }

  const { data: chat, error } = await supabase.from('chats').insert({
    type: 'direct',
    created_by: myId,
  }).select().single()
  if (error) return { data: null, error }

  await supabase.from('chat_members').insert([
    { chat_id: chat.id, user_id: myId,    role: 'admin'  },
    { chat_id: chat.id, user_id: otherId, role: 'member' },
  ])
  return { data: chat, error: null }
}

export async function createGroupChat(myId, name, emoji, memberIds = []) {
  const { data: chat, error } = await supabase.from('chats').insert({
    type: 'group', name: name.trim() || 'New Group', emoji: emoji || '👥', created_by: myId,
  }).select().single()
  if (error) return { data: null, error }
  const rows = [
    { chat_id: chat.id, user_id: myId, role: 'admin' },
    ...memberIds.filter(id => id !== myId).map(id => ({ chat_id: chat.id, user_id: id, role: 'member' })),
  ]
  await supabase.from('chat_members').insert(rows)
  return { data: chat, error: null }
}

export async function updateGroupInfo(chatId, patch) {
  return supabase.from('chats').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', chatId)
}

export async function addGroupMember(chatId, userId) {
  return supabase.from('chat_members').insert({ chat_id: chatId, user_id: userId, role: 'member' })
}

export async function removeGroupMember(memberId) {
  return supabase.from('chat_members').delete().eq('id', memberId)
}

export async function transferAdmin(currentAdminMemberId, newAdminMemberId) {
  await supabase.from('chat_members').update({ role: 'member' }).eq('id', currentAdminMemberId)
  return supabase.from('chat_members').update({ role: 'admin' }).eq('id', newAdminMemberId)
}

export async function setMyRoles(memberId, roles) {
  return supabase.from('chat_members').update({ roles }).eq('id', memberId)
}

// ════════════════════════════════════════════════════════════════════
// MESSAGES
// ════════════════════════════════════════════════════════════════════

export async function fetchMessages(chatId, limit = 100) {
  return supabase
    .from('messages')
    .select('*, sender:user_profiles!sender_id(id, display_name, avatar_url)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true })
    .limit(limit)
}

export async function sendTextMessage(chatId, senderId, content, mentions = []) {
  return supabase.from('messages').insert({
    chat_id: chatId, sender_id: senderId,
    type: 'text', content, mentions,
  }).select('*, sender:user_profiles!sender_id(id, display_name, avatar_url)').single()
}

export async function sendLocationMessage(chatId, senderId, location, note = '') {
  return supabase.from('messages').insert({
    chat_id: chatId, sender_id: senderId,
    type: 'location',
    content: note || `📍 ${location.name}`,
    location_data: location,
  }).select('*, sender:user_profiles!sender_id(id, display_name, avatar_url)').single()
}

export async function markChatRead(memberId) {
  return supabase.from('chat_members').update({ last_read_at: new Date().toISOString() }).eq('id', memberId)
}

export function subscribeToChat(chatId, onInsert) {
  return supabase
    .channel(`chat:${chatId}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages',
      filter: `chat_id=eq.${chatId}`,
    }, (payload) => onInsert(payload.new))
    .subscribe()
}

// ════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════

export async function createNotification(userId, type, sourceId, sourceData) {
  return supabase.from('notifications').insert({
    user_id: userId, type, source_id: sourceId, source_data: sourceData,
  })
}

export async function fetchNotifications(myId) {
  return supabase
    .from('notifications')
    .select('*')
    .eq('user_id', myId)
    .order('created_at', { ascending: false })
    .limit(50)
}

export async function markNotificationRead(id) {
  return supabase.from('notifications').update({ read: true }).eq('id', id)
}

export async function markAllNotificationsRead(myId) {
  return supabase.from('notifications').update({ read: true }).eq('user_id', myId).eq('read', false)
}

// Parse @mentions out of text. Returns [{ kind:'user'|'role', value, raw }]
export function parseMentions(text, members = []) {
  if (!text) return []
  const out = []
  const re = /@([a-zA-Z0-9_]+)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const tok = m[1].toLowerCase()
    const role = HOBBY_ROLES.find(r => r.value.startsWith(tok) || r.label.toLowerCase().includes(tok))
    if (role) { out.push({ kind: 'role', value: role.value, raw: m[0] }); continue }
    const user = members.find(mm => {
      const n = (mm.profile?.display_name || '').toLowerCase().replace(/\s+/g, '')
      return n.startsWith(tok)
    })
    if (user) out.push({ kind: 'user', value: user.user_id, raw: m[0] })
  }
  return out
}

export function resolveMentionRecipients(mentions, members) {
  const ids = new Set()
  for (const mn of mentions) {
    if (mn.kind === 'user') ids.add(mn.value)
    if (mn.kind === 'role') {
      members.filter(m => (m.roles || []).includes(mn.value)).forEach(m => ids.add(m.user_id))
    }
  }
  return [...ids]
}
