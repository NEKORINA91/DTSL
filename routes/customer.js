const express = require('express');
const router  = express.Router();
const db      = require('../config/db');

// ── SEARCH ROUTES ────────────────────────────────────────────
router.get('/routes', async (req, res) => {
  const { origin, destination, date } = req.query;
  let q = `SELECT r.*, COUNT(s.id) AS trip_count
    FROM routes r
    LEFT JOIN schedules s ON s.route_id = r.id
      AND s.status IN ('scheduled','in_progress')
      ${date ? "AND DATE(s.departure_time) = ?" : ""}
    WHERE r.status = 'active'`;
  const params = [];
  if (date) params.push(date);
  if (origin)      { q += ' AND r.origin LIKE ?';      params.push('%'+origin+'%'); }
  if (destination) { q += ' AND r.destination LIKE ?'; params.push('%'+destination+'%'); }
  q += ' GROUP BY r.id ORDER BY r.name ASC';
  const [routes] = await db.query(q, params);
  for (const r of routes) {
    const [opts] = await db.query('SELECT * FROM road_options WHERE route_id=?', [r.id]);
    r.road_options = opts;
  }
  res.json(routes);
});

// ── TIMETABLE FOR A ROUTE ────────────────────────────────────
router.get('/routes/:id/timetable', async (req, res) => {
  const { date } = req.query;
  let q = `SELECT s.id, s.departure_time, s.arrival_time, s.status, s.is_emergency,
           b.reg_number AS bus_reg, b.capacity,
           ro.road_name,
           (SELECT COALESCE(SUM(bk.seats),0) FROM bookings bk WHERE bk.schedule_id=s.id AND bk.status='confirmed') AS booked_seats
    FROM schedules s
    JOIN buses b ON s.bus_id = b.id
    LEFT JOIN road_options ro ON s.road_option_id = ro.id
    WHERE s.route_id = ? AND s.status IN ('scheduled','in_progress')`;
  const params = [req.params.id];
  if (date) { q += ' AND DATE(s.departure_time) = ?'; params.push(date); }
  else       { q += ' AND DATE(s.departure_time) >= CURDATE()'; }
  q += ' ORDER BY s.departure_time ASC LIMIT 30';
  const [rows] = await db.query(q, params);
  res.json(rows);
});

// ── LIVE BUS LOCATIONS ───────────────────────────────────────
router.get('/live', async (req, res) => {
  const [rows] = await db.query(`
    SELECT l.latitude, l.longitude, l.timestamp, l.sos,
           b.reg_number, b.capacity,
           CONCAT(u.first_name,' ',u.last_name) AS driver_name,
           r.name AS route_name, r.origin, r.destination
    FROM live_locations l
    JOIN buses b ON l.bus_id = b.id
    JOIN users u ON l.staff_id = u.id
    LEFT JOIN schedules s ON s.bus_id = l.bus_id AND s.status = 'in_progress'
    LEFT JOIN routes r ON s.route_id = r.id
    WHERE l.timestamp >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)`);
  res.json(rows);
});

// ── BOOK A SEAT ──────────────────────────────────────────────
router.post('/book', async (req, res) => {
  try {
    const { schedule_id, name, phone, seats, seat_number } = req.body;
    if (!schedule_id || !name || !phone) return res.json({ success: false, message: 'Name, phone and schedule are required.' });
    // check capacity
    const [[sched]] = await db.query(`
      SELECT b.capacity,
        (SELECT COALESCE(SUM(bk.seats),0) FROM bookings bk WHERE bk.schedule_id=? AND bk.status='confirmed') AS booked
      FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE s.id=?`, [schedule_id, schedule_id]);
    if (!sched) return res.json({ success: false, message: 'Schedule not found.' });
    const available = sched.capacity - sched.booked;
    if ((seats||1) > available) return res.json({ success: false, message: `Only ${available} seats available.` });
    const [r] = await db.query(
      'INSERT INTO bookings (schedule_id,name,phone,seats,seat_number) VALUES (?,?,?,?,?)',
      [schedule_id, name, phone, seats||1, seat_number||null]
    );
    res.json({ success: true, booking_id: r.insertId, available: available - (seats||1) });
  } catch(err) { res.json({ success: false, message: err.message }); }
});

// ── CANCEL BOOKING ───────────────────────────────────────────
router.post('/cancel', async (req, res) => {
  const { booking_id, phone } = req.body;
  const [[booking]] = await db.query('SELECT * FROM bookings WHERE id=? AND phone=?', [booking_id, phone]);
  if (!booking) return res.json({ success: false, message: 'Booking not found. Check your booking ID and phone number.' });
  await db.query('UPDATE bookings SET status="cancelled" WHERE id=?', [booking_id]);
  res.json({ success: true });
});

// ── LOOK UP BOOKING ──────────────────────────────────────────
router.get('/booking/:id', async (req, res) => {
  const [[b]] = await db.query(`
    SELECT bk.*, s.departure_time, s.arrival_time,
           r.name AS route_name, r.origin, r.destination,
           bus.reg_number AS bus_reg
    FROM bookings bk
    JOIN schedules s ON bk.schedule_id = s.id
    JOIN routes r ON s.route_id = r.id
    JOIN buses bus ON s.bus_id = bus.id
    WHERE bk.id = ?`, [req.params.id]);
  if (!b) return res.json(null);
  res.json(b);
});


// ── GET BOOKED SEAT NUMBERS FOR A SCHEDULE ────────────
router.get('/seats/:scheduleId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT seat_number FROM bookings WHERE schedule_id=? AND status="confirmed" AND seat_number IS NOT NULL',
      [req.params.scheduleId]
    );
    res.json({ booked: rows.map(r => r.seat_number) });
  } catch(err) { res.json({ booked: [] }); }
});

module.exports = router;
