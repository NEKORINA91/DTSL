const express        = require('express');
const session        = require('express-session');
const path           = require('path');

const app = express();

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; " +
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org; " +
    "connect-src 'self'; font-src 'self' data: https://fonts.gstatic.com;"
  );
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'dtsl_2026_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// ── PAGES ────────────────────────────────────────────
app.get('/',           (req,res) => res.redirect('/login'));
app.get('/login',      (req,res) => res.sendFile(path.join(__dirname,'public/login.html')));
app.get('/superadmin', (req,res) => {
  if (!req.session.user || req.session.user.role !== 'superadmin') return res.redirect('/login');
  res.sendFile(path.join(__dirname,'public/superadmin.html'));
});
app.get('/depot', (req,res) => {
  if (!req.session.user || req.session.user.role !== 'depot') return res.redirect('/login');
  res.sendFile(path.join(__dirname,'public/depot.html'));
});
app.get('/staff', (req,res) => {
  if (!req.session.user || !['driver','conductor'].includes(req.session.user.role)) return res.redirect('/login');
  res.sendFile(path.join(__dirname,'public/staff.html'));
});

// ── API ───────────────────────────────────────────────
app.use('/',                 require('./routes/auth'));
app.use('/api/superadmin',   require('./routes/superadmin'));
app.use('/api/depot',        require('./routes/depot'));
app.use('/api/staff',        require('./routes/staff'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DTSL running → http://localhost:${PORT}`));
