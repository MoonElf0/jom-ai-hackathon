-- ════════════════════════════════════════════════════════════════════
-- JOM AI — Social Layer (Friends, Chats, Groups, Roles, Notifications)
-- ════════════════════════════════════════════════════════════════════
-- Run this file against your Supabase project once.
-- It is idempotent: every CREATE / ALTER uses IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. user_profiles: extend with location-share fields ─────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_lat       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_lng       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_seen      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_location BOOLEAN DEFAULT true;

-- ── 2. friendships ──────────────────────────────────────────────────
-- One row per relationship.
-- status: 'pending'   → requester has sent a request
--         'accepted'  → both are friends
--         'blocked'   → requester has blocked addressee
CREATE TABLE IF NOT EXISTS friendships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending','accepted','blocked')),
  muted_by_req  BOOLEAN DEFAULT false,
  muted_by_add  BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status    ON friendships(status);

-- ── 3. chats (direct or group) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL CHECK (type IN ('direct','group')),
  name        TEXT,
  emoji       TEXT,                 -- group "picture" — emoji avatar
  image_url   TEXT,                 -- if/when real image upload is added
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chats_created_by ON chats(created_by);

-- ── 4. chat_members ────────────────────────────────────────────────
-- role: 'admin'|'member'   (admin = chat creator or transferred role)
-- roles: text[] of self-assigned tags (e.g. {basketball_court,tennis_court})
CREATE TABLE IF NOT EXISTS chat_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  roles         TEXT[] DEFAULT '{}',
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  last_read_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat ON chat_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);

-- ── 5. messages ─────────────────────────────────────────────────────
-- type: 'text'   — content has the text body
--       'location'— location_data: {lat,lng,name,address,facility_id?}
--       'system' — auto-generated (e.g. "Alice added Bob")
-- mentions: array of {kind:'user'|'role', value}
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id       UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','location','system')),
  content       TEXT,
  location_data JSONB,
  mentions      JSONB DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);

-- ── 6. notifications ───────────────────────────────────────────────
-- type: 'friend_request' | 'friend_accepted' | 'mention' | 'group_invite' | 'message'
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  source_id    UUID,
  source_data  JSONB,
  read         BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read, created_at DESC);

-- ════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE friendships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing if re-running
DROP POLICY IF EXISTS "friendships read"   ON friendships;
DROP POLICY IF EXISTS "friendships write"  ON friendships;
DROP POLICY IF EXISTS "friendships update" ON friendships;
DROP POLICY IF EXISTS "friendships delete" ON friendships;

CREATE POLICY "friendships read"   ON friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "friendships write"  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "friendships update" ON friendships FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "friendships delete" ON friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Chats: visible only to members
DROP POLICY IF EXISTS "chats read"   ON chats;
DROP POLICY IF EXISTS "chats insert" ON chats;
DROP POLICY IF EXISTS "chats update" ON chats;

CREATE POLICY "chats read"   ON chats FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = chats.id AND chat_members.user_id = auth.uid()));
CREATE POLICY "chats insert" ON chats FOR INSERT
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "chats update" ON chats FOR UPDATE
  USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = chats.id AND chat_members.user_id = auth.uid() AND chat_members.role = 'admin'));

-- Chat members
DROP POLICY IF EXISTS "members read"   ON chat_members;
DROP POLICY IF EXISTS "members insert" ON chat_members;
DROP POLICY IF EXISTS "members update" ON chat_members;
DROP POLICY IF EXISTS "members delete" ON chat_members;

CREATE POLICY "members read"   ON chat_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM chat_members cm2 WHERE cm2.chat_id = chat_members.chat_id AND cm2.user_id = auth.uid())
  );
CREATE POLICY "members insert" ON chat_members FOR INSERT
  WITH CHECK (
    -- user adds self when joining a chat they created, OR an admin adds them
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM chat_members cm2 WHERE cm2.chat_id = chat_members.chat_id AND cm2.user_id = auth.uid() AND cm2.role = 'admin')
  );
CREATE POLICY "members update" ON chat_members FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM chat_members cm2 WHERE cm2.chat_id = chat_members.chat_id AND cm2.user_id = auth.uid() AND cm2.role = 'admin')
  );
CREATE POLICY "members delete" ON chat_members FOR DELETE
  USING (
    auth.uid() = user_id  -- leave
    OR EXISTS (SELECT 1 FROM chat_members cm2 WHERE cm2.chat_id = chat_members.chat_id AND cm2.user_id = auth.uid() AND cm2.role = 'admin')  -- kick
  );

-- Messages: members read/write
DROP POLICY IF EXISTS "messages read"   ON messages;
DROP POLICY IF EXISTS "messages insert" ON messages;

CREATE POLICY "messages read"   ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid()));
CREATE POLICY "messages insert" ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (SELECT 1 FROM chat_members WHERE chat_members.chat_id = messages.chat_id AND chat_members.user_id = auth.uid())
  );

-- Notifications: only owner
DROP POLICY IF EXISTS "notifications read"   ON notifications;
DROP POLICY IF EXISTS "notifications update" ON notifications;
DROP POLICY IF EXISTS "notifications insert" ON notifications;
DROP POLICY IF EXISTS "notifications delete" ON notifications;

CREATE POLICY "notifications read"   ON notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "notifications update" ON notifications FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "notifications insert" ON notifications FOR INSERT
  WITH CHECK (true);  -- server-side or trigger-driven; trust client for now
CREATE POLICY "notifications delete" ON notifications FOR DELETE
  USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════
-- REALTIME (enable replication for chat-related tables)
-- ════════════════════════════════════════════════════════════════════
-- Run separately in Supabase dashboard if these fail:
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
