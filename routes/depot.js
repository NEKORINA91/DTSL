const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const PDFDocument = require('pdfkit');
const fs      = require('fs');
const path    = require('path');

function depotOnly(req,res,next){
  if(!req.session.user||req.session.user.role!=='depot') return res.status(401).json({error:'Unauthorized'});
  next();
}
const did = req => req.session.user.depot_id;
const fmtDT = d => new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

// ── STATS ─────────────────────────────────────────────────────
router.get('/stats', depotOnly, async (req,res) => {
  const [[{buses}]]  = await db.query('SELECT COUNT(*) AS buses FROM buses WHERE depot_id=? AND status="active"',[did(req)]);
  const [[{routes}]] = await db.query('SELECT COUNT(*) AS routes FROM routes WHERE depot_id=? AND status="active"',[did(req)]);
  const [[{staff}]]  = await db.query('SELECT COUNT(*) AS staff FROM users WHERE depot_id=? AND status="active"',[did(req)]);
  const [[{trips}]]  = await db.query(`SELECT COUNT(*) AS trips FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE b.depot_id=? AND s.status='scheduled'`,[did(req)]);
  const [[{completed_today}]] = await db.query(`SELECT COUNT(*) AS completed_today FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE b.depot_id=? AND s.status='completed' AND DATE(s.arrival_time)=CURDATE()`,[did(req)]);
  const [[{delayed}]] = await db.query(`SELECT COUNT(*) AS \`delayed\` FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE b.depot_id=? AND s.status='in_progress' AND s.arrival_time<NOW()`,[did(req)]);
  const [[{util}]] = await db.query(`SELECT COUNT(DISTINCT s.bus_id) AS util FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE b.depot_id=? AND s.status IN ('in_progress','completed') AND DATE(s.departure_time)=CURDATE()`,[did(req)]);
  const utilRate = buses>0?Math.round((util/buses)*100):0;

  const [recent] = await db.query(`
    SELECT s.id,r.name AS route,b.reg_number AS bus,
           CONCAT(u.first_name,' ',u.last_name) AS driver,
           s.departure_time,s.arrival_time,s.status,s.is_emergency,
           CASE WHEN s.status='in_progress' AND s.arrival_time<NOW() THEN 1 ELSE 0 END AS is_delayed
    FROM schedules s JOIN routes r ON s.route_id=r.id
    JOIN buses b ON s.bus_id=b.id JOIN users u ON s.driver_id=u.id
    WHERE b.depot_id=? ORDER BY s.departure_time DESC LIMIT 8`,[did(req)]);

  const [licAlerts] = await db.query(`
    SELECT id,first_name,last_name,license_id,license_expiry FROM users
    WHERE depot_id=? AND role IN ('driver','conductor') AND status='active'
    AND license_expiry IS NOT NULL AND license_expiry<=DATE_ADD(CURDATE(),INTERVAL 60 DAY)
    ORDER BY license_expiry`,[did(req)]);

  res.json({stats:{buses,routes,staff,trips,completed_today,delayed,utilRate},recent,licAlerts});
});

// ── STAFF (read only — assigned by superadmin) ────────────────
router.get('/staff', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT u.*,b.reg_number AS assigned_bus FROM users u
    LEFT JOIN buses b ON u.assigned_bus_id=b.id
    WHERE u.depot_id=? AND u.role IN ('driver','conductor') AND u.status='active'
    ORDER BY u.role,u.first_name`,[did(req)]);
  res.json(rows);
});

// ── BUSES (read only — assigned by superadmin, depot marks maintenance) ──
router.get('/buses', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT b.*,r.name AS route_name FROM buses b
    LEFT JOIN routes r ON b.route_id=r.id
    WHERE b.depot_id=? ORDER BY b.reg_number`,[did(req)]);
  res.json(rows);
});

// depot admin can change bus status (active/maintenance/retired)
router.patch('/buses/:id/status', depotOnly, async (req,res) => {
  const {status} = req.body;
  // verify bus belongs to this depot
  const [rows] = await db.query('SELECT id FROM buses WHERE id=? AND depot_id=?',[req.params.id,did(req)]);
  if(!rows.length) return res.json({success:false,message:'Bus not found in your depot.'});
  await db.query('UPDATE buses SET status=? WHERE id=?',[status,req.params.id]);
  // if marking maintenance, cancel upcoming scheduled trips for this bus
  if(status==='maintenance'){
    await db.query(`UPDATE schedules SET status='cancelled' WHERE bus_id=? AND status='scheduled'`,[req.params.id]);
  }
  res.json({success:true});
});

// ── ROUTES ────────────────────────────────────────────────────
router.get('/routes', depotOnly, async (req,res) => {
  const [routes] = await db.query('SELECT * FROM routes WHERE depot_id=? AND status="active" ORDER BY name',[did(req)]);
  for(const r of routes){
    const [opts] = await db.query('SELECT * FROM road_options WHERE route_id=?',[r.id]);
    r.road_options=opts;
  }
  res.json(routes);
});

router.post('/routes', depotOnly, async (req,res) => {
  const {name,origin,destination,total_distance,road_options}=req.body;
  const [r] = await db.query('INSERT INTO routes (name,origin,destination,total_distance,depot_id) VALUES (?,?,?,?,?)',
    [name,origin,destination,total_distance,did(req)]);
  if(road_options&&road_options.length)
    for(const o of road_options)
      await db.query('INSERT INTO road_options (route_id,road_name,distance,description) VALUES (?,?,?,?)',
        [r.insertId,o.road_name,o.distance,o.description||'']);
  res.json({success:true,id:r.insertId});
});

router.patch('/routes/:id', depotOnly, async (req,res) => {
  const {name,origin,destination,total_distance,road_options}=req.body;
  await db.query('UPDATE routes SET name=?,origin=?,destination=?,total_distance=? WHERE id=? AND depot_id=?',
    [name,origin,destination,total_distance,req.params.id,did(req)]);
  if(road_options){
    await db.query('DELETE FROM road_options WHERE route_id=?',[req.params.id]);
    for(const o of road_options)
      await db.query('INSERT INTO road_options (route_id,road_name,distance,description) VALUES (?,?,?,?)',
        [req.params.id,o.road_name,o.distance,o.description||'']);
  }
  res.json({success:true});
});

router.delete('/routes/:id', depotOnly, async (req,res) => {
  await db.query('DELETE FROM routes WHERE id=? AND depot_id=?',[req.params.id,did(req)]);
  res.json({success:true});
});

// ── SCHEDULES ─────────────────────────────────────────────────
router.get('/schedules', depotOnly, async (req,res) => {
  const {view,date}=req.query;
  let dateFilter=''; const params=[did(req)];
  if(view==='week'&&date){dateFilter='AND s.departure_time>=? AND s.departure_time<DATE_ADD(?,INTERVAL 7 DAY)';params.push(date,date);}
  if(view==='month'&&date){dateFilter='AND YEAR(s.departure_time)=YEAR(?) AND MONTH(s.departure_time)=MONTH(?)';params.push(date,date);}
  const [rows] = await db.query(`
    SELECT s.*,r.name AS route_name,r.origin,r.destination,
           b.reg_number AS bus_reg,ro.road_name,
           CONCAT(u.first_name,' ',u.last_name) AS driver_name,
           CASE WHEN s.status='in_progress' AND s.arrival_time<NOW() THEN 1 ELSE 0 END AS is_delayed
    FROM schedules s JOIN routes r ON s.route_id=r.id
    JOIN buses b ON s.bus_id=b.id JOIN users u ON s.driver_id=u.id
    LEFT JOIN road_options ro ON s.road_option_id=ro.id
    WHERE b.depot_id=? ${dateFilter}
    ORDER BY s.departure_time DESC`,params);
  res.json(rows);
});

router.post('/schedules', depotOnly, async (req,res) => {
  const {route_id,bus_id,driver_id,road_option_id,departure_time,arrival_time,is_emergency,override_reason}=req.body;
  // verify bus is active
  const [[bus]] = await db.query('SELECT status FROM buses WHERE id=? AND depot_id=?',[bus_id,did(req)]);
  if(!bus) return res.json({success:false,message:'Bus not found in your depot.'});
  if(bus.status==='maintenance') return res.json({success:false,message:'This bus is currently under maintenance and cannot be scheduled.'});
  if(bus.status==='retired') return res.json({success:false,message:'This bus is retired and cannot be scheduled.'});
  if(!is_emergency){
    const [bc] = await db.query(`SELECT id FROM schedules WHERE bus_id=? AND status NOT IN ('cancelled','completed') AND departure_time<? AND arrival_time>?`,[bus_id,arrival_time,departure_time]);
    if(bc.length) return res.json({success:false,conflict:'bus',message:'This bus already has a schedule during that time.'});
    const [dc] = await db.query(`SELECT id FROM schedules WHERE driver_id=? AND status NOT IN ('cancelled','completed') AND departure_time<? AND arrival_time>?`,[driver_id,arrival_time,departure_time]);
    if(dc.length) return res.json({success:false,conflict:'driver',message:'This driver is already assigned during that time.'});
  }
  const [r] = await db.query(`INSERT INTO schedules (route_id,bus_id,driver_id,road_option_id,departure_time,arrival_time,is_emergency,override_reason) VALUES (?,?,?,?,?,?,?,?)`,
    [route_id,bus_id,driver_id,road_option_id||null,departure_time,arrival_time,is_emergency?1:0,override_reason||null]);
  res.json({success:true,id:r.insertId});
});

router.patch('/schedules/:id', depotOnly, async (req,res) => {
  const {status}=req.body;
  await db.query('UPDATE schedules SET status=? WHERE id=?',[status,req.params.id]);
  res.json({success:true});
});

router.delete('/schedules/:id', depotOnly, async (req,res) => {
  await db.query('DELETE FROM schedules WHERE id=?',[req.params.id]);
  res.json({success:true});
});

// ── LIVE ─────────────────────────────────────────────────────
router.get('/live', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT l.latitude,l.longitude,l.timestamp,l.sos,
           b.reg_number,CONCAT(u.first_name,' ',u.last_name) AS driver_name,
           r.name AS route_name
    FROM live_locations l JOIN buses b ON l.bus_id=b.id
    JOIN users u ON l.staff_id=u.id
    LEFT JOIN schedules s ON s.bus_id=l.bus_id AND s.status='in_progress'
    LEFT JOIN routes r ON s.route_id=r.id
    WHERE b.depot_id=? AND l.timestamp>=DATE_SUB(NOW(),INTERVAL 10 MINUTE)`,[did(req)]);
  res.json(rows);
});

// ── MAINTENANCE ───────────────────────────────────────────────
router.get('/maintenance', depotOnly, async (req,res) => {
  const [rows] = await db.query(`SELECT m.*,b.reg_number FROM maintenance_logs m
    JOIN buses b ON m.bus_id=b.id WHERE b.depot_id=? ORDER BY m.service_date DESC`,[did(req)]);
  res.json(rows);
});

router.get('/maintenance/due', depotOnly, async (req,res) => {
  const [rows] = await db.query(`SELECT m.*,b.reg_number FROM maintenance_logs m
    JOIN buses b ON m.bus_id=b.id WHERE b.depot_id=?
    AND m.next_service BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 30 DAY)
    ORDER BY m.next_service`,[did(req)]);
  res.json(rows);
});

router.post('/maintenance', depotOnly, async (req,res) => {
  const {bus_id,service_date,type,description,cost,technician_name,next_service}=req.body;
  await db.query(`INSERT INTO maintenance_logs (bus_id,service_date,type,description,cost,technician_name,next_service) VALUES (?,?,?,?,?,?,?)`,
    [bus_id,service_date,type,description,cost,technician_name||null,next_service||null]);
  // also mark bus as maintenance
  await db.query('UPDATE buses SET status="maintenance" WHERE id=?',[bus_id]);
  // cancel upcoming scheduled trips
  await db.query(`UPDATE schedules SET status='cancelled' WHERE bus_id=? AND status='scheduled'`,[bus_id]);
  res.json({success:true});
});

// ── EXPENSES ─────────────────────────────────────────────────
router.get('/expenses', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT e.*,CONCAT(u.first_name,' ',u.last_name) AS staff_name,b.reg_number
    FROM expense_receipts e JOIN users u ON e.staff_id=u.id
    LEFT JOIN schedules s ON e.schedule_id=s.id
    LEFT JOIN buses b ON s.bus_id=b.id
    WHERE u.depot_id=? ORDER BY e.submitted_at DESC`,[did(req)]);
  res.json(rows);
});

router.get('/expenses/summary', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT b.id,b.reg_number,
           SUM(e.amount) AS total,
           SUM(CASE WHEN e.category='fuel' THEN e.amount ELSE 0 END) AS fuel,
           COUNT(e.id) AS receipts
    FROM buses b LEFT JOIN schedules s ON s.bus_id=b.id
    LEFT JOIN expense_receipts e ON e.schedule_id=s.id
    WHERE b.depot_id=? GROUP BY b.id,b.reg_number ORDER BY total DESC`,[did(req)]);
  res.json(rows);
});

router.get('/expenses/fuel-trend', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT DATE_FORMAT(e.submitted_at,'%Y-%m') AS month,SUM(e.amount) AS total
    FROM expense_receipts e JOIN users u ON e.staff_id=u.id
    WHERE u.depot_id=? AND e.category='fuel' AND e.submitted_at>=DATE_SUB(NOW(),INTERVAL 6 MONTH)
    GROUP BY month ORDER BY month`,[did(req)]);
  res.json(rows);
});

// ── ANALYTICS ────────────────────────────────────────────────
router.get('/analytics/completion', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT r.name AS route_name,COUNT(s.id) AS total,
           SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) AS completed,
           ROUND(SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END)/COUNT(s.id)*100,1) AS rate
    FROM routes r LEFT JOIN schedules s ON s.route_id=r.id
    WHERE r.depot_id=? GROUP BY r.id,r.name HAVING total>0 ORDER BY rate DESC`,[did(req)]);
  res.json(rows);
});

router.get('/analytics/utilisation', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT b.reg_number,COUNT(s.id) AS total_trips,
           SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) AS completed
    FROM buses b LEFT JOIN schedules s ON s.bus_id=b.id
    WHERE b.depot_id=? GROUP BY b.id,b.reg_number ORDER BY total_trips DESC`,[did(req)]);
  res.json(rows);
});

// ── REPORTS ──────────────────────────────────────────────────
router.post('/reports/generate', depotOnly, async (req,res) => {
  const {type,period}=req.body;
  let dateFilter='';
  if(period==='week') dateFilter='AND s.departure_time>=DATE_SUB(NOW(),INTERVAL 7 DAY)';
  if(period==='month')dateFilter='AND s.departure_time>=DATE_SUB(NOW(),INTERVAL 30 DAY)';
  const [scheds] = await db.query(`
    SELECT s.*,r.name AS route_name,b.reg_number,CONCAT(u.first_name,' ',u.last_name) AS driver_name
    FROM schedules s JOIN routes r ON s.route_id=r.id
    JOIN buses b ON s.bus_id=b.id JOIN users u ON s.driver_id=u.id
    WHERE b.depot_id=? ${dateFilter} ORDER BY s.departure_time DESC LIMIT 100`,[did(req)]);
  const completed=scheds.filter(s=>s.status==='completed').length;
  const rate=scheds.length>0?Math.round(completed/scheds.length*100):0;
  const doc=new PDFDocument({margin:50});
  const fname=`report_depot${did(req)}_${type}_${Date.now()}.pdf`;
  const fpath=path.join(__dirname,'../public/uploads',fname);
  doc.pipe(fs.createWriteStream(fpath));
  doc.fontSize(20).fillColor('#1a4fa0').text(`DTSL — ${req.session.user.name} — ${type.toUpperCase()} REPORT`,{align:'center'});
  doc.moveDown(0.3).fontSize(10).fillColor('#666').text(`Generated: ${new Date().toLocaleString()} | Period: ${period||'All time'}`,{align:'center'});
  doc.moveDown().moveTo(50,doc.y).lineTo(550,doc.y).strokeColor('#1a4fa0').stroke().moveDown();
  doc.fontSize(12).fillColor('#1a4fa0').text('Summary');
  doc.fontSize(10).fillColor('#333').text(`Total Schedules: ${scheds.length}`).text(`Completed: ${completed}`).text(`Completion Rate: ${rate}%`);
  doc.moveDown().fontSize(12).fillColor('#1a4fa0').text('Schedule Detail');
  doc.fontSize(8).fillColor('#333');
  scheds.forEach(s=>{
    const del=s.status==='in_progress'&&new Date(s.arrival_time)<new Date()?'[DELAYED]':'';
    doc.text(`${s.route_name} | ${s.reg_number} | ${s.driver_name} | ${fmtDT(s.departure_time)} | ${s.status} ${del}`);
  });
  doc.end();
  await db.query('INSERT INTO reports (user_id,depot_id,type,export_path) VALUES (?,?,?,?)',
    [req.session.user.id,did(req),type,'/uploads/'+fname]);
  res.json({success:true,file:'/uploads/'+fname});
});

// fuel consumption per route
router.get('/expenses/fuel-by-route', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT r.name AS route_name,
           SUM(e.amount) AS total_fuel,
           COUNT(DISTINCT s.bus_id) AS buses_used,
           ROUND(SUM(e.amount) / COUNT(s.id), 2) AS avg_per_trip
    FROM expense_receipts e
    JOIN schedules s ON e.schedule_id = s.id
    JOIN routes r ON s.route_id = r.id
    JOIN buses b ON s.bus_id = b.id
    WHERE b.depot_id = ? AND e.category = 'fuel'
    GROUP BY r.id, r.name
    ORDER BY total_fuel DESC`, [did(req)]);
  res.json(rows);
});

module.exports = router;
