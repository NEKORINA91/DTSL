/* ═══════════════════════════════════════════════════
   DTSL — staff.js
   Staff portal — all JavaScript logic
   ═══════════════════════════════════════════════════ */

let myMap=null, myMarker=null, busStopMarkers=[], poiMarkers=[];
let sharing=false, locInterval=null;
let myBusId=null, mySchedules=[];
let sosActive=false;
let depotPhone='0771234567';

// ── POI DATA (Sri Lanka) ──────────────────────────────
const BUS_STOPS=[
  {name:'Colombo Fort Bus Stand',lat:6.9344,lng:79.8428},
  {name:'Kandy Bus Station',lat:7.2906,lng:80.6337},
  {name:'Galle Bus Stand',lat:6.0535,lng:80.2210},
  {name:'Kurunegala Bus Stand',lat:7.4818,lng:80.3609},
  {name:'Nuwara Eliya Bus Stand',lat:6.9497,lng:80.7891},
  {name:'Negombo Bus Stand',lat:7.2083,lng:79.8358},
  {name:'Matara Bus Stand',lat:5.9549,lng:80.5550},
  {name:'Anuradhapura Bus Stand',lat:8.3114,lng:80.4037},
  {name:'Kadugannawa Bus Stop',lat:7.2559,lng:80.5221},
  {name:'Ambepussa Junction',lat:7.2233,lng:80.1506},
];
const FUEL_STATIONS=[
  {name:'Ceylon Petroleum — Colombo Fort',lat:6.9344,lng:79.8500},
  {name:'Lanka IOC — Kadugannawa',lat:7.2570,lng:80.5190},
  {name:'Ceylon Petroleum — Kandy',lat:7.2950,lng:80.6280},
  {name:'Lanka IOC — Kurunegala',lat:7.4850,lng:80.3650},
  {name:'Ceylon Petroleum — Galle',lat:6.0520,lng:80.2180},
];
const REPAIR_SHOPS=[
  {name:'AASL Workshop — Colombo',lat:6.9200,lng:79.8600},
  {name:'Lanka Auto Service — Kandy',lat:7.3000,lng:80.6400},
  {name:'SLTB Workshop — Kurunegala',lat:7.4900,lng:80.3700},
  {name:'Perera Motors — Kadugannawa',lat:7.2540,lng:80.5240},
];
const ALL_POI=[
  ...BUS_STOPS.map(p=>({...p,type:'stop'})),
  ...FUEL_STATIONS.map(p=>({...p,type:'fuel'})),
  ...REPAIR_SHOPS.map(p=>({...p,type:'repair'})),
];

// ── NAV ───────────────────────────────────────────────
const SECS=['dashboard','schedule','expenses','map','emergency'];
function nav(id,el){
  SECS.forEach(s=>document.getElementById('s-'+s).classList.add('hidden'));
  document.getElementById('s-'+id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  if(id==='dashboard') loadDashboard();
  if(id==='schedule')  loadSchedule();
  if(id==='expenses')  loadExpenses();
  if(id==='map')       initMap();
  if(id==='emergency') loadEmergency();
}

async function api(url,method='GET',body=null){
  const o={method,headers:{'Content-Type':'application/json'}};
  if(body)o.body=JSON.stringify(body);
  return (await fetch(url,o)).json();
}

// ── DASHBOARD ─────────────────────────────────────────
async function loadDashboard(){
  document.getElementById('db-date').textContent=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const scheds=await api('/api/staff/schedule');
  mySchedules=scheds;
  const busData=await api('/api/staff/mybus');
  if(busData&&busData.reg_number){
    myBusId=busData.id;
    document.getElementById('db-bus-reg').textContent=busData.reg_number;
    document.getElementById('db-bus-cap').textContent=busData.capacity+' seats';
    document.getElementById('db-bus-status').innerHTML=`<span class="badge ${busData.status==='active'?'b-green':'b-orange'}">${busData.status}</span>`;
  } else {
    document.getElementById('db-bus-reg').textContent='Not assigned';
  }
  const today=new Date().toDateString();
  const todayScheds=scheds.filter(s=>new Date(s.departure_time).toDateString()===today);
  document.getElementById('db-today-count').textContent=todayScheds.length;
  const now=new Date();
  const upcoming=scheds.filter(s=>new Date(s.departure_time)>now).sort((a,b)=>new Date(a.departure_time)-new Date(b.departure_time));
  if(upcoming.length){
    const next=upcoming[0];
    document.getElementById('db-next-route').textContent=next.route_name;
    document.getElementById('db-next-time').textContent='🕐 '+new Date(next.departure_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' → '+new Date(next.arrival_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
    document.getElementById('db-next-road').textContent=next.road_name?'🛣️ '+next.road_name:'';
  } else {
    document.getElementById('db-next-route').textContent='No upcoming trips';
    document.getElementById('db-next-time').textContent='';
    document.getElementById('db-next-road').textContent='';
  }
  const el=document.getElementById('db-today-list');
  if(!todayScheds.length){
    el.innerHTML='<div style="padding:1.5rem;text-align:center;color:#9ca3af;font-size:.85rem">No trips scheduled for today.</div>';
  } else {
    el.innerHTML=todayScheds.map(s=>`
      <div style="padding:1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f3f4f6">
        <div>
          <p style="font-weight:700;font-size:.9rem;margin:0">${s.route_name}</p>
          <p style="font-size:.75rem;color:#9ca3af;margin:.2rem 0 0">📍 ${s.origin} → ${s.destination}</p>
          ${s.road_name?`<p style="font-size:.72rem;color:#4f46e5;margin:.1rem 0 0">🛣️ ${s.road_name}</p>`:''}
        </div>
        <div style="text-align:right">
          <p style="font-weight:700;font-size:.9rem;margin:0">${new Date(s.departure_time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p>
          <span class="badge ${s.status==='in_progress'?'b-yellow':'b-blue'}" style="margin-top:.2rem">${s.status}</span>
        </div>
      </div>`).join('');
  }
  const sel=document.getElementById('rc-schedule');
  if(sel) sel.innerHTML='<option value="">None</option>'+scheds.map(s=>`<option value="${s.id}">${s.route_name} — ${new Date(s.departure_time).toLocaleString()}</option>`).join('');
}

// ── SCHEDULE ──────────────────────────────────────────
async function loadSchedule(){
  const rows=await api('/api/staff/schedule');
  const el=document.getElementById('sched-list');
  if(!rows.length){
    el.innerHTML='<div class="card" style="padding:3rem;text-align:center;color:#9ca3af"><p style="font-size:2.5rem;margin-bottom:.75rem">📅</p><p>No upcoming schedules assigned.</p></div>';
    return;
  }
  el.innerHTML=rows.map(s=>{
    const isDelayed = s.status==='in_progress' && new Date(s.arrival_time) < new Date();
    const statusBadge = isDelayed
      ? '<span class="badge b-red">delayed</span>'
      : s.status==='in_progress'
        ? '<span class="badge b-yellow">in progress</span>'
        : s.status==='completed'
          ? '<span class="badge b-green">completed</span>'
          : '<span class="badge b-blue">scheduled</span>';
    const actionBtn = s.status==='scheduled'
      ? `<button id="btn-start-${s.id}" class="btn btn-primary" style="width:100%;margin-top:.75rem;font-size:.85rem;padding:.6rem" onclick="startTrip(${s.id})">🚌 Start Trip</button>`
      : s.status==='in_progress'
        ? `<button id="btn-end-${s.id}" class="btn" style="width:100%;margin-top:.75rem;font-size:.85rem;padding:.6rem;background:#16a34a;color:#fff;border:none;border-radius:10px;cursor:pointer;" onclick="endTrip(${s.id})">✅ End Trip — Mark Completed</button>`
        : '';
    return `
    <div class="card schedule-card ${s.is_emergency?'emergency':''}">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:.75rem">
        <div>
          <h3 style="font-weight:700;font-size:1rem;margin:0">${s.route_name}</h3>
          <p style="font-size:.8rem;color:#9ca3af;margin:.2rem 0 0">📍 ${s.origin} → ${s.destination}</p>
        </div>
        ${statusBadge}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;font-size:.82rem">
        <div><p style="font-size:.7rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin:0 0 .2rem">Bus</p><p style="font-weight:700;margin:0">🚌 ${s.bus_reg}</p></div>
        <div><p style="font-size:.7rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin:0 0 .2rem">Departure</p><p style="font-weight:700;margin:0">${new Date(s.departure_time).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p></div>
        <div><p style="font-size:.7rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin:0 0 .2rem">Arrival</p><p style="font-weight:700;margin:0">${new Date(s.arrival_time).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</p></div>
        ${s.road_name?`<div style="grid-column:span 3;padding-top:.5rem;border-top:1px solid #f3f4f6"><p style="font-size:.7rem;color:#9ca3af;font-weight:700;text-transform:uppercase;margin:0 0 .2rem">Road</p><p style="font-weight:700;color:#4f46e5;margin:0">🛣️ ${s.road_name}</p></div>`:''}
      </div>
      ${isDelayed?'<div style="margin-top:.75rem;font-size:.75rem;font-weight:700;color:#dc2626;background:#fef2f2;padding:.4rem .75rem;border-radius:.5rem">⚠️ This trip is running delayed</div>':''}
      ${s.is_emergency?'<div style="margin-top:.5rem;font-size:.75rem;font-weight:700;color:#dc2626;background:#fef2f2;padding:.4rem .75rem;border-radius:.5rem">🚨 Emergency Schedule</div>':''}
      ${actionBtn}
    </div>`;
  }).join('');
}

// ── EXPENSES ──────────────────────────────────────────
function toggleFuelFields(){
  const cat=document.getElementById('rc-cat').value;
  const ff=document.getElementById('fuel-fields');
  if(ff) ff.style.display=cat==='fuel'?'contents':'none';
}

async function loadExpenses(){
  const rows=await api('/api/staff/receipts');
  const total=rows.reduce((a,b)=>a+parseFloat(b.amount||0),0);
  document.getElementById('exp-total').textContent='Total: LKR '+total.toLocaleString();
  const tbody=document.getElementById('exp-tbody');
  tbody.innerHTML=rows.length?rows.map(r=>{
    let detail='';
    try{const n=JSON.parse(r.notes||'{}');detail=[n.litres?n.litres+'L':'',n.station||'',n.mileage?n.mileage+'km':''].filter(Boolean).join(' · ');}
    catch(e){detail=r.notes||'—';}
    return `<tr>
      <td><span class="badge exp-category-${r.category}">${r.category}</span></td>
      <td style="font-weight:700">LKR ${parseFloat(r.amount).toLocaleString()}</td>
      <td style="font-size:.75rem;color:#6b7280">${detail}</td>
      <td style="font-size:.75rem">${new Date(r.submitted_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</td>
      <td>${r.receipt_image?`<a href="${r.receipt_image}" target="_blank" style="color:#0d9488;font-size:.78rem;font-weight:600;text-decoration:underline">View</a>`:'—'}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="5" style="text-align:center;padding:2rem;color:#9ca3af">No expenses submitted yet.</td></tr>';
}

async function submitExpense(){
  const cat=document.getElementById('rc-cat').value;
  const amount=document.getElementById('rc-amount').value;
  if(!amount){document.getElementById('rc-err').classList.remove('hidden');return;}
  document.getElementById('rc-err').classList.add('hidden');
  const fd=new FormData();
  fd.append('category',cat); fd.append('amount',amount);
  fd.append('schedule_id',document.getElementById('rc-schedule').value);
  const extras={};
  if(cat==='fuel'){
    const litres=document.getElementById('rc-litres').value;
    const station=document.getElementById('rc-station').value;
    if(litres)extras.litres=litres; if(station)extras.station=station;
  }
  const mileage=document.getElementById('rc-mileage').value;
  if(mileage)extras.mileage=mileage;
  extras.note=document.getElementById('rc-notes').value;
  fd.append('notes',JSON.stringify(extras));
  const file=document.getElementById('rc-file').files[0];
  if(file)fd.append('receipt_image',file);
  await fetch('/api/staff/receipts',{method:'POST',body:fd});
  document.getElementById('rc-ok').classList.remove('hidden');
  ['rc-amount','rc-litres','rc-station','rc-mileage','rc-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('rc-file').value='';
  setTimeout(()=>document.getElementById('rc-ok').classList.add('hidden'),3000);
  loadExpenses();
}

// ── MAP ───────────────────────────────────────────────
function makeIcon(color,emoji){
  return L.divIcon({html:`<div style="background:${color};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white;">${emoji}</div>`,iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-14],className:''});
}

function initMap(){
  if(myMap)return;
  myMap=L.map('staff-map').setView([7.8731,80.7718],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(myMap);
  BUS_STOPS.forEach(p=>{
    const m=L.marker([p.lat,p.lng],{icon:makeIcon('#3b82f6','🚏')}).addTo(myMap);
    m.bindPopup(`<b>🚏 ${p.name}</b><br><span style="font-size:11px;color:#6b7280">Bus Stop</span>`);
    busStopMarkers.push({...p,marker:m,type:'stop'});
  });
  FUEL_STATIONS.forEach(p=>{
    const m=L.marker([p.lat,p.lng],{icon:makeIcon('#eab308','⛽')}).addTo(myMap);
    m.bindPopup(`<b>⛽ ${p.name}</b><br><span style="font-size:11px;color:#6b7280">Fuel Station</span>`);
    poiMarkers.push({...p,marker:m,type:'fuel'});
  });
  REPAIR_SHOPS.forEach(p=>{
    const m=L.marker([p.lat,p.lng],{icon:makeIcon('#f97316','🔧')}).addTo(myMap);
    m.bindPopup(`<b>🔧 ${p.name}</b><br><span style="font-size:11px;color:#6b7280">Repair Shop</span>`);
    poiMarkers.push({...p,marker:m,type:'repair'});
  });
  if(sharing)sendLoc();
}

function searchMapPOI(){
  const q=document.getElementById('map-search-inp').value.toLowerCase().trim();
  const res=document.getElementById('map-search-results');
  if(!q){res.classList.add('hidden');return;}
  const matches=ALL_POI.filter(p=>p.name.toLowerCase().includes(q)).slice(0,8);
  if(!matches.length){res.classList.add('hidden');return;}
  res.classList.remove('hidden');
  res.innerHTML=matches.map(p=>{
    const emoji={stop:'🚏',fuel:'⛽',repair:'🔧'}[p.type];
    const label={stop:'Bus Stop',fuel:'Fuel Station',repair:'Repair Shop'}[p.type];
    return `<div style="padding:.5rem .75rem;cursor:pointer;font-size:.82rem;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''" onclick="panToMarker(${p.lat},${p.lng},'${p.name.replace(/'/g,"\\'")}')">
      <span>${emoji} <b>${p.name}</b></span>
      <span style="font-size:.7rem;color:#9ca3af">${label}</span>
    </div>`;
  }).join('');
}

function panToMarker(lat,lng,name){
  if(!myMap)return;
  myMap.setView([lat,lng],15);
  const allM=[...busStopMarkers,...poiMarkers];
  const found=allM.find(p=>p.lat===lat&&p.lng===lng);
  if(found&&found.marker)found.marker.openPopup();
  document.getElementById('map-search-results').classList.add('hidden');
  document.getElementById('map-search-inp').value=name;
}

// ── LOCATION SHARING ──────────────────────────────────
function toggleLocation(){
  if(!sharing)startSharing(); else stopSharing();
}
function startSharing(){
  sharing=true;
  document.getElementById('loc-toggle-btn').textContent='Stop Sharing';
  document.getElementById('loc-toggle-btn').style.cssText='background:#dc2626;color:#fff;padding:.5rem 1.25rem;border-radius:.5rem;font-size:.82rem;font-weight:700;border:none;cursor:pointer;';
  document.getElementById('loc-status-text').textContent='📡 Broadcasting live location to depot';
  document.getElementById('loc-status-text').style.color='#0d9488';
  document.getElementById('loc-indicator').classList.remove('hidden');
  sendLoc(); locInterval=setInterval(sendLoc,10000);
}
function stopSharing(){
  sharing=false; clearInterval(locInterval);
  document.getElementById('loc-toggle-btn').textContent='Start Sharing';
  document.getElementById('loc-toggle-btn').style.cssText='background:#0d9488;color:#fff;padding:.5rem 1.25rem;border-radius:.5rem;font-size:.82rem;font-weight:700;border:none;cursor:pointer;';
  document.getElementById('loc-status-text').textContent='Not sharing — admin cannot see your location';
  document.getElementById('loc-status-text').style.color='#9ca3af';
  document.getElementById('loc-indicator').classList.add('hidden');
}
function sendLoc(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{
    const{latitude:lat,longitude:lng}=pos.coords;
    fetch('/api/staff/location',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bus_id:myBusId||1,latitude:lat,longitude:lng,sos:sosActive})});
    if(!myMap)return;
    if(!myMarker){myMarker=L.marker([lat,lng],{icon:makeIcon('#4f46e5','🚌'),zIndexOffset:1000}).addTo(myMap).bindPopup('<b>🚌 Your Bus</b>');myMap.setView([lat,lng],13);}
    else myMarker.setLatLng([lat,lng]);
    const coordEl=document.getElementById('loc-coords');
    if(coordEl){coordEl.classList.remove('hidden');coordEl.textContent=`${lat.toFixed(6)}   ${lng.toFixed(6)}   Updated: ${new Date().toLocaleTimeString()}`;}
  },err=>console.warn('GPS:',err.message));
}

// ── EMERGENCY ─────────────────────────────────────────
async function loadEmergency(){
  const d=await api('/api/staff/depot-contact');
  depotPhone=d.phone;
  document.getElementById('depot-num-display').textContent=d.phone;
}
function callNumber(num,label){if(confirm('Call '+label+' ('+num+')?'))window.location.href='tel:'+num;}
function callDepot(){if(confirm('Call Depot ('+depotPhone+')?'))window.location.href='tel:'+depotPhone;}
function findNearestFuel(){
  nav('map',document.querySelector('.nav-item:nth-child(4)'));
  setTimeout(()=>{document.getElementById('map-search-inp').value='fuel';searchMapPOI();},500);
}

async function sendSOS(){
  if(sosActive){
    sosActive=false;
    const btn=document.getElementById('sos-btn');
    btn.classList.remove('sos-active'); btn.style.background='';
    document.getElementById('sos-status').textContent='SOS cancelled.';
    document.getElementById('sos-status').style.color='#6b7280';
    return;
  }
  if(!confirm('⚠️ Send SOS alert to depot? This will broadcast your location as an emergency.'))return;
  sosActive=true;
  const btn=document.getElementById('sos-btn');
  btn.classList.add('sos-active');
  btn.querySelector('.sos-label').textContent='CANCEL SOS';
  document.getElementById('sos-status').textContent='🔴 SOS active — depot has been notified.';
  document.getElementById('sos-status').style.color='#dc2626';
  document.getElementById('sos-log').classList.remove('hidden');
  document.getElementById('sos-log-content').innerHTML=`
    <p>🔴 <b>SOS Alert Sent</b></p>
    <p>Time: ${new Date().toLocaleString()}</p>
    <p>Bus: ${document.getElementById('db-bus-reg').textContent}</p>
    <p style="font-size:.72rem;color:#6b7280;margin-top:.5rem">Depot can see your location on the live map. Stay with the vehicle.</p>`;
  if(!sharing)startSharing();
  sendLoc();
}

// ══ INIT ═════════════════════════════════════════════
loadDashboard();

// ── TRIP STATUS ───────────────────────────────────────────────
async function startTrip(scheduleId) {
  const btn = document.getElementById('btn-start-' + scheduleId);
  if (btn) { btn.disabled = true; btn.textContent = 'Starting...'; }
  const res = await api('/api/staff/trip/start', 'POST', { schedule_id: scheduleId });
  if (res.success) {
    loadSchedule();
    loadDashboard();
    showToast('Trip started! Safe journey 🚌');
  } else {
    alert(res.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Start Trip'; }
  }
}

async function endTrip(scheduleId) {
  if (!confirm('End this trip and mark as completed?')) return;
  const btn = document.getElementById('btn-end-' + scheduleId);
  if (btn) { btn.disabled = true; btn.textContent = 'Ending...'; }
  const res = await api('/api/staff/trip/end', 'POST', { schedule_id: scheduleId });
  if (res.success) {
    loadSchedule();
    loadDashboard();
    showToast('Trip completed ✅');
  } else {
    alert(res.message);
    if (btn) { btn.disabled = false; btn.textContent = 'End Trip'; }
  }
}

function showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#1a4fa0;color:#fff;padding:.75rem 1.25rem;border-radius:10px;font-size:.85rem;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.25);';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

