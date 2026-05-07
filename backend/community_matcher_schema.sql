-- Community Matcher Feature - Supabase Database Schema
-- Run these SQL commands in your Supabase SQL Editor to set up the necessary tables
-- https://app.supabase.com/project/[YOUR_PROJECT_ID]/sql

-- ============================================================================
-- 1. Modify user_profiles table to add Community Matcher fields
-- ============================================================================
-- Run if table already exists (update schema)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS vibe TEXT DEFAULT 'casual', -- 'casual', 'competitive', 'social'
ADD COLUMN IF NOT EXISTS skill_level TEXT, -- 'beginner', 'intermediate', 'advanced'
ADD COLUMN IF NOT EXISTS group_size INTEGER DEFAULT 1, -- Number of players in current group
ADD COLUMN IF NOT EXISTS availability TEXT, -- e.g., "Weekends, Evenings"
ADD COLUMN IF NOT EXISTS looking_for_match BOOLEAN DEFAULT FALSE, -- Is player actively looking?
ADD COLUMN IF NOT EXISTS distance_km NUMERIC DEFAULT 0; -- Distance from home (for UI purposes)

-- ============================================================================
-- 2. Create group_chats table
-- ============================================================================
-- Stores information about group chats created after matches
CREATE TABLE IF NOT EXISTS group_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g., "Badminton Squad - Saturday"
  description TEXT, -- Optional description
  avatar_url TEXT, -- Optional group avatar
  member_ids UUID[] NOT NULL, -- Array of user IDs in this chat
  created_by UUID NOT NULL, -- User who created the chat
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_message TEXT, -- Cache of last message
  last_message_at TIMESTAMP,
  unread_count INTEGER DEFAULT 0,
  
  -- Foreign key constraint
  CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_group_chats_member_ids ON group_chats USING GIN (member_ids);
CREATE INDEX IF NOT EXISTS idx_group_chats_created_by ON group_chats(created_by);

-- ============================================================================
-- 3. Create group_chat_messages table
-- ============================================================================
-- Stores all messages in group chats
CREATE TABLE IF NOT EXISTS group_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  edited_at TIMESTAMP,
  
  -- Foreign key constraints
  CONSTRAINT fk_chat_id FOREIGN KEY (chat_id) REFERENCES group_chats(id) ON DELETE CASCADE,
  CONSTRAINT fk_sender_id FOREIGN KEY (sender_id) REFERENCES auth.users(id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON group_chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON group_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON group_chat_messages(created_at DESC);

-- ============================================================================
-- 4. Create player_interactions table
-- ============================================================================
-- Tracks player swipe interactions (likes/skips)
CREATE TABLE IF NOT EXISTS player_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  interaction_type TEXT NOT NULL, -- 'like' or 'skip'
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key constraints
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_target_user_id FOREIGN KEY (target_user_id) REFERENCES auth.users(id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON player_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_target_user_id ON player_interactions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON player_interactions(created_at);

-- ============================================================================
-- 5. Enable Row Level Security (RLS)
-- ============================================================================
-- Only users should see their own data and chats they're part of

-- RLS for group_chats
ALTER TABLE group_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chats they're part of"
ON group_chats FOR SELECT
USING (auth.uid() = ANY(member_ids) OR auth.uid() = created_by);

CREATE POLICY "Users can create chats"
ON group_chats FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update chats they're part of"
ON group_chats FOR UPDATE
USING (auth.uid() = ANY(member_ids) OR auth.uid() = created_by);

-- RLS for group_chat_messages
ALTER TABLE group_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in chats they're part of"
ON group_chat_messages FOR SELECT
USING (
  chat_id IN (
    SELECT id FROM group_chats WHERE auth.uid() = ANY(member_ids)
  )
);

CREATE POLICY "Users can insert messages to chats they're in"
ON group_chat_messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid() AND
  chat_id IN (
    SELECT id FROM group_chats WHERE auth.uid() = ANY(member_ids)
  )
);

-- RLS for player_interactions
ALTER TABLE player_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only track their own interactions"
ON player_interactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own interactions"
ON player_interactions FOR SELECT
USING (auth.uid() = user_id);

-- ============================================================================
-- 6. Enable Realtime subscriptions
-- ============================================================================
-- This allows live updates for messages and player availability

ALTER PUBLICATION supabase_realtime ADD TABLE group_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE group_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE user_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE player_interactions;

-- ============================================================================
-- 7. Sample Data (Optional - for testing)
-- ============================================================================
-- Uncomment to add test data

-- INSERT INTO user_profiles (id, display_name, vibe, skill_level, favorite_types, bio, looking_for_match, group_size)
-- VALUES 
--   (gen_random_uuid(), 'Alex Chen', 'casual', 'intermediate', ARRAY['badminton_court', 'tennis_court'], 'Love playing badminton on weekends!', true, 1),
--   (gen_random_uuid(), 'Sam Patel', 'competitive', 'advanced', ARRAY['tennis_court', 'basketball_court'], 'Looking for serious players', true, 2),
--   (gen_random_uuid(), 'Jordan Lee', 'social', 'beginner', ARRAY['badminton_court'], 'New to sports, want to learn!', true, 1);

-- ============================================================================
-- Done! Your Community Matcher feature is ready to use.
-- ============================================================================
