function isLoggedIn(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login');
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session && req.session.user && roles.includes(req.session.user.role)) return next();
    res.redirect('/login');
  };
}
module.exports = { isLoggedIn, requireRole };
