-- ═══════════════════════════════════════════════════════════════
-- DTSL — Digital Transport Sri Lanka
-- Complete Database (schema + migrations + seed data)
-- 
-- HOW TO USE:
-- 1. Open phpMyAdmin
-- 2. Click "New" on the left → create database called: dtsl
-- 3. Click on dtsl → Import tab → choose this file → Go
-- That's it. One file, one import, done.
-- ═══════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS dtsl CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dtsl;

-- ── TABLES ───────────────────────────────────────────────────────

CREATE TABLE users (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  first_name       VARCHAR(80)  NOT NULL,
  last_name        VARCHAR(80)  NOT NULL,
  email            VARCHAR(150) NOT NULL UNIQUE,
  password         VARCHAR(255) NOT NULL,
  role             ENUM('admin','driver','conductor','customer') NOT NULL DEFAULT 'customer',
  phone            VARCHAR(20),
  ntc_number       VARCHAR(50),
  license_id       VARCHAR(50),
  license_expiry   DATE,
  license_photo    VARCHAR(255),
  assigned_bus_id  INT,
  working_hours    DECIMAL(6,2) NOT NULL DEFAULT 0,
  status           ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE buses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  reg_number   VARCHAR(20)   NOT NULL UNIQUE,
  capacity     INT           NOT NULL,
  status       ENUM('active','maintenance','retired') NOT NULL DEFAULT 'active',
  mileage      DECIMAL(10,2) NOT NULL DEFAULT 0,
  route_id     INT,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE routes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  origin         VARCHAR(100) NOT NULL,
  destination    VARCHAR(100) NOT NULL,
  total_distance DECIMAL(8,2) NOT NULL,
  status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE road_options (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  route_id    INT          NOT NULL,
  road_name   VARCHAR(150) NOT NULL,
  distance    DECIMAL(8,2) NOT NULL,
  description TEXT,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
);

CREATE TABLE schedules (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  route_id        INT      NOT NULL,
  bus_id          INT      NOT NULL,
  driver_id       INT      NOT NULL,
  road_option_id  INT,
  departure_time  DATETIME NOT NULL,
  arrival_time    DATETIME NOT NULL,
  status          ENUM('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  is_emergency    TINYINT(1) NOT NULL DEFAULT 0,
  override_reason TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id)       REFERENCES routes(id)       ON DELETE CASCADE,
  FOREIGN KEY (bus_id)         REFERENCES buses(id)        ON DELETE CASCADE,
  FOREIGN KEY (driver_id)      REFERENCES users(id)        ON DELETE CASCADE,
  FOREIGN KEY (road_option_id) REFERENCES road_options(id) ON DELETE SET NULL
);

CREATE TABLE bookings (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT          NOT NULL,
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(20)  NOT NULL,
  seats       INT          NOT NULL DEFAULT 1,
  seat_number INT,
  status      ENUM('confirmed','cancelled') NOT NULL DEFAULT 'confirmed',
  booked_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
);

CREATE TABLE maintenance_logs (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  bus_id          INT           NOT NULL,
  service_date    DATE          NOT NULL,
  type            ENUM('routine','corrective','emergency') NOT NULL,
  description     TEXT          NOT NULL,
  cost            DECIMAL(10,2) NOT NULL DEFAULT 0,
  technician_name VARCHAR(100),
  next_service    DATE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE CASCADE
);

CREATE TABLE expense_receipts (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  staff_id      INT           NOT NULL,
  schedule_id   INT,
  amount        DECIMAL(10,2) NOT NULL,
  category      ENUM('fuel','toll','maintenance','other') NOT NULL DEFAULT 'fuel',
  receipt_image VARCHAR(255),
  notes         TEXT,
  submitted_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id)    REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL
);

CREATE TABLE live_locations (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  bus_id    INT           NOT NULL,
  staff_id  INT           NOT NULL,
  latitude  DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  sos       TINYINT(1) NOT NULL DEFAULT 0,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (bus_id)   REFERENCES buses(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE reports (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  admin_id     INT NOT NULL,
  type         ENUM('weekly','monthly','fuel','performance') NOT NULL,
  export_path  VARCHAR(255),
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ── SEED DATA ─────────────────────────────────────────────────────
-- All passwords: password123

INSERT INTO users (first_name,last_name,email,password,role,phone,ntc_number,license_id,license_expiry,working_hours,status) VALUES
('Depot',  'Admin',       'admin@dtsl.com',       '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','admin',    '0771234567', NULL,        NULL,        NULL,        0,     'active'),
('Kamal',  'Perera',      'driver1@dtsl.com',     '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   '0771234001','NTC-D10234','B1234567','2026-08-15',186.5,'active'),
('Nimal',  'Silva',       'driver2@dtsl.com',     '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   '0771234002','NTC-D10235','B2345678','2025-11-30',204.0,'active'),
('Suresh', 'Fernando',    'driver3@dtsl.com',     '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   '0771234003','NTC-D10236','B3456789','2026-06-20',167.5,'active'),
('Rohan',  'Jayawardena', 'driver4@dtsl.com',     '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   '0771234004','NTC-D10237','B4567890','2024-03-10',145.0,'active'),
('Priya',  'Wickrama',    'conductor1@dtsl.com',  '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','conductor','0771234005','NTC-C20123','C1234567','2027-01-20',178.0,'active'),
('Amara',  'Dissanayake', 'conductor2@dtsl.com',  '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','conductor','0771234006','NTC-C20124','C2345678','2026-09-05',192.5,'active'),
('Lakmal', 'Bandara',     'conductor3@dtsl.com',  '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','conductor','0771234007','NTC-C20125','C3456789','2025-12-15',155.0,'active'),
('Saman',  'Fernando',    'customer@dtsl.com',    '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','customer', '0751112233', NULL,        NULL,        NULL,        0,     'active'),
('Dilini', 'Rathnayake',  'dilini@gmail.com',     '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','customer', '0752223344', NULL,        NULL,        NULL,        0,     'active');

INSERT INTO buses (reg_number,capacity,status,mileage) VALUES
('NB-1234',52,'active',      45230.50),
('NB-5678',48,'active',      38120.00),
('NC-9012',52,'maintenance', 72400.75),
('NC-3456',44,'active',      19800.00),
('ND-7890',52,'active',      28450.00),
('ND-2345',48,'active',      55100.25),
('NE-6789',44,'retired',     98700.00);

INSERT INTO routes (name,origin,destination,total_distance,status) VALUES
('Colombo — Kandy Express',    'Colombo','Kandy',       115.50,'active'),
('Colombo — Galle Coastal',    'Colombo','Galle',       116.00,'active'),
('Kandy — Nuwara Eliya Hill',  'Kandy',  'Nuwara Eliya', 78.20,'active'),
('Colombo — Kurunegala',       'Colombo','Kurunegala',   94.30,'active'),
('Colombo — Jaffna Intercity', 'Colombo','Jaffna',      396.00,'active'),
('Galle — Matara Coastal',     'Galle',  'Matara',       26.50,'active');

INSERT INTO road_options (route_id,road_name,distance,description) VALUES
(1,'A1 — Colombo-Kandy Road',      115.50,'Primary highway via Kadugannawa Pass. Scenic mountain route.'),
(1,'A6 — Via Kurunegala',          138.00,'Longer but flatter route via Kurunegala town.'),
(1,'B40 — Via Kegalle',            122.00,'Intermediate route through Kegalle and Mawanella.'),
(2,'A2 — Galle Road (Coastal)',    116.00,'Coastal highway with ocean views.'),
(2,'E01 — Southern Expressway',     96.00,'Fastest route. Toll applies at Kottawa and Gelanigama.'),
(3,'B40 — Kandy-NE via Ramboda',    78.20,'Mountain road via Ramboda Pass. Hairpin bends.'),
(3,'A5 — Via Ginigathena',          82.00,'Slightly longer alternative through Ginigathena.'),
(4,'A6 — Colombo-Kurunegala Road',  94.30,'Primary route via Ambepussa junction.'),
(5,'A9 — North Road via Dambulla', 396.00,'Main intercity highway via Dambulla and Vavuniya.'),
(6,'A2 — Galle-Matara Southern',    26.50,'Short coastal hop along A2 highway.');

INSERT INTO schedules (route_id,bus_id,driver_id,road_option_id,departure_time,arrival_time,status) VALUES
(1,1,2,1, '2026-05-20 06:00:00','2026-05-20 09:30:00','completed'),
(2,2,3,4, '2026-05-20 07:00:00','2026-05-20 09:45:00','completed'),
(3,4,4,6, '2026-05-21 08:00:00','2026-05-21 10:30:00','completed'),
(4,5,2,8, '2026-05-22 05:30:00','2026-05-22 07:45:00','completed'),
(1,6,3,2, '2026-05-23 06:00:00','2026-05-23 09:50:00','completed'),
(2,1,4,5, '2026-05-24 07:30:00','2026-05-24 09:30:00','completed'),
(5,2,2,9, '2026-05-25 05:00:00','2026-05-25 14:30:00','completed'),
(6,4,3,10,'2026-05-26 09:00:00','2026-05-26 09:45:00','completed'),
(3,5,4,7, '2026-05-27 08:00:00','2026-05-27 10:45:00','completed'),
(1,6,2,1, '2026-05-28 06:00:00','2026-05-28 09:30:00','completed'),
(4,1,3,8, '2026-05-29 05:30:00','2026-05-29 07:50:00','completed'),
(2,2,4,4, '2026-05-30 07:00:00','2026-05-30 09:45:00','completed'),
(1,5,2,1, '2026-05-31 06:00:00','2026-05-31 09:30:00','cancelled'),
(1,1,2,1, '2026-06-06 06:00:00','2026-06-06 09:30:00','in_progress'),
(2,2,3,5, '2026-06-06 07:00:00','2026-06-06 09:00:00','in_progress'),
(3,4,4,6, '2026-06-06 10:00:00','2026-06-06 12:30:00','scheduled'),
(4,5,2,8, '2026-06-06 11:00:00','2026-06-06 13:15:00','scheduled'),
(6,6,3,10,'2026-06-06 13:00:00','2026-06-06 13:45:00','scheduled'),
(5,6,4,9, '2026-06-05 05:00:00','2026-06-05 14:30:00','in_progress'),
(1,1,2,1, '2026-06-07 06:00:00','2026-06-07 09:30:00','scheduled'),
(2,2,3,4, '2026-06-07 07:00:00','2026-06-07 09:45:00','scheduled'),
(3,4,4,6, '2026-06-08 08:00:00','2026-06-08 10:30:00','scheduled'),
(1,5,2,2, '2026-06-09 06:00:00','2026-06-09 09:50:00','scheduled'),
(4,6,3,8, '2026-06-10 05:30:00','2026-06-10 07:45:00','scheduled');

INSERT INTO maintenance_logs (bus_id,service_date,type,description,cost,technician_name,next_service) VALUES
(3,'2026-05-15','corrective','Engine overhaul — crankshaft bearing replacement',45000.00,'Sunil Auto Works',    '2026-08-15'),
(1,'2026-04-10','routine',   'Oil change, tyre rotation, brake inspection',      8500.00,'Lanka Auto Service',  '2026-07-10'),
(2,'2026-04-22','routine',   'Full service — filters, belts, fluid top-up',     12000.00,'Lanka Auto Service',  '2026-07-22'),
(5,'2026-05-01','corrective','Transmission repair — gear selector replaced',    38000.00,'Colombo Bus Repairs', '2026-08-01'),
(6,'2026-03-18','routine',   'Air conditioning service and regas',               6500.00,'Cool Air Lanka',      '2026-06-18'),
(4,'2026-05-28','emergency', 'Roadside tyre burst — two tyres replaced',        15000.00,'Highway Assist',      '2026-08-28'),
(1,'2026-06-01','routine',   'Pre-season inspection — lights, wipers, horn',     4200.00,'Lanka Auto Service',  '2026-09-01'),
(2,'2026-06-05','corrective','Fuel injector cleaning — poor economy reported',  18500.00,'Sunil Auto Works',    '2026-09-05');

INSERT INTO expense_receipts (staff_id,schedule_id,amount,category,notes,submitted_at) VALUES
(2, 1, 3500.00,'fuel','Fuel at Kadugannawa Shell',        '2026-05-20 10:00:00'),
(2, 1,  250.00,'toll','Peradeniya toll plaza',             '2026-05-20 10:05:00'),
(3, 2, 4200.00,'fuel','Fuel at Panadura CPC',              '2026-05-20 10:15:00'),
(3, 2,  500.00,'toll','Southern Expressway toll',          '2026-05-20 10:20:00'),
(4, 3, 2800.00,'fuel','Fuel at Kandy Laugfs',              '2026-05-21 11:00:00'),
(2, 4, 3100.00,'fuel','Fuel at Ambepussa',                 '2026-05-22 08:00:00'),
(3, 5, 3800.00,'fuel','Fuel at Nittambuwa',                '2026-05-23 10:00:00'),
(4, 6, 4500.00,'fuel','Fuel at Dodanduwa CPC',             '2026-05-24 10:00:00'),
(4, 6,  500.00,'toll','Kottawa expressway entrance',       '2026-05-24 10:05:00'),
(2, 7, 9800.00,'fuel','Fuel at Dambulla and Vavuniya',     '2026-05-25 15:00:00'),
(3, 8, 1200.00,'fuel','Fuel at Galle depot',               '2026-05-26 10:00:00'),
(4, 9, 2600.00,'fuel','Fuel at Nuwara Eliya CPC',          '2026-05-27 11:00:00'),
(2,10, 3500.00,'fuel','Fuel at Peradeniya',                '2026-05-28 10:00:00'),
(3,11, 3200.00,'fuel','Fuel at Kurunegala depot',          '2026-05-29 08:30:00'),
(4,12, 4100.00,'fuel','Fuel at Hikkaduwa',                 '2026-05-30 10:00:00'),
(2,14, 3500.00,'fuel','Fuel at Kadugannawa CPC',           '2026-06-06 07:00:00'),
(3,15, 4200.00,'fuel','Fuel at Kottawa expressway',        '2026-06-06 07:30:00'),
(3,15,  500.00,'toll','Southern Expressway toll',          '2026-06-06 07:35:00');

INSERT INTO bookings (schedule_id,name,phone,seats,seat_number,status) VALUES
(14,'Saman Fernando',    '0751112233',1,12,'confirmed'),
(14,'Dilini Rathnayake', '0752223344',1,15,'confirmed'),
(14,'Anil Kumara',       '0761234567',1, 8,'confirmed'),
(14,'Perera M.S.',       '0762345678',1,22,'confirmed'),
(15,'Gayani Silva',      '0763456789',1, 5,'confirmed'),
(15,'Rohan Bandara',     '0764567890',1,18,'confirmed'),
(16,'Kumari Dissanayake','0765678901',1, 3,'confirmed'),
(20,'Lasith Malinga',    '0766789012',1, 7,'confirmed'),
(20,'Sanath Fernando',   '0767890123',1,31,'confirmed');

INSERT INTO live_locations (bus_id,staff_id,latitude,longitude,sos) VALUES
(1,2, 7.2906, 80.6337,0),
(2,3, 6.0535, 80.2210,0),
(6,4, 7.8731, 80.7718,1);

UPDATE users SET assigned_bus_id=1 WHERE email='driver1@dtsl.com';
UPDATE users SET assigned_bus_id=2 WHERE email='driver2@dtsl.com';
UPDATE users SET assigned_bus_id=4 WHERE email='driver3@dtsl.com';
UPDATE users SET assigned_bus_id=5 WHERE email='driver4@dtsl.com';
UPDATE buses SET route_id=1 WHERE reg_number='NB-1234';
UPDATE buses SET route_id=2 WHERE reg_number='NB-5678';
UPDATE buses SET route_id=3 WHERE reg_number='NC-9012';
UPDATE buses SET route_id=4 WHERE reg_number='NC-3456';
UPDATE buses SET route_id=1 WHERE reg_number='ND-7890';
UPDATE buses SET route_id=2 WHERE reg_number='ND-2345';
