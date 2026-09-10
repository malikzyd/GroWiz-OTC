import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iyiuupnewcguoguiyymc.supabase.co' 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aXV1cG5ld2NndW9ndWl5eW1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NjAyODMsImV4cCI6MjEwNDUzNjI4M30.dvRdPCUuWruYIKCpdDfP1Lqow5F8F9w7GKCz8het-Lo' 

export const supabase = createClient(supabaseUrl, supabaseKey)
