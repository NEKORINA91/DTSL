const express       = require('express');
const router        = express.Router();
const db            = require('../config/db');
const bcrypt        = require('bcrypt');
const multer        = require('multer');
const path          = require('path');
const fs            = require('fs');
const PDFDocument   = require('pdfkit');
const { requireRole } = require('../middleware/auth');
const only = requireRole('superadmin');

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req,file,cb) => cb(null,'lic_'+Date.now()+path.extname(file.originalname))
});
const upload = multer({ storage, limits:{ fileSize:5*1024*1024 } });

// ── OVERVIEW STATS ────────────────────────────────────────────
router.get('/stats', only, async (req,res) => {
  const [[{total_depots}]]   = await db.query('SELECT COUNT(*) AS total_depots FROM depots');
  const [[{active_depots}]]  = await db.query('SELECT COUNT(*) AS active_depots FROM depots WHERE status="active"');
  const [[{total_buses}]]    = await db.query('SELECT COUNT(*) AS total_buses FROM buses');
  const [[{total_staff}]]    = await db.query('SELECT COUNT(*) AS total_staff FROM users WHERE role IN ("driver","conductor") AND status="active"');
  const [[{total_routes}]]   = await db.query('SELECT COUNT(*) AS total_routes FROM routes WHERE status="active"');
  const [[{total_schedules}]]= await db.query('SELECT COUNT(*) AS total_schedules FROM schedules WHERE status="scheduled"');

  // per-depot breakdown
  const [depots] = await db.query(`
    SELECT d.id, d.depot_code, d.name, d.location, d.status,
      (SELECT COUNT(*) FROM buses b WHERE b.depot_id=d.id) AS buses,
      (SELECT COUNT(*) FROM users u WHERE u.depot_id=d.id AND u.status='active') AS staff,
      (SELECT COUNT(*) FROM routes r WHERE r.depot_id=d.id AND r.status='active') AS routes,
      (SELECT COUNT(*) FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE b.depot_id=d.id AND s.status='scheduled') AS scheduled
    FROM depots d ORDER BY d.depot_code`);

  res.json({ stats:{ total_depots, active_depots, total_buses, total_staff, total_routes, total_schedules }, depots });
});

// ── DEPOTS ────────────────────────────────────────────────────
router.get('/depots', only, async (req,res) => {
  const [rows] = await db.query('SELECT * FROM depots ORDER BY depot_code');
  res.json(rows);
});

router.post('/depots', only, async (req,res) => {
  try {
    const { depot_code, name, location, password, status } = req.body;
    if (!depot_code||!name||!password) return res.json({ success:false, message:'Code, name and password required.' });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      'INSERT INTO depots (depot_code,name,location,password,status) VALUES (?,?,?,?,?)',
      [depot_code.toUpperCase(), name, location||'', hash, status||'active']
    );
    res.json({ success:true, id:r.insertId });
  } catch(err) {
    if (err.code==='ER_DUP_ENTRY') return res.json({ success:false, message:'Depot code already exists.' });
    res.json({ success:false, message:err.message });
  }
});

router.patch('/depots/:id', only, async (req,res) => {
  const { name, location, status, password } = req.body;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE depots SET name=?,location=?,status=?,password=? WHERE id=?',
      [name, location, status, hash, req.params.id]);
  } else {
    await db.query('UPDATE depots SET name=?,location=?,status=? WHERE id=?',
      [name, location, status, req.params.id]);
  }
  res.json({ success:true });
});

router.delete('/depots/:id', only, async (req,res) => {
  await db.query('UPDATE depots SET status="inactive" WHERE id=?', [req.params.id]);
  res.json({ success:true });
});

// ── STAFF (all depots) ─────────────────────────────────────────
router.get('/staff', only, async (req,res) => {
  const [rows] = await db.query(`
    SELECT u.*, d.name AS depot_name, d.depot_code, b.reg_number AS assigned_bus
    FROM users u
    LEFT JOIN depots d ON u.depot_id=d.id
    LEFT JOIN buses  b ON u.assigned_bus_id=b.id
    WHERE u.role IN ('driver','conductor') AND u.status='active'
    ORDER BY d.depot_code, u.role, u.first_name`);
  res.json(rows);
});

router.post('/staff', only, upload.single('license_photo'), async (req,res) => {
  try {
    const { id, first_name, last_name, email, phone, role, depot_id,
            ntc_number, license_id, license_expiry, assigned_bus_id, password, working_hours } = req.body;
    const photo = req.file ? '/uploads/'+req.file.filename : null;
    if (id) {
      let q='UPDATE users SET first_name=?,last_name=?,email=?,phone=?,role=?,depot_id=?,ntc_number=?,license_id=?,license_expiry=?,assigned_bus_id=?,working_hours=?';
      const p=[first_name,last_name,email,phone,role,depot_id||null,ntc_number,license_id,license_expiry||null,assigned_bus_id||null,working_hours||0];
      if (password){q+=',password=?';p.push(await bcrypt.hash(password,10));}
      if (photo)   {q+=',license_photo=?';p.push(photo);}
      q+=' WHERE id=?'; p.push(id);
      await db.query(q,p);
      res.json({ success:true });
    } else {
      const hash = await bcrypt.hash(password||'password123',10);
      const [r] = await db.query(
        'INSERT INTO users (first_name,last_name,email,phone,password,role,depot_id,ntc_number,license_id,license_expiry,license_photo,assigned_bus_id,working_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [first_name,last_name,email,phone,hash,role,depot_id||null,ntc_number,license_id,license_expiry||null,photo,assigned_bus_id||null,working_hours||0]
      );
      res.json({ success:true, id:r.insertId });
    }
  } catch(err) {
    if (err.code==='ER_DUP_ENTRY') return res.json({ success:false, message:'Email already exists.' });
    res.json({ success:false, message:err.message });
  }
});

router.delete('/staff/:id', only, async (req,res) => {
  await db.query('UPDATE users SET status="inactive" WHERE id=?', [req.params.id]);
  res.json({ success:true });
});

// ── BUSES (all depots) ─────────────────────────────────────────
router.get('/buses', only, async (req,res) => {
  const [rows] = await db.query(`
    SELECT b.*, d.name AS depot_name, d.depot_code, r.name AS route_name
    FROM buses b
    LEFT JOIN depots d ON b.depot_id=d.id
    LEFT JOIN routes r ON b.route_id=r.id
    ORDER BY d.depot_code, b.reg_number`);
  res.json(rows);
});

router.post('/buses', only, async (req,res) => {
  try {
    const { reg_number, capacity, mileage, status, depot_id } = req.body;
    const [r] = await db.query(
      'INSERT INTO buses (reg_number,capacity,mileage,status,depot_id) VALUES (?,?,?,?,?)',
      [reg_number, capacity, mileage||0, status||'active', depot_id||null]
    );
    res.json({ success:true, id:r.insertId });
  } catch(err) {
    if (err.code==='ER_DUP_ENTRY') return res.json({ success:false, message:'Registration number already exists.' });
    res.json({ success:false, message:err.message });
  }
});

router.patch('/buses/:id', only, async (req,res) => {
  const { reg_number, capacity, mileage, status, depot_id } = req.body;
  await db.query('UPDATE buses SET reg_number=?,capacity=?,mileage=?,status=?,depot_id=? WHERE id=?',
    [reg_number, capacity, mileage, status, depot_id||null, req.params.id]);
  res.json({ success:true });
});

router.delete('/buses/:id', only, async (req,res) => {
  await db.query('DELETE FROM buses WHERE id=?', [req.params.id]);
  res.json({ success:true });
});

// ── DEPOTS LIST (for dropdowns) ───────────────────────────────
router.get('/depots-list', only, async (req,res) => {
  const [rows] = await db.query('SELECT id, depot_code, name FROM depots WHERE status != "inactive" ORDER BY depot_code');
  res.json(rows);
});

module.exports = router;

// ── DEPOT-WISE REPORT (PDF) ───────────────────────────────────
router.post('/reports/generate', only, async (req, res) => {
  const { type, depot_id } = req.body;
  const depotFilter = depot_id ? `AND d.id=${db.escape(depot_id)}` : '';
  const staffFilter = depot_id ? `AND u.depot_id=${db.escape(depot_id)}` : '';
  const busFilter   = depot_id ? `AND b.depot_id=${db.escape(depot_id)}` : '';

  const [depots] = await db.query(`
    SELECT d.id, d.depot_code, d.name, d.location, d.status,
      (SELECT COUNT(*) FROM buses b WHERE b.depot_id=d.id) AS buses,
      (SELECT COUNT(*) FROM users u WHERE u.depot_id=d.id AND u.status='active') AS staff,
      (SELECT COUNT(*) FROM routes r WHERE r.depot_id=d.id AND r.status='active') AS routes,
      (SELECT COUNT(*) FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE b.depot_id=d.id AND s.status='completed') AS completed,
      (SELECT COUNT(*) FROM schedules s JOIN buses b ON s.bus_id=b.id WHERE b.depot_id=d.id) AS total_trips
    FROM depots d WHERE 1=1 ${depotFilter} ORDER BY d.depot_code`);

  const [staff] = await db.query(`
    SELECT u.first_name, u.last_name, u.email, u.role, u.phone,
           u.license_id, u.license_expiry, u.working_hours,
           d.depot_code, d.name AS depot_name
    FROM users u LEFT JOIN depots d ON u.depot_id=d.id
    WHERE u.role IN ('driver','conductor') AND u.status='active' ${staffFilter}
    ORDER BY d.depot_code, u.role, u.first_name`);

  const [buses] = await db.query(`
    SELECT b.reg_number, b.capacity, b.status, b.mileage, d.depot_code, d.name AS depot_name
    FROM buses b LEFT JOIN depots d ON b.depot_id=d.id
    WHERE 1=1 ${busFilter} ORDER BY d.depot_code, b.reg_number`);

  const doc = new PDFDocument({ margin: 50 });
  const fname = `superadmin_report_${Date.now()}.pdf`;
  const fpath = path.join(__dirname, '../public/uploads', fname);
  doc.pipe(fs.createWriteStream(fpath));

  doc.fontSize(20).fillColor('#1e1b4b').text('DTSL — Network-Wide Report', { align: 'center' });
  doc.moveDown(0.3).fontSize(10).fillColor('#666').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.moveDown().moveTo(50,doc.y).lineTo(550,doc.y).strokeColor('#1e1b4b').stroke().moveDown();

  // Network totals
  doc.fontSize(13).fillColor('#1e1b4b').text('Network Summary');
  doc.fontSize(10).fillColor('#333')
    .text(`Total Depots: ${depots.length}`)
    .text(`Total Staff: ${staff.length}`)
    .text(`Total Buses: ${depots.reduce((a,d)=>a+d.buses,0)}`)
    .text(`Total Completed Trips: ${depots.reduce((a,d)=>a+d.completed,0)}`);

  doc.moveDown().fontSize(13).fillColor('#1e1b4b').text('Depot Breakdown');
  depots.forEach(d => {
    const rate = d.total_trips>0?Math.round(d.completed/d.total_trips*100):0;
    doc.moveDown(0.3).fontSize(11).fillColor('#1a4fa0').text(`${d.depot_code} — ${d.name}`);
    doc.fontSize(9).fillColor('#333')
      .text(`  Location: ${d.location||'—'}  |  Status: ${d.status}`)
      .text(`  Buses: ${d.buses}  |  Staff: ${d.staff}  |  Routes: ${d.routes}  |  Completion Rate: ${rate}%`);
  });

  doc.moveDown().fontSize(13).fillColor('#1e1b4b').text('All Employees (Depot Wise)');
  let lastDepot = '';
  staff.forEach(s => {
    if (s.depot_code !== lastDepot) {
      doc.moveDown(0.3).fontSize(10).fillColor('#1a4fa0').text(`${s.depot_code} — ${s.depot_name}`);
      lastDepot = s.depot_code;
    }
    const exp = s.license_expiry ? new Date(s.license_expiry).toLocaleDateString('en-GB') : '—';
    doc.fontSize(8).fillColor('#333')
      .text(`  ${s.first_name} ${s.last_name} | ${s.role} | ${s.phone||'—'} | License: ${s.license_id||'—'} exp:${exp} | Hours: ${s.working_hours}`);
  });

  // Section visibility based on type
  const showStaff  = !type || type==='all_staff'  || type==='depot_staff'  || type==='full';
  const showBuses  = !type || type==='all_buses'  || type==='depot_buses'  || type==='full';
  const showDepots = !type || type==='full';

  if(showDepots){
    doc.moveDown().fontSize(13).fillColor('#1e1b4b').text('Depot Breakdown');
    depots.forEach(d => {
      const rate = d.total_trips>0?Math.round(d.completed/d.total_trips*100):0;
      doc.moveDown(0.3).fontSize(11).fillColor('#1a4fa0').text(`${d.depot_code} — ${d.name}`);
      doc.fontSize(9).fillColor('#333')
        .text(`  Location: ${d.location||'—'}  |  Status: ${d.status}  |  Buses: ${d.buses}  |  Staff: ${d.staff}  |  Completion: ${rate}%`);
    });
  }

  if(showStaff && staff.length){
    doc.moveDown().fontSize(13).fillColor('#1e1b4b').text('Employee Details');
    let lastDepot='';
    staff.forEach(s=>{
      if(s.depot_code!==lastDepot){
        doc.moveDown(0.3).fontSize(10).fillColor('#1a4fa0').text(`${s.depot_code} — ${s.depot_name}`);
        lastDepot=s.depot_code;
      }
      const exp=s.license_expiry?new Date(s.license_expiry).toLocaleDateString('en-GB'):'—';
      doc.fontSize(8).fillColor('#333')
        .text(`  ${s.first_name} ${s.last_name} | ${s.role} | ${s.phone||'—'} | License: ${s.license_id||'—'} exp:${exp} | Hours: ${s.working_hours}`);
    });
  }

  if(showBuses && buses.length){
    doc.moveDown().fontSize(13).fillColor('#1e1b4b').text('Bus Fleet');
    let lastDepot='';
    buses.forEach(b=>{
      if(b.depot_code!==lastDepot){
        doc.moveDown(0.3).fontSize(10).fillColor('#1a4fa0').text(`${b.depot_code} — ${b.depot_name}`);
        lastDepot=b.depot_code;
      }
      doc.fontSize(8).fillColor('#333')
        .text(`  ${b.reg_number} | Capacity: ${b.capacity} | Status: ${b.status} | Mileage: ${parseFloat(b.mileage).toLocaleString()} km`);
    });
  }

  doc.end();
  res.json({ success: true, file: '/uploads/' + fname });
});
