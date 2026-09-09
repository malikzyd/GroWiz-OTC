import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_PROJECT_URL_HERE'
const supabaseKey = 'YOUR_ANON_PUBLIC_KEY_HERE'

export const supabase = createClient(supabaseUrl, supabaseKey)
