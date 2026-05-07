# Community Matcher Feature - Setup & Implementation Guide

## Overview

The Community Matcher is a dual-tabbed page that combines a Friends/Squad list with a Tinder-style game finder. It enables users to discover other players looking for matches and coordinate meetups through real-time group chats.

**Features:**
- 👥 **My Squad Tab**: Manage friends/squads and coordinate through group chats
- 🎮 **Find a Game Tab**: Swipe-based player discovery with vibe matching
- ⚡ **Real-time Messaging**: Instant group chat with Supabase Realtime
- 📍 **Player Matching**: Display skill level, vibe preference, group size, and availability

## File Structure

```
frontend/src/
├── pages/
│   └── CommunityMatcher.jsx         # Main container component
├── components/
│   ├── SwipeCard.jsx                # Tinder-style swipe cards
│   ├── FriendsPanel.jsx             # Friends/squad list sidebar
│   └── GroupChat.jsx                # Group chat messaging
└── styles/
    ├── CommunityMatcher.css         # Main page styles
    ├── SwipeCard.css                # Swipe card styles
    ├── FriendsPanel.css             # Friends panel styles
    └── GroupChat.css                # Chat styles

backend/
└── community_matcher_schema.sql     # Database schema setup
```

## Setup Instructions

### 1. Database Setup (Supabase)

1. Open your Supabase project: https://app.supabase.com
2. Navigate to **SQL Editor**
3. Create a new query and copy the entire contents of `backend/community_matcher_schema.sql`
4. Run the SQL to create all necessary tables and enable RLS policies
5. Verify the tables exist:
   - `group_chats`
   - `group_chat_messages`
   - `player_interactions`
   - Modified `user_profiles` with new fields

### 2. Update User Profiles

The `user_profiles` table gets these new fields:
- **vibe** (TEXT): 'casual', 'competitive', or 'social'
- **skill_level** (TEXT): 'beginner', 'intermediate', 'advanced'
- **group_size** (INTEGER): Current number of players in group
- **availability** (TEXT): e.g., "Weekends, Evenings"
- **looking_for_match** (BOOLEAN): Active looking status
- **distance_km** (NUMERIC): Distance from user's home

Update your ProfilePage.jsx to include these fields in the profile settings.

### 3. Frontend Installation

No additional npm packages needed! The implementation uses:
- React hooks (useState, useEffect, useRef)
- Supabase client (already installed)
- CSS3 animations for swipe cards

### 4. Add Route to App.jsx

The route has already been added in the updated App.jsx:
```jsx
<Route path="/community-matcher" element={<RequireAuth><CommunityMatcher /></RequireAuth>} />
```

Access at: `http://localhost:5173/community-matcher`

### 5. Add Navigation Link (Optional)

Add a link in your main navigation or MapView to access the Community Matcher:
```jsx
<Link to="/community-matcher">Community Matcher</Link>
// or
<button onClick={() => navigate('/community-matcher')}>👥 Find Players</button>
```

## Component APIs

### CommunityMatcher.jsx
Main container that manages both tabs and state.

**Props**: None (uses hooks for auth and Supabase)

**State**:
- `activeTab`: 'squad' or 'game'
- `userProfile`: Current user's profile data
- `availablePlayers`: Array of players looking for matches
- `groupChats`: User's group chats
- `activeChat`: Currently selected chat

### SwipeCard.jsx
Displays swipeable player cards.

**Props**:
- `players` (Array): Array of player objects to swipe through
- `currentUserId` (String): UUID of current user
- `userVibe` (String): Current user's vibe preference
- `onMatch` (Function): Callback when user swipes right

**Features**:
- Touch swipe support (left = skip, right = like)
- Button-based swiping (mobile/desktop)
- Card animations
- Player stats display

### FriendsPanel.jsx
Lists user's squads and group chats.

**Props**:
- `groupChats` (Array): Array of group chat objects
- `activeChat` (Object): Currently selected chat
- `onSelectChat` (Function): Callback to select a chat

**Features**:
- Search/filter squads
- Unread message badges
- Last message preview
- Member count display

### GroupChat.jsx
Real-time group messaging.

**Props**:
- `chatId` (String): UUID of the chat
- `chatName` (String): Display name of chat
- `memberIds` (Array): Array of member UUIDs
- `userId` (String): Current user's UUID

**Features**:
- Real-time message updates
- Auto-scroll to latest message
- Message timestamps
- Sent/received message styling

## Styling & Theming

All components support light/dark mode via CSS custom properties:

```css
[data-theme='light'] {
  --bg-primary: #ffffff;
  --text-primary: #000000;
  --primary-color: #1976d2;
}

[data-theme='dark'] {
  --bg-primary: #1e1e1e;
  --text-primary: #ffffff;
  --primary-color: #4a9eff;
}
```

Existing theme system should work automatically.

## User Flow Example

1. **Player Setup**:
   - User goes to Profile page
   - Sets vibe: "Casual", skill level: "Intermediate"
   - Marks favorite sports: "Badminton", "Tennis"

2. **Finding a Game**:
   - Opens Community Matcher → "Find a Game" tab
   - Sees swipe cards of other players looking for matches
   - Swipes right on a duo looking for a third badminton player
   - Interaction is recorded in `player_interactions` table

3. **Group Coordination**:
   - After swiping, user can create group chat with matched players
   - Group chat appears in "My Squad" tab
   - Users can message in real-time to coordinate:
     - Meeting time
     - Meeting location
     - What time to arrive
     - Skill expectations

4. **Ongoing Communication**:
   - Users stay in group chats for future coordination
   - Unread badges show new messages
   - Chat history is persistent

## Data Structures

### User Profile (Enhanced)
```javascript
{
  id: "uuid",
  display_name: "Alex Chen",
  avatar_url: "https://...",
  bio: "Love badminton",
  vibe: "casual", // NEW
  skill_level: "intermediate", // NEW
  favorite_types: ["badminton_court", "tennis_court"],
  group_size: 1, // NEW
  availability: "Weekends 3-5pm", // NEW
  looking_for_match: true, // NEW
  distance_km: 2.5 // NEW
}
```

### Group Chat
```javascript
{
  id: "uuid",
  name: "Badminton Squad - Saturday",
  member_ids: ["uuid1", "uuid2", "uuid3"],
  created_by: "uuid1",
  created_at: "2024-01-15T10:00:00Z",
  last_message: "Let's meet at the court!",
  last_message_at: "2024-01-15T14:30:00Z",
  unread_count: 2
}
```

### Group Chat Message
```javascript
{
  id: "uuid",
  chat_id: "uuid",
  sender_id: "uuid",
  message: "See you tomorrow at 3pm!",
  created_at: "2024-01-15T14:30:00Z"
}
```

### Player Interaction
```javascript
{
  id: "uuid",
  user_id: "uuid",
  target_user_id: "uuid",
  interaction_type: "like", // or "skip"
  created_at: "2024-01-15T10:15:00Z"
}
```

## Future Enhancements

1. **Mutual Match**: Create group chat automatically when both users swipe right
2. **Analytics**: Track which sports have most matches, best times to find players
3. **Smart Recommendations**: Suggest players based on location and skill level
4. **Notifications**: Push notifications for new matches and messages
5. **Ratings/Reviews**: Rate teammates after playing
6. **Advanced Filtering**: Filter by age, experience, gender, language
7. **Match History**: Track where and when matches happened
8. **Team Building**: Pre-organized teams looking for opponents

## Troubleshooting

### Messages not appearing?
- Check that Realtime is enabled in Supabase SQL Editor: `ALTER PUBLICATION supabase_realtime ADD TABLE group_chat_messages;`
- Verify RLS policies allow the user to insert/select messages

### Swipe cards not showing?
- Ensure `user_profiles.looking_for_match` is set to `true` for other users
- Check browser console for errors
- Verify Supabase query returns data

### Authentication issues?
- Verify user is logged in via `useAuth()` hook
- Check that auth token is valid
- See `frontend/src/utils/useAuth.js` for details

## Testing

1. Create multiple test user accounts in Supabase Auth
2. In each account, go to Profile and enable "Looking for Match"
3. Go to Community Matcher → "Find a Game"
4. You should see other test accounts as swipe cards
5. Swipe right to create a match
6. Check "My Squad" tab for the new group chat
7. Send messages in real-time

## Security Notes

- RLS policies ensure users only see their own data
- Messages can only be sent to chats the user is a member of
- Interactions are tied to the authenticated user's ID
- All queries are parameterized to prevent SQL injection

## Support & Questions

For issues or questions:
1. Check Supabase dashboard for table creation errors
2. Review browser console for client-side errors
3. Check Supabase logs for API errors
4. Verify RLS policies are correctly applied
