const { createClient } = require('@supabase/supabase-js');
const db = require('../db');
const { createAdminRouter } = require('./createAdminRouter');

// Cliente exclusivo: o login mobile não altera a sessão deste cliente.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
module.exports = createAdminRouter({ auth: supabase.auth, db });
