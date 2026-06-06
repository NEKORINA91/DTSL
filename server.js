const express        = require('express');
const session        = require('express-session');
const flash          = require('connect-flash');
const methodOverride = require('method-override');
const path           = require('path');

const app = express();

// ── CSP ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://unpkg.com; " +
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org; " +
    "connect-src 'self'; font-src 'self' data:;"
  );
  next();
});

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'dtsl_2026_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(flash());

// ── PAGES ────────────────────────────────────────────────────
app.get('/',         (req, res) => res.redirect('/login'));
app.get('/login',    (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/admin',    (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});
app.get('/staff',    (req, res) => {
  if (!req.session.user || !['driver','conductor'].includes(req.session.user.role)) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public/staff.html'));
});
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public/customer.html')));

// ── API ROUTES ───────────────────────────────────────────────
app.use('/',          require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api',       require('./routes/customer'));
app.use('/',          require('./routes/customer'));

// ── START ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DTSL running → http://localhost:${PORT}`));
