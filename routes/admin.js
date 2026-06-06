const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const bcrypt  = require('bcrypt');
const multer  = require('multer');
const path    = require('path');
const PDFDocument = require('pdfkit');
const fs      = require('fs');
const { requireRole } = require('../middleware/auth');
const only = requireRole('admin');

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => cb(null, 'lic_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
router.get('/stats', only, async (req, res) => {
  const [[{ buses }]]  = await db.query('SELECT COUNT(*) AS buses FROM buses WHERE status="active"');
  const [[{ routes }]] = await db.query('SELECT COUNT(*) AS routes FROM routes WHERE status="active"');
  const [[{ trips }]]  = await db.query('SELECT COUNT(*) AS trips FROM schedules WHERE status="scheduled"');
  const [[{ staff }]]  = await db.query('SELECT COUNT(*) AS staff FROM users WHERE role IN ("driver","conductor") AND status="active"');
  const [[{ completed_today }]] = await db.query(`SELECT COUNT(*) AS completed_today FROM schedules WHERE status='completed' AND DATE(arrival_time)=CURDATE()`);
  const [[{ delayed }]] = await db.query(`SELECT COUNT(*) AS \`delayed\` FROM schedules WHERE status='in_progress' AND arrival_time < NOW()`);

  // vehicle utilisation: buses with a completed or in_progress trip / total active buses
  const [[{ utilised }]] = await db.query(`SELECT COUNT(DISTINCT bus_id) AS utilised FROM schedules WHERE status IN ('in_progress','completed') AND DATE(departure_time)=CURDATE()`);
  const utilRate = buses > 0 ? Math.round((utilised / buses) * 100) : 0;

  const [recent] = await db.query(`
    SELECT s.id, r.name AS route, b.reg_number AS bus,
           CONCAT(u.first_name,' ',u.last_name) AS driver,
           s.departure_time, s.arrival_time, s.status, s.is_emergency,
           CASE WHEN s.status='in_progress' AND s.arrival_time < NOW() THEN 1 ELSE 0 END AS is_delayed
    FROM schedules s
    JOIN routes r ON s.route_id  = r.id
    JOIN buses  b ON s.bus_id    = b.id
    JOIN users  u ON s.driver_id = u.id
    ORDER BY s.departure_time DESC LIMIT 8`);

  // license expiry alerts: drivers with license expiry within 60 days or expired
  const [licAlerts] = await db.query(`
    SELECT id, first_name, last_name, license_id, license_expiry
    FROM users
    WHERE role IN ('driver','conductor')
      AND status='active'
      AND license_expiry IS NOT NULL
      AND license_expiry <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
    ORDER BY license_expiry ASC LIMIT 10`);

  res.json({ stats: { buses, routes, trips, staff, completed_today, delayed, utilRate }, recent, licAlerts });
});

// ── STAFF CRUD ────────────────────────────────────────────────────────────────
router.get('/staff', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
           u.role, u.status, u.ntc_number, u.license_id, u.license_expiry,
           u.license_photo, u.created_at, u.working_hours,
           b.reg_number AS assigned_bus
    FROM users u
    LEFT JOIN buses b ON u.assigned_bus_id = b.id
    WHERE u.role IN ('driver','conductor') AND u.status='active'
    ORDER BY u.created_at DESC`);
  res.json(rows);
});

router.post('/staff', only, upload.single('license_photo'), async (req, res) => {
  try {
    const { id, first_name, last_name, email, phone, role, ntc_number, license_id, license_expiry, assigned_bus_id, password, working_hours } = req.body;
    const photo = req.file ? '/uploads/' + req.file.filename : null;
    if (id) {
      let q = 'UPDATE users SET first_name=?,last_name=?,email=?,phone=?,role=?,ntc_number=?,license_id=?,license_expiry=?,assigned_bus_id=?,working_hours=?';
      const params = [first_name, last_name, email, phone, role, ntc_number, license_id, license_expiry||null, assigned_bus_id||null, working_hours||0];
      if (password) { q += ',password=?'; params.push(await bcrypt.hash(password, 10)); }
      if (photo)    { q += ',license_photo=?'; params.push(photo); }
      q += ' WHERE id=?'; params.push(id);
      await db.query(q, params);
      res.json({ success: true, id });
    } else {
      const hash = await bcrypt.hash(password || 'password123', 10);
      const [r] = await db.query(
        'INSERT INTO users (first_name,last_name,email,phone,password,role,ntc_number,license_id,license_expiry,license_photo,assigned_bus_id,working_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [first_name, last_name, email, phone, hash, role, ntc_number, license_id, license_expiry||null, photo, assigned_bus_id||null, working_hours||0]);
      res.json({ success: true, id: r.insertId });
    }
  } catch (err) { res.json({ success: false, message: err.message }); }
});

router.delete('/staff/:id', only, async (req, res) => {
  await db.query('UPDATE users SET status="inactive" WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── BUSES ─────────────────────────────────────────────────────────────────────
router.get('/buses', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT b.*, r.name AS route_name, r.id AS route_id
    FROM buses b LEFT JOIN routes r ON b.route_id = r.id
    ORDER BY b.created_at DESC`);
  res.json(rows);
});

router.post('/buses', only, async (req, res) => {
  const { reg_number, capacity, mileage, route_id } = req.body;
  const [r] = await db.query('INSERT INTO buses (reg_number,capacity,mileage,route_id) VALUES (?,?,?,?)', [reg_number, capacity, mileage||0, route_id||null]);
  res.json({ success: true, id: r.insertId });
});

router.patch('/buses/:id', only, async (req, res) => {
  const { reg_number, capacity, mileage, status, route_id } = req.body;
  await db.query('UPDATE buses SET reg_number=?,capacity=?,mileage=?,status=?,route_id=? WHERE id=?',
    [reg_number, capacity, mileage, status, route_id||null, req.params.id]);
  res.json({ success: true });
});

router.delete('/buses/:id', only, async (req, res) => {
  await db.query('DELETE FROM buses WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── ROUTES ────────────────────────────────────────────────────────────────────
router.get('/routes', only, async (req, res) => {
  const [routes] = await db.query('SELECT * FROM routes ORDER BY created_at DESC');
  for (const r of routes) {
    const [opts] = await db.query('SELECT * FROM road_options WHERE route_id=?', [r.id]);
    r.road_options = opts;
  }
  res.json(routes);
});

router.post('/routes', only, async (req, res) => {
  const { name, origin, destination, total_distance, road_options } = req.body;
  const [r] = await db.query('INSERT INTO routes (name,origin,destination,total_distance) VALUES (?,?,?,?)',
    [name, origin, destination, total_distance]);
  const routeId = r.insertId;
  if (road_options && road_options.length) {
    for (const o of road_options) {
      await db.query('INSERT INTO road_options (route_id,road_name,distance,description) VALUES (?,?,?,?)',
        [routeId, o.road_name, o.distance, o.description || '']);
    }
  }
  res.json({ success: true, id: routeId });
});

router.patch('/routes/:id', only, async (req, res) => {
  const { name, origin, destination, total_distance, road_options } = req.body;
  await db.query('UPDATE routes SET name=?,origin=?,destination=?,total_distance=? WHERE id=?',
    [name, origin, destination, total_distance, req.params.id]);
  if (road_options) {
    await db.query('DELETE FROM road_options WHERE route_id=?', [req.params.id]);
    for (const o of road_options) {
      await db.query('INSERT INTO road_options (route_id,road_name,distance,description) VALUES (?,?,?,?)',
        [req.params.id, o.road_name, o.distance, o.description||'']);
    }
  }
  res.json({ success: true });
});

router.delete('/routes/:id', only, async (req, res) => {
  await db.query('DELETE FROM routes WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── SCHEDULES ─────────────────────────────────────────────────────────────────
router.get('/schedules', only, async (req, res) => {
  const { view, date } = req.query;  // view = week | month | all
  let dateFilter = '';
  const params = [];
  if (view === 'week' && date) {
    dateFilter = 'AND s.departure_time >= ? AND s.departure_time < DATE_ADD(?, INTERVAL 7 DAY)';
    params.push(date, date);
  } else if (view === 'month' && date) {
    dateFilter = 'AND YEAR(s.departure_time)=YEAR(?) AND MONTH(s.departure_time)=MONTH(?)';
    params.push(date, date);
  }
  const [rows] = await db.query(`
    SELECT s.*, r.name AS route_name, r.origin, r.destination,
           b.reg_number AS bus_reg,
           CONCAT(u.first_name,' ',u.last_name) AS driver_name,
           ro.road_name,
           CASE WHEN s.status='in_progress' AND s.arrival_time < NOW() THEN 1 ELSE 0 END AS is_delayed
    FROM schedules s
    JOIN routes r ON s.route_id = r.id
    JOIN buses  b ON s.bus_id   = b.id
    JOIN users  u ON s.driver_id= u.id
    LEFT JOIN road_options ro ON s.road_option_id = ro.id
    WHERE 1=1 ${dateFilter}
    ORDER BY s.departure_time DESC`, params);
  res.json(rows);
});

router.post('/schedules', only, async (req, res) => {
  const { route_id, bus_id, driver_id, road_option_id, departure_time, arrival_time, is_emergency, override_reason } = req.body;
  if (!is_emergency) {
    const [bc] = await db.query(`SELECT id FROM schedules WHERE bus_id=? AND status NOT IN ('cancelled','completed') AND departure_time < ? AND arrival_time > ?`, [bus_id, arrival_time, departure_time]);
    if (bc.length) return res.json({ success: false, conflict: 'bus', message: 'This bus already has a schedule during that time.' });
    const [dc] = await db.query(`SELECT id FROM schedules WHERE driver_id=? AND status NOT IN ('cancelled','completed') AND departure_time < ? AND arrival_time > ?`, [driver_id, arrival_time, departure_time]);
    if (dc.length) return res.json({ success: false, conflict: 'driver', message: 'This driver is already assigned during that time.' });
    const [rc] = await db.query(`SELECT id FROM schedules WHERE route_id=? AND status NOT IN ('cancelled','completed') AND departure_time < ? AND arrival_time > ?`, [route_id, arrival_time, departure_time]);
    if (rc.length) return res.json({ success: false, conflict: 'route', message: 'Another bus is already scheduled on this route at that time.' });
  }
  const [r] = await db.query(`INSERT INTO schedules (route_id,bus_id,driver_id,road_option_id,departure_time,arrival_time,is_emergency,override_reason) VALUES (?,?,?,?,?,?,?,?)`,
    [route_id, bus_id, driver_id, road_option_id||null, departure_time, arrival_time, is_emergency?1:0, override_reason||null]);
  res.json({ success: true, id: r.insertId });
});

router.patch('/schedules/:id', only, async (req, res) => {
  const { status, route_id, bus_id, driver_id, road_option_id, departure_time, arrival_time, is_emergency, override_reason } = req.body;
  if (status && Object.keys(req.body).length === 1) {
    await db.query('UPDATE schedules SET status=? WHERE id=?', [status, req.params.id]);
  } else {
    await db.query('UPDATE schedules SET route_id=?,bus_id=?,driver_id=?,road_option_id=?,departure_time=?,arrival_time=?,status=?,is_emergency=?,override_reason=? WHERE id=?',
      [route_id, bus_id, driver_id, road_option_id||null, departure_time, arrival_time, status||'scheduled', is_emergency?1:0, override_reason||null, req.params.id]);
  }
  res.json({ success: true });
});

router.delete('/schedules/:id', only, async (req, res) => {
  await db.query('DELETE FROM schedules WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── LIVE LOCATIONS ────────────────────────────────────────────────────────────
router.get('/live', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT l.latitude, l.longitude, l.timestamp, l.sos,
           b.reg_number, b.id AS bus_id,
           CONCAT(u.first_name,' ',u.last_name) AS driver_name,
           r.name AS route_name
    FROM live_locations l
    JOIN buses b ON l.bus_id = b.id
    JOIN users u ON l.staff_id = u.id
    LEFT JOIN schedules s ON s.bus_id = l.bus_id AND s.status='in_progress'
    LEFT JOIN routes r ON s.route_id = r.id
    WHERE l.timestamp >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`);
  res.json(rows);
});

// ── MAINTENANCE ───────────────────────────────────────────────────────────────
router.get('/maintenance', only, async (req, res) => {
  const [rows] = await db.query(`SELECT m.*,b.reg_number FROM maintenance_logs m JOIN buses b ON m.bus_id=b.id ORDER BY m.service_date DESC`);
  res.json(rows);
});

// upcoming service due (next 30 days)
router.get('/maintenance/due', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT m.*, b.reg_number
    FROM maintenance_logs m
    JOIN buses b ON m.bus_id = b.id
    WHERE m.next_service IS NOT NULL
      AND m.next_service BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    ORDER BY m.next_service ASC`);
  res.json(rows);
});

router.post('/maintenance', only, async (req, res) => {
  const { bus_id, service_date, type, description, cost, technician_name, next_service } = req.body;
  await db.query(`INSERT INTO maintenance_logs (bus_id,service_date,type,description,cost,technician_name,next_service) VALUES (?,?,?,?,?,?,?)`,
    [bus_id, service_date, type, description, cost, technician_name||null, next_service||null]);
  res.json({ success: true });
});

// ── EXPENSES ──────────────────────────────────────────────────────────────────
router.get('/expenses', only, async (req, res) => {
  const { bus_id } = req.query;
  let q = `SELECT e.*, CONCAT(u.first_name,' ',u.last_name) AS staff_name, b.reg_number
    FROM expense_receipts e
    JOIN users u ON e.staff_id = u.id
    LEFT JOIN schedules s ON e.schedule_id = s.id
    LEFT JOIN buses b ON s.bus_id = b.id`;
  const params = [];
  if (bus_id) { q += ' WHERE s.bus_id=?'; params.push(bus_id); }
  q += ' ORDER BY e.submitted_at DESC';
  const [rows] = await db.query(q, params);
  res.json(rows);
});

router.get('/expenses/summary', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT b.id, b.reg_number,
           SUM(e.amount) AS total,
           SUM(CASE WHEN e.category='fuel' THEN e.amount ELSE 0 END) AS fuel,
           SUM(CASE WHEN e.category='toll' THEN e.amount ELSE 0 END) AS toll,
           COUNT(e.id) AS receipts
    FROM buses b
    LEFT JOIN schedules s ON s.bus_id = b.id
    LEFT JOIN expense_receipts e ON e.schedule_id = s.id
    GROUP BY b.id, b.reg_number ORDER BY total DESC`);
  res.json(rows);
});

// fuel consumption trend — monthly totals for last 6 months
router.get('/expenses/fuel-trend', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT DATE_FORMAT(e.submitted_at,'%Y-%m') AS month,
           SUM(e.amount) AS total
    FROM expense_receipts e
    WHERE e.category='fuel'
      AND e.submitted_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY month ORDER BY month ASC`);
  res.json(rows);
});

// ── ANALYTICS ────────────────────────────────────────────────────────────────
// trip completion rate per route
router.get('/analytics/completion', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT r.name AS route_name,
           COUNT(s.id) AS total,
           SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) AS completed,
           ROUND(SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) / COUNT(s.id) * 100, 1) AS rate
    FROM routes r
    LEFT JOIN schedules s ON s.route_id = r.id
    GROUP BY r.id, r.name
    HAVING total > 0
    ORDER BY rate DESC`);
  res.json(rows);
});

// utilisation rate per bus
router.get('/analytics/utilisation', only, async (req, res) => {
  const [rows] = await db.query(`
    SELECT b.reg_number,
           COUNT(s.id) AS total_trips,
           SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN s.status IN ('in_progress','scheduled') THEN 1 ELSE 0 END) AS active
    FROM buses b
    LEFT JOIN schedules s ON s.bus_id = b.id
    GROUP BY b.id, b.reg_number
    ORDER BY total_trips DESC`);
  res.json(rows);
});

// ── PDF REPORT (enhanced with filters) ──────────────────────────────────────
router.post('/reports/generate', only, async (req, res) => {
  const { type, bus_id, period } = req.body;  // period = week | month | all

  let dateFilter = '';
  const params = [];
  if (period === 'week') { dateFilter = 'AND s.departure_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)'; }
  else if (period === 'month') { dateFilter = 'AND s.departure_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)'; }
  if (bus_id) { dateFilter += ` AND s.bus_id=${db.escape(bus_id)}`; }

  const [schedules] = await db.query(`
    SELECT s.*,r.name AS route_name,b.reg_number,
           CONCAT(u.first_name,' ',u.last_name) AS driver_name
    FROM schedules s JOIN routes r ON s.route_id=r.id
    JOIN buses b ON s.bus_id=b.id JOIN users u ON s.driver_id=u.id
    WHERE 1=1 ${dateFilter}
    ORDER BY s.departure_time DESC LIMIT 100`);

  const [summary] = await db.query(`
    SELECT b.reg_number,
           SUM(e.amount) AS total,
           SUM(CASE WHEN e.category='fuel' THEN e.amount ELSE 0 END) AS fuel
    FROM buses b LEFT JOIN schedules s ON s.bus_id=b.id
    LEFT JOIN expense_receipts e ON e.schedule_id=s.id
    ${bus_id ? 'WHERE b.id='+db.escape(bus_id) : ''}
    GROUP BY b.id,b.reg_number`);

  const completed = schedules.filter(s => s.status === 'completed').length;
  const completionRate = schedules.length > 0 ? Math.round((completed / schedules.length) * 100) : 0;

  const doc   = new PDFDocument({ margin: 50 });
  const fname = `report_${type}_${Date.now()}.pdf`;
  const fpath = path.join(__dirname, '../public/uploads', fname);
  doc.pipe(fs.createWriteStream(fpath));

  // Header
  doc.fontSize(20).fillColor('#1a4fa0').text('DTSL — ' + type.toUpperCase() + ' REPORT', { align: 'center' });
  doc.moveDown(0.3).fontSize(10).fillColor('#666')
     .text(`Generated: ${new Date().toLocaleString()}  |  Period: ${period||'All time'}`, { align: 'center' });
  doc.moveDown().moveTo(50,doc.y).lineTo(550,doc.y).strokeColor('#1a4fa0').stroke().moveDown();

  // Summary stats
  doc.fontSize(13).fillColor('#1a4fa0').text('Summary');
  doc.fontSize(10).fillColor('#333')
     .text(`Total Schedules: ${schedules.length}`)
     .text(`Completed Trips: ${completed}`)
     .text(`Completion Rate: ${completionRate}%`)
     .text(`Total Expenses: LKR ${summary.reduce((a,b)=>a+parseFloat(b.total||0),0).toLocaleString()}`);

  doc.moveDown().fontSize(13).fillColor('#1a4fa0').text('Schedule Detail');
  doc.fontSize(8).fillColor('#333');
  schedules.forEach(s => {
    const delayed = s.status === 'in_progress' && new Date(s.arrival_time) < new Date() ? ' [DELAYED]' : '';
    doc.text(`${s.route_name}  |  ${s.reg_number}  |  ${s.driver_name}  |  ${new Date(s.departure_time).toLocaleString()}  |  ${s.status}${delayed}`);
  });

  doc.moveDown().fontSize(13).fillColor('#1a4fa0').text('Expense Summary per Bus');
  doc.fontSize(8).fillColor('#333');
  summary.forEach(b => {
    doc.text(`${b.reg_number}  —  Total: LKR ${parseFloat(b.total||0).toLocaleString()}  |  Fuel: LKR ${parseFloat(b.fuel||0).toLocaleString()}`);
  });

  doc.end();
  await db.query('INSERT INTO reports (admin_id,type,export_path) VALUES (?,?,?)',
    [req.session.user.id, type, '/uploads/'+fname]);
  res.json({ success: true, file: '/uploads/'+fname });
});

module.exports = router;
