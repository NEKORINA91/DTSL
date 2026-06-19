const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const db      = require('../config/db');

router.post('/login', async (req, res) => {
  try {
    const { email, depot_code, password } = req.body;

    // depo login
    if (depot_code) {
      const [rows] = await db.query(
        'SELECT * FROM depots WHERE depot_code=? AND status != "inactive"',
        [depot_code.toUpperCase().trim()]
      );
      if (!rows.length) return res.json({ success:false, message:'Invalid depot ID or password.' });
      const depot = rows[0];
      const match = await bcrypt.compare(password, depot.password);
      if (!match) return res.json({ success:false, message:'Invalid depot ID or password.' });
      req.session.user = { id: depot.id, name: depot.name, role: 'depot', depot_id: depot.id, depot_code: depot.depot_code };
      return res.json({ success:true, redirect:'/depot' });
    }

    // Login
    const [rows] = await db.query(
      'SELECT * FROM users WHERE email=? AND status="active"', [email]
    );
    if (!rows.length) return res.json({ success:false, message:'Invalid email or password.' });
    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success:false, message:'Invalid email or password.' });
    req.session.user = {
      id: user.id,
      name: user.first_name+' '+user.last_name,
      email: user.email,
      role: user.role,
      depot_id: user.depot_id
    };
    const redirects = { superadmin:'/superadmin', driver:'/staff', conductor:'/staff' };
    const redirect  = redirects[user.role];
    if (!redirect) return res.json({ success:false, message:'Access denied.' });
    return res.json({ success:true, redirect });
  } catch(err) {
    console.error(err);
    res.json({ success:false, message:'Server error.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
