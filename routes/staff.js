const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const multer  = require('multer');
const path    = require('path');
const { requireRole } = require('../middleware/auth');
const only = requireRole('driver','conductor');

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req,file,cb) => cb(null,'receipt_'+Date.now()+path.extname(file.originalname))
});
const upload = multer({ storage, limits:{ fileSize: 5*1024*1024 } });

router.get('/schedule', only, async (req,res) => {
  const [rows] = await db.query(`
    SELECT s.*, r.name AS route_name, r.origin, r.destination,
           b.reg_number AS bus_reg, b.capacity,
           ro.road_name, ro.distance AS road_distance
    FROM schedules s
    JOIN routes r ON s.route_id=r.id
    JOIN buses  b ON s.bus_id=b.id
    LEFT JOIN road_options ro ON s.road_option_id=ro.id
    WHERE s.driver_id=? AND s.status IN ('scheduled','in_progress')
    ORDER BY s.departure_time ASC`, [req.session.user.id]);
  res.json(rows);
});

router.get('/receipts', only, async (req,res) => {
  const [rows] = await db.query('SELECT * FROM expense_receipts WHERE staff_id=? ORDER BY submitted_at DESC', [req.session.user.id]);
  res.json(rows);
});

router.post('/receipts', only, upload.single('receipt_image'), async (req,res) => {
  const { schedule_id, amount, category, notes } = req.body;
  const img = req.file ? '/uploads/'+req.file.filename : null;
  await db.query('INSERT INTO expense_receipts (staff_id,schedule_id,amount,category,receipt_image,notes) VALUES (?,?,?,?,?,?)',
    [req.session.user.id, schedule_id||null, amount, category, img, notes||null]);
  res.json({ success:true });
});

router.post('/location', only, async (req,res) => {
  const { bus_id, latitude, longitude, sos } = req.body;
  const [ex] = await db.query('SELECT id FROM live_locations WHERE staff_id=?', [req.session.user.id]);
  if (ex.length) {
    await db.query('UPDATE live_locations SET latitude=?,longitude=?,bus_id=?,sos=?,timestamp=NOW() WHERE staff_id=?',
      [latitude,longitude,bus_id,sos?1:0,req.session.user.id]);
  } else {
    await db.query('INSERT INTO live_locations (bus_id,staff_id,latitude,longitude,sos) VALUES (?,?,?,?,?)',
      [bus_id,req.session.user.id,latitude,longitude,sos?1:0]);
  }
  res.json({ success:true });
});

router.get('/depot-contact', only, async (req,res) => {
  const [[admin]] = await db.query('SELECT phone FROM users WHERE role="admin" LIMIT 1');
  res.json({ phone: admin ? admin.phone : '0771234567' });
});

module.exports = router;

// ── MY BUS ───────────────────────────────────────────────────
router.get('/mybus', only, async (req,res) => {
  const [[user]] = await db.query('SELECT assigned_bus_id FROM users WHERE id=?', [req.session.user.id]);
  if (!user || !user.assigned_bus_id) return res.json(null);
  const [[bus]] = await db.query('SELECT * FROM buses WHERE id=?', [user.assigned_bus_id]);
  res.json(bus || null);
});
