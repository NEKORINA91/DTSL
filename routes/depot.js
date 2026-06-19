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

// Stats
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
           CONCAT(c.first_name,' ',c.last_name) AS conductor,
           s.departure_time,s.arrival_time,s.status,s.is_emergency,
           CASE WHEN s.status='in_progress' AND s.arrival_time<NOW() THEN 1 ELSE 0 END AS is_delayed
    FROM schedules s JOIN routes r ON s.route_id=r.id
    JOIN buses b ON s.bus_id=b.id JOIN users u ON s.driver_id=u.id
    LEFT JOIN users c ON s.conductor_id=c.id
    WHERE b.depot_id=? ORDER BY s.departure_time DESC LIMIT 8`,[did(req)]);

  const [licAlerts] = await db.query(`
    SELECT id,first_name,last_name,license_id,license_expiry FROM users
    WHERE depot_id=? AND role IN ('driver','conductor') AND status='active'
    AND license_expiry IS NOT NULL AND license_expiry<=DATE_ADD(CURDATE(),INTERVAL 60 DAY)
    ORDER BY license_expiry`,[did(req)]);

  res.json({stats:{buses,routes,staff,trips,completed_today,delayed,utilRate},recent,licAlerts});
});

// Staff assigned by supa 
router.get('/staff', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT u.*,b.reg_number AS assigned_bus FROM users u
    LEFT JOIN buses b ON u.assigned_bus_id=b.id
    WHERE u.depot_id=? AND u.role IN ('driver','conductor') AND u.status='active'
    ORDER BY u.role,u.first_name`,[did(req)]);
  res.json(rows);
});

// busses added by supa
router.get('/buses', depotOnly, async (req,res) => {
  const [rows] = await db.query(`
    SELECT b.*,r.name AS route_name FROM buses b
    LEFT JOIN routes r ON b.route_id=r.id
    WHERE b.depot_id=? ORDER BY b.reg_number`,[did(req)]);
  res.json(rows);
});

// depo change bus status
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

// toutes
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

// shedules
router.get('/schedules', depotOnly, async (req,res) => {
  const {view,date}=req.query;
  let dateFilter=''; const params=[did(req)];
  if(view==='week'&&date){dateFilter='AND s.departure_time>=? AND s.departure_time<DATE_ADD(?,INTERVAL 7 DAY)';params.push(date,date);}
  if(view==='month'&&date){dateFilter='AND YEAR(s.departure_time)=YEAR(?) AND MONTH(s.departure_time)=MONTH(?)';params.push(date,date);}
  const [rows] = await db.query(`
    SELECT s.*,r.name AS route_name,r.origin,r.destination,
           b.reg_number AS bus_reg,ro.road_name,
           CONCAT(u.first_name,' ',u.last_name) AS driver_name,
           CONCAT(c.first_name,' ',c.last_name) AS conductor_name,
           CASE WHEN s.status='in_progress' AND s.arrival_time<NOW() THEN 1 ELSE 0 END AS is_delayed
    FROM schedules s JOIN routes r ON s.route_id=r.id
    JOIN buses b ON s.bus_id=b.id
    JOIN users u ON s.driver_id=u.id
    LEFT JOIN users c ON s.conductor_id=c.id
    LEFT JOIN road_options ro ON s.road_option_id=ro.id
    WHERE b.depot_id=? ${dateFilter}
    ORDER BY s.departure_time DESC`,params);
  res.json(rows);
});

router.post('/schedules', depotOnly, async (req,res) => {
  const {route_id,bus_id,driver_id,conductor_id,road_option_id,departure_time,arrival_time,is_emergency,override_reason}=req.body;

  // validate required fields
  if(!route_id||!bus_id||!driver_id||!conductor_id||!departure_time||!arrival_time)
    return res.json({success:false,message:'Route, bus, driver, conductor, departure and arrival time are all required.'});
  if(driver_id===conductor_id)
    return res.json({success:false,message:'Driver and conductor must be different people.'});
  if(new Date(arrival_time)<=new Date(departure_time))
    return res.json({success:false,message:'Arrival time must be after departure time.'});

  // verify bus belongs to depot and is active
  const [[bus]] = await db.query('SELECT status FROM buses WHERE id=? AND depot_id=?',[bus_id,did(req)]);
  if(!bus) return res.json({success:false,message:'Bus not found in your depot.'});
  if(bus.status==='maintenance') return res.json({success:false,message:'This bus is under maintenance and cannot be scheduled.'});
  if(bus.status==='retired') return res.json({success:false,message:'This bus is retired and cannot be scheduled.'});

  if(!is_emergency){
    // bus conflict — same bus overlapping time
    const [bc] = await db.query(
      `SELECT id FROM schedules WHERE bus_id=? AND status NOT IN ('cancelled','completed')
       AND departure_time < ? AND arrival_time > ?`,
      [bus_id, arrival_time, departure_time]);
    if(bc.length) return res.json({success:false,conflict:'bus',message:`This bus already has a schedule during that time. Choose a different bus or time.`});

    // driver conflict — same driver overlapping time
    const [dc] = await db.query(
      `SELECT id FROM schedules WHERE driver_id=? AND status NOT IN ('cancelled','completed')
       AND departure_time < ? AND arrival_time > ?`,
      [driver_id, arrival_time, departure_time]);
    if(dc.length) return res.json({success:false,conflict:'driver',message:`This driver is already assigned to another schedule during that time.`});

    // conductor conflict — same conductor overlapping time
    const [cc] = await db.query(
      `SELECT id FROM schedules WHERE conductor_id=? AND status NOT IN ('cancelled','completed')
       AND departure_time < ? AND arrival_time > ?`,
      [conductor_id, arrival_time, departure_time]);
    if(cc.length) return res.json({success:false,conflict:'conductor',message:`This conductor is already assigned to another schedule during that time.`});
  }

  const [r] = await db.query(
    `INSERT INTO schedules (route_id,bus_id,driver_id,conductor_id,road_option_id,departure_time,arrival_time,is_emergency,override_reason)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [route_id,bus_id,driver_id,conductor_id,road_option_id||null,departure_time,arrival_time,is_emergency?1:0,override_reason||null]);
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

// maintainance
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

// expemses
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

// nalysis
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

// report part
const { drawHeader, sectionTitle, statCards, drawTable, barChart, donutRow, addFooters, COLORS }
  = require('./pdfHelpers');

router.post('/reports/generate', depotOnly, async (req,res) => {
  const {type,period,bus_id}=req.body;
  let dateFilter='';
  if(period==='week') dateFilter='AND s.departure_time>=DATE_SUB(NOW(),INTERVAL 7 DAY)';
  if(period==='month')dateFilter='AND s.departure_time>=DATE_SUB(NOW(),INTERVAL 30 DAY)';
  let busFilter=bus_id?'AND b.id=?':'';
  let busFilterParams=bus_id?[did(req),bus_id]:[did(req)];
  
  // Filter expenses by category based on report type
  let categoryFilter='';
  if(type==='fuel') categoryFilter='AND e.category="fuel"';

  const [scheds] = await db.query(`
    SELECT s.*,r.name AS route_name,b.reg_number,
           CONCAT(u.first_name,' ',u.last_name) AS driver_name,
           CONCAT(c.first_name,' ',c.last_name) AS conductor_name
    FROM schedules s JOIN routes r ON s.route_id=r.id
    JOIN buses b ON s.bus_id=b.id JOIN users u ON s.driver_id=u.id
    LEFT JOIN users c ON s.conductor_id=c.id
    WHERE b.depot_id=? ${busFilter} ${dateFilter} ORDER BY s.departure_time DESC LIMIT 100`,busFilterParams);

  const [expSummary] = await db.query(`
    SELECT b.reg_number, SUM(e.amount) AS total,
           SUM(CASE WHEN e.category='fuel' THEN e.amount ELSE 0 END) AS fuel
    FROM buses b
    LEFT JOIN schedules s ON s.bus_id=b.id
    LEFT JOIN expense_receipts e ON e.schedule_id=s.id
    WHERE b.depot_id=? ${busFilter} ${categoryFilter} GROUP BY b.id,b.reg_number ORDER BY total DESC LIMIT 8`,busFilterParams);

  const [routePerf] = await db.query(`
    SELECT r.name AS route_name, COUNT(s.id) AS total,
           SUM(CASE WHEN s.status='completed' THEN 1 ELSE 0 END) AS completed
    FROM routes r LEFT JOIN schedules s ON s.route_id=r.id
    LEFT JOIN buses b ON s.bus_id=b.id
    WHERE r.depot_id=? ${busFilter} GROUP BY r.id,r.name HAVING total>0 ORDER BY total DESC LIMIT 8`,busFilterParams);

  const completed = scheds.filter(s => s.status === 'completed').length;
  const delayedCount = scheds.filter(s => s.status === 'in_progress' && new Date(s.arrival_time) < new Date()).length;
  const rate = scheds.length > 0 ? Math.round((completed / scheds.length) * 100) : 0;
  const totalExpense = expSummary.reduce((a, b) => a + parseFloat(b.total || 0), 0);

  const doc = new PDFDocument({ margin: 45, bufferPages: true, size: 'A4' });
  const fname = `report_depot${did(req)}_${type}_${Date.now()}.pdf`;
  const fpath = path.join(__dirname, '../public/uploads', fname);
  doc.pipe(fs.createWriteStream(fpath));

  //  HEADER 
  drawHeader(doc, `${type.toUpperCase()} REPORT`, `${req.session.user.name} · ${new Date().toLocaleDateString('en-GB')}`);

  //  STAT CARDS 
  statCards(doc, [
    { label: 'Total Trips', value: scheds.length, color: COLORS.primary },
    { label: 'Completed', value: completed, color: COLORS.green },
    { label: 'Completion Rate', value: rate + '%', color: rate >= 70 ? COLORS.green : rate >= 40 ? COLORS.amber : COLORS.red },
    { label: 'Delayed', value: delayedCount, color: COLORS.red },
    { label: 'Total Expenses', value: 'Rs ' + Math.round(totalExpense / 1000) + 'k', color: COLORS.amber },
  ]);

  // Route performance
  if (routePerf.length) {
    sectionTitle(doc, 'Route Performance — Trips Completed');
    barChart(doc, routePerf.map(r => ({
      label: r.route_name.length > 22 ? r.route_name.slice(0, 20) + '…' : r.route_name,
      value: r.completed,
      color: COLORS.primary
    })), { maxValue: Math.max(...routePerf.map(r => r.total)) });
  }

  // expence table
  if (expSummary.length) {
    const expenseTitle = type === 'fuel' ? 'Fuel Consumption per Bus' : 'Expense Summary per Bus';
    sectionTitle(doc, expenseTitle);
    const expenseColumns = type === 'fuel' 
      ? [
          { key: 'reg_number', label: 'Bus', width: 0.4 },
          { key: 'fuel', label: 'Fuel (LKR)', width: 0.6, align: 'right', format: v => 'Rs ' + parseFloat(v || 0).toLocaleString() },
        ]
      : [
          { key: 'reg_number', label: 'Bus', width: 0.3 },
          { key: 'fuel', label: 'Fuel (LKR)', width: 0.35, align: 'right', format: v => 'Rs ' + parseFloat(v || 0).toLocaleString() },
          { key: 'total', label: 'Total (LKR)', width: 0.35, align: 'right', format: v => 'Rs ' + parseFloat(v || 0).toLocaleString() },
        ];
    drawTable(doc, expenseColumns, expSummary);
  }

  // shedule tables
  sectionTitle(doc, 'Schedule Detail');
  drawTable(doc,
    [
      { key: 'route_name', label: 'Route', width: 0.26 },
      { key: 'reg_number', label: 'Bus', width: 0.12 },
      { key: 'driver_name', label: 'Driver', width: 0.18 },
      { key: 'conductor_name', label: 'Conductor', width: 0.18, format: v => v || '—' },
      { key: 'departure_time', label: 'Departure', width: 0.16, format: v => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
      {
        key: 'status', label: 'Status', width: 0.10,
        color: (row) => {
          const isDelayed = row.status === 'in_progress' && new Date(row.arrival_time) < new Date();
          if (isDelayed) return COLORS.red;
          if (row.status === 'completed') return COLORS.green;
          if (row.status === 'cancelled') return COLORS.gray;
          return COLORS.primary;
        },
        format: (v, row) => {
          const isDelayed = row.status === 'in_progress' && new Date(row.arrival_time) < new Date();
          return isDelayed ? 'DELAYED' : v.toUpperCase();
        }
      },
    ],
    scheds
  );

  addFooters(doc, req.session.user.name);
  doc.end();

  await db.query('INSERT INTO reports (user_id,depot_id,type,export_path) VALUES (?,?,?,?)',
    [req.session.user.id, did(req), type, '/uploads/' + fname]);
  res.json({ success: true, file: '/uploads/' + fname });
});
module.exports = router;