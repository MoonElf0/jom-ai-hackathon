// src/utils/supabaseClient.js
// Problem: Every component that needs data would have to set up its
//          own Supabase connection — messy and wasteful.
// Solution: Create ONE shared client here, import it anywhere needed.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env vars — check frontend/.env')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
