const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const db = require('../db');
const { createRequireAdmin } = require('../middleware/requireAdmin');

// Cliente exclusivo: o login mobile não altera a sessão deste cliente.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
const router = express.Router();
router.use(createRequireAdmin({ auth: supabase.auth, db }));

router.get('/me', (req, res) => res.json({ admin: req.admin }));

module.exports = router;
