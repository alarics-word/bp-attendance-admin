import { createClient } from '@supabase/supabase-js'

// TODO: fill in from Supabase project settings > API (same project the app uses)
const supabaseUrl = 'https://jwoqpdupvqqbkgeaawwv.supabase.co'
const supabaseAnonKey = 'sb_publishable_AFWwx4XOXKGDwTt-9k-zZQ_rd5X9Qc_'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
