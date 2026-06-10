-- ═══════════════════════════════════════════════════
-- DTSL — Complete Database v4
-- Drop old dtsl database first, then import this
-- ═══════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS dtsl CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dtsl;

CREATE TABLE depots (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  depot_code  VARCHAR(20)  NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  location    VARCHAR(150),
  password    VARCHAR(255) NOT NULL,
  status      ENUM('active','construction','retiring','inactive') NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  first_name       VARCHAR(80)  NOT NULL,
  last_name        VARCHAR(80)  NOT NULL,
  email            VARCHAR(150) NOT NULL UNIQUE,
  password         VARCHAR(255) NOT NULL,
  role             ENUM('superadmin','driver','conductor') NOT NULL DEFAULT 'driver',
  depot_id         INT,
  phone            VARCHAR(20),
  ntc_number       VARCHAR(50),
  license_id       VARCHAR(50),
  license_expiry   DATE,
  license_photo    VARCHAR(255),
  assigned_bus_id  INT,
  working_hours    DECIMAL(6,2) NOT NULL DEFAULT 0,
  status           ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (depot_id) REFERENCES depots(id) ON DELETE SET NULL
);

CREATE TABLE buses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  reg_number   VARCHAR(20)   NOT NULL UNIQUE,
  capacity     INT           NOT NULL,
  status       ENUM('active','maintenance','retired') NOT NULL DEFAULT 'active',
  mileage      DECIMAL(10,2) NOT NULL DEFAULT 0,
  depot_id     INT,
  route_id     INT,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (depot_id) REFERENCES depots(id) ON DELETE SET NULL
);

CREATE TABLE routes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(150) NOT NULL,
  origin         VARCHAR(100) NOT NULL,
  destination    VARCHAR(100) NOT NULL,
  total_distance DECIMAL(8,2) NOT NULL,
  depot_id       INT,
  status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (depot_id) REFERENCES depots(id) ON DELETE SET NULL
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
  conductor_id    INT,
  is_emergency    TINYINT(1) NOT NULL DEFAULT 0,
  override_reason TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (route_id)       REFERENCES routes(id)       ON DELETE CASCADE,
  FOREIGN KEY (bus_id)         REFERENCES buses(id)        ON DELETE CASCADE,
  FOREIGN KEY (driver_id)      REFERENCES users(id)        ON DELETE CASCADE,
  FOREIGN KEY (conductor_id)   REFERENCES users(id)        ON DELETE SET NULL,
  FOREIGN KEY (road_option_id) REFERENCES road_options(id) ON DELETE SET NULL
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
  user_id      INT NOT NULL,
  depot_id     INT,
  type         VARCHAR(50) NOT NULL,
  export_path  VARCHAR(255),
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (depot_id) REFERENCES depots(id)  ON DELETE SET NULL
);

-- ── SEED ─────────────────────────────────────────────────────
-- All passwords: password123

INSERT INTO users (first_name,last_name,email,password,role,status) VALUES
('Super','Admin','superadmin@dtsl.com','$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','superadmin','active');

INSERT INTO depots (depot_code,name,location,password,status) VALUES
('DEPOT-001','Colombo Central Depot','Pettah, Colombo 11',  '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','active'),
('DEPOT-002','Kandy Hill Depot',     'Peradeniya, Kandy',   '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','active'),
('DEPOT-003','Galle Southern Depot', 'Karapitiya, Galle',   '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','construction');

-- DEPOT-001 staff (4 people)
INSERT INTO users (first_name,last_name,email,password,role,depot_id,phone,ntc_number,license_id,license_expiry,working_hours,status) VALUES
('Kamal',  'Perera',     'driver1@dtsl.com',    '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   1,'0771234001','NTC-D10234','B1234567','2026-08-15',186.5,'active'),
('Nimal',  'Silva',      'driver2@dtsl.com',    '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   1,'0771234002','NTC-D10235','B2345678','2025-11-30',204.0,'active'),
('Priya',  'Wickrama',   'conductor1@dtsl.com', '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','conductor',1,'0771234005','NTC-C20123','C1234567','2027-01-20',178.0,'active'),
('Amara',  'Dissanayake','conductor2@dtsl.com', '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','conductor',1,'0771234006','NTC-C20124','C2345678','2026-09-05',192.5,'active'),
-- DEPOT-002 staff (3 people)
('Suresh', 'Fernando',   'driver3@dtsl.com',    '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   2,'0771234003','NTC-D10236','B3456789','2026-06-20',167.5,'active'),
('Rohan',  'Jayawardena','driver4@dtsl.com',    '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   2,'0771234004','NTC-D10237','B4567890','2024-03-10',145.0,'active'),
('Lakmal', 'Bandara',    'conductor3@dtsl.com', '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','conductor',2,'0771234007','NTC-C20125','C3456789','2025-12-15',155.0,'active'),
-- DEPOT-003 staff (2 people)
('Dinesh', 'Kumara',     'driver5@dtsl.com',    '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','driver',   3,'0771234008','NTC-D10238','B5678901','2026-12-01',120.0,'active'),
('Saman',  'Rajapaksa',  'conductor4@dtsl.com', '$2b$10$RGHYFNbFkAwrsjbsRI9nnuwFVn1rUHxlJj07Aq2Nsaudn19jCIIzu','conductor',3,'0771234009','NTC-C20126','C4567890','2026-03-15',98.0,'active');

-- DEPOT-001: 3 buses (2 active, 1 maintenance)
INSERT INTO buses (reg_number,capacity,status,mileage,depot_id) VALUES
('NB-1234',52,'active',      45230.50,1),
('NB-5678',48,'active',      38120.00,1),
('NC-9012',52,'maintenance', 72400.75,1),
-- DEPOT-002: 2 buses (both active)
('NC-3456',44,'active',19800.00,2),
('ND-7890',52,'active',28450.00,2),
-- DEPOT-003: 2 buses (1 active, 1 retired)
('ND-2345',48,'active', 55100.25,3),
('NE-6789',44,'retired',98700.00,3);

-- Routes per depot
INSERT INTO routes (name,origin,destination,total_distance,depot_id,status) VALUES
('Colombo — Kandy Express',   'Colombo','Kandy',        115.50,1,'active'),
('Colombo — Galle Coastal',   'Colombo','Galle',        116.00,1,'active'),
('Colombo — Jaffna Intercity','Colombo','Jaffna',       396.00,1,'active'),
('Kandy — Nuwara Eliya Hill', 'Kandy',  'Nuwara Eliya',  78.20,2,'active'),
('Kandy — Kurunegala',        'Kandy',  'Kurunegala',    72.40,2,'active'),
('Galle — Matara Coastal',    'Galle',  'Matara',        26.50,3,'active');

INSERT INTO road_options (route_id,road_name,distance,description) VALUES
(1,'A1 — Colombo-Kandy Road',     115.50,'Primary highway via Kadugannawa Pass'),
(1,'A6 — Via Kurunegala',         138.00,'Longer but flatter via Kurunegala'),
(2,'A2 — Galle Road Coastal',     116.00,'Coastal highway with ocean views'),
(2,'E01 — Southern Expressway',    96.00,'Fastest route, toll applies'),
(3,'A9 — North Road via Dambulla',396.00,'Main intercity via Dambulla and Vavuniya'),
(4,'B40 — Via Ramboda Pass',       78.20,'Mountain road via Ramboda'),
(5,'A6 — Kandy-Kurunegala Road',   72.40,'Direct route via Mawathagama'),
(6,'A2 — Galle-Matara Southern',   26.50,'Short coastal hop');

-- Schedules showing all statuses
-- conductor IDs: 5=Priya(depot1), 6=Amara(depot1), 8=Lakmal(depot2), 9=Saman(depot3)
INSERT INTO schedules (route_id,bus_id,driver_id,conductor_id,road_option_id,departure_time,arrival_time,status) VALUES
-- completed (past)
(1,1,2,5,1, '2026-05-20 06:00:00','2026-05-20 09:30:00','completed'),
(2,2,3,6,3, '2026-05-20 07:00:00','2026-05-20 09:45:00','completed'),
(4,4,6,8,6, '2026-05-21 08:00:00','2026-05-21 10:30:00','completed'),
(5,5,7,8,7, '2026-05-22 05:30:00','2026-05-22 07:45:00','completed'),
(6,6,9,9,8, '2026-05-23 09:00:00','2026-05-23 09:45:00','completed'),
-- in_progress (today)
(1,1,2,5,1, '2026-06-07 06:00:00','2026-06-07 09:30:00','in_progress'),
(4,4,6,8,6, '2026-06-07 07:00:00','2026-06-07 09:30:00','in_progress'),
-- delayed (in_progress but arrival passed)
(3,2,3,6,5, '2026-06-05 05:00:00','2026-06-05 14:30:00','in_progress'),
-- scheduled (upcoming)
(2,2,3,5,3, '2026-06-07 10:00:00','2026-06-07 12:30:00','scheduled'),
(5,5,7,8,7, '2026-06-07 11:00:00','2026-06-07 13:15:00','scheduled'),
(6,6,9,9,8, '2026-06-07 13:00:00','2026-06-07 13:45:00','scheduled'),
(1,1,2,5,1, '2026-06-08 06:00:00','2026-06-08 09:30:00','scheduled'),
(4,4,6,8,6, '2026-06-09 08:00:00','2026-06-09 10:30:00','scheduled');

INSERT INTO maintenance_logs (bus_id,service_date,type,description,cost,technician_name,next_service) VALUES
(3,'2026-05-15','corrective','Engine overhaul — crankshaft bearing',45000.00,'Sunil Auto Works',  '2026-08-15'),
(1,'2026-04-10','routine',  'Oil change, tyre rotation, brakes',    8500.00,'Lanka Auto Service','2026-07-10'),
(4,'2026-05-28','emergency','Roadside tyre burst — two tyres',      15000.00,'Highway Assist',    '2026-08-28'),
(2,'2026-04-22','routine',  'Full service — filters, belts',        12000.00,'Lanka Auto Service','2026-07-22');

INSERT INTO expense_receipts (staff_id,schedule_id,amount,category,notes,submitted_at) VALUES
(2,1,3500.00,'fuel','Fuel at Kadugannawa Shell','2026-05-20 10:00:00'),
(2,1, 250.00,'toll','Peradeniya toll plaza',    '2026-05-20 10:05:00'),
(3,2,4200.00,'fuel','Fuel at Panadura CPC',     '2026-05-20 10:15:00'),
(6,3,2800.00,'fuel','Fuel at Kandy Laugfs',     '2026-05-21 11:00:00'),
(2,6,3500.00,'fuel','Fuel at Kadugannawa CPC',  '2026-06-07 07:00:00'),
(3,8,9800.00,'fuel','Fuel at Dambulla and Vavuniya','2026-06-05 15:00:00');

INSERT INTO live_locations (bus_id,staff_id,latitude,longitude,sos) VALUES
(1,2,7.2906,80.6337,0),
(4,6,7.2553,80.5914,0),
(2,3,6.0535,80.2210,1);

UPDATE users SET assigned_bus_id=1 WHERE email='driver1@dtsl.com';
UPDATE users SET assigned_bus_id=2 WHERE email='driver2@dtsl.com';
UPDATE users SET assigned_bus_id=4 WHERE email='driver3@dtsl.com';
UPDATE users SET assigned_bus_id=5 WHERE email='driver4@dtsl.com';
UPDATE users SET assigned_bus_id=6 WHERE email='driver5@dtsl.com';
UPDATE buses SET route_id=1 WHERE reg_number='NB-1234';
UPDATE buses SET route_id=2 WHERE reg_number='NB-5678';
UPDATE buses SET route_id=4 WHERE reg_number='NC-3456';
UPDATE buses SET route_id=5 WHERE reg_number='ND-7890';
UPDATE buses SET route_id=6 WHERE reg_number='ND-2345';
