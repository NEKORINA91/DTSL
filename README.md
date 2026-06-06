# DTSL — Digital Transport Sri Lanka
CS6003 Advanced Software Engineering — Coursework 1

## Setup (one time only)

### Step 1 — Install Node.js
Download from https://nodejs.org and install (LTS version)

### Step 2 — Set up the database
1. Open XAMPP → start MySQL
2. Go to http://localhost/phpmyadmin
3. Click Import → choose dtsl.sql → click Go

### Step 3 — Install packages
Open terminal/cmd inside this folder:
```
npm install
```

### Step 4 — Run the server
```
node server.js
```

### Step 5 — Open the app
http://localhost:3000

---

## Demo Login Accounts (password: password123)
| Role      | Email                  |
|-----------|------------------------|
| Admin     | admin@dtsl.com        |
| Driver    | driver@dtsl.com       |
| Conductor | conductor@dtsl.com    |
| Customer  | customer@dtsl.com     |

---

## Folder Structure
```
dtsl/
├── server.js          ← start here
├── dtsl.sql          ← import this to phpMyAdmin
├── package.json
├── config/db.js       ← database connection
├── middleware/auth.js ← login/role protection
├── routes/
│   ├── auth.js        ← login, logout
│   ├── admin.js       ← all admin API
│   ├── staff.js       ← staff API
│   └── customer.js    ← public API
└── public/
    ├── login.html
    ├── admin.html
    ├── staff.html
    ├── customer.html
    └── uploads/       ← receipt and license photos
```
