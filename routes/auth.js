const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const db      = require('../config/db');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND status = "active"', [email]);
    if (!rows.length) return res.json({ success: false, message: 'Invalid email or password.' });
    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: 'Invalid email or password.' });
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    const redirects = { admin: '/admin', driver: '/staff', conductor: '/staff', customer: '/customer' };
    res.json({ success: true, redirect: redirects[user.role] });
  } catch (err) {
    console.error(err);
    res.json({ success: false, message: 'Server error.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;

// ── SIGNUP (customers only) ──────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password } = req.body;
    if (!first_name || !last_name || !email || !password)
      return res.json({ success: false, message: 'All fields are required.' });
    if (password.length < 6)
      return res.json({ success: false, message: 'Password must be at least 6 characters.' });
    const [existing] = await db.query('SELECT id FROM users WHERE email=?', [email]);
    if (existing.length)
      return res.json({ success: false, message: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      'INSERT INTO users (first_name,last_name,email,phone,password,role) VALUES (?,?,?,?,?,?)',
      [first_name, last_name, email, phone||'', hash, 'customer']
    );
    req.session.user = { id: r.insertId, name: first_name+' '+last_name, email, role: 'customer' };
    res.json({ success: true });
  } catch(err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: 'An account with this email already exists.' });
    res.json({ success: false, message: 'Server error. Please try again.' });
  }
});
