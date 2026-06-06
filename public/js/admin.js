/* ═══════════════════════════════════════════════════
   DTSL — admin.js  (complete, all 6 features)
   ═══════════════════════════════════════════════════ */

let allRoutes=[], allBuses=[], allStaff=[], allScheds=[], allMaint=[], allExp=[], allLive=[];
let liveMap=null, liveMarkers={};
let calYear=new Date().getFullYear(), calMonth=new Date().getMonth();
let schedView='table', schedPeriod='all';

// ══ NAV ══════════════════════════════════════════════
const SECS=['dashboard','staff','buses','routes','schedules','live','maintenance','expenses','reports'];
const LOADERS={dashboard:loadDash,staff:loadStaff,buses:loadBuses,routes:loadRoutes,
  schedules:loadScheds,live:loadLive,maintenance:loadMaint,expenses:loadExpenses,reports:loadReports};

function nav(id,el){
  SECS.forEach(s=>document.getElementById('s-'+s).classList.add('hidden'));
  document.getElementById('s-'+id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  LOADERS[id]&&LOADERS[id]();
}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
async function api(url,method='GET',body=null){
  const o={method,headers:{'Content-Type':'application/json'}};
  if(body)o.body=JSON.stringify(body);
  return (await fetch(url,o)).json();
}
async function apiForm(url,fd){return (await fetch(url,{method:'POST',body:fd})).json();}
function badge(s){
  const m={active:'b-green',scheduled:'b-blue',in_progress:'b-yellow',completed:'b-gray',
    cancelled:'b-red',maintenance:'b-orange',retired:'b-gray',inactive:'b-gray',
    driver:'b-indigo',conductor:'b-teal',customer:'b-pink',admin:'b-purple',
    routine:'b-teal',corrective:'b-orange',
    emergency:'b-red',fuel:'b-blue',toll:'b-purple',other:'b-gray',delayed:'b-red'};
  return `<span class="badge ${m[s]||'b-gray'}">${s}</span>`;
}
function fmtDT(d){return d?new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';}
function fmtD(d){return d?new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';}
function q(id){return document.getElementById(id);}

// ══ CALENDAR ════════════════════════════════════════
function renderCal(){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  q('cal-title').textContent=months[calMonth]+' '+calYear;
  const grid=q('cal-grid'); grid.innerHTML='';
  const first=new Date(calYear,calMonth,1).getDay();
  const days=new Date(calYear,calMonth+1,0).getDate();
  const today=new Date();
  const evMap={};
  allScheds.forEach(s=>{
    const k=new Date(s.departure_time).toDateString();
    if(!evMap[k])evMap[k]=[];
    evMap[k].push(s);
  });
  for(let i=0;i<first;i++){const d=document.createElement('div');d.className='cal-day other-month';grid.appendChild(d);}
  for(let d=1;d<=days;d++){
    const cell=document.createElement('div');
    const thisDate=new Date(calYear,calMonth,d);
    cell.className='cal-day'+(thisDate.toDateString()===today.toDateString()?' today':'');
    const evs=evMap[thisDate.toDateString()]||[];
    cell.innerHTML=`<div class="cal-day-num">${d}</div>`
      +evs.slice(0,3).map(e=>`<div class="cal-event${e.is_emergency?' emergency':e.status==='completed'?' completed':e.is_delayed?' delayed':''}" title="${e.route_name||''}">${e.bus_reg||''}</div>`).join('')
      +(evs.length>3?`<div style="font-size:.58rem;color:#6b7280">+${evs.length-3} more</div>`:'');
    grid.appendChild(cell);
  }
}
function calPrev(){calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderCal();}
function calNext(){calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderCal();}

// ══ DASHBOARD ════════════════════════════════════════
async function loadDash(){
  const d=await api('/api/admin/stats');
  q('st-buses').textContent=d.stats.buses;
  q('st-routes').textContent=d.stats.routes;
  q('st-trips').textContent=d.stats.trips;
  q('st-staff').textContent=d.stats.staff;
  q('st-completed').textContent=d.stats.completed_today;
  q('st-delayed').textContent=d.stats.delayed;
  q('st-util').textContent=d.stats.utilRate+'%';

  // license expiry alerts
  if(d.licAlerts&&d.licAlerts.length){
    q('lic-alerts').innerHTML=d.licAlerts.map(a=>{
      const exp=new Date(a.license_expiry);
      const daysLeft=Math.ceil((exp-new Date())/(1000*60*60*24));
      const color=daysLeft<0?'#dc2626':daysLeft<14?'#d97706':'#ca8a04';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid #f3f4f6;font-size:.78rem;">
        <span><b>${a.first_name} ${a.last_name}</b> · ${a.license_id||'—'}</span>
        <span style="color:${color};font-weight:700">${daysLeft<0?'EXPIRED':'Expires in '+daysLeft+'d'} (${fmtD(a.license_expiry)})</span>
      </div>`;
    }).join('');
    q('lic-alert-box').classList.remove('hidden');
  } else {
    q('lic-alert-box').classList.add('hidden');
  }

  q('dash-tbody').innerHTML=d.recent.map(r=>`<tr>
    <td style="font-size:.82rem;font-weight:600">${r.route}</td>
    <td style="font-size:.82rem">${r.bus}</td>
    <td>${badge(r.is_delayed?'delayed':r.status)}${r.is_emergency?' <span class="badge b-red">⚠️</span>':''}</td>
  </tr>`).join('');

  allScheds=await api('/api/admin/schedules');
  renderCal();

  // ═══ FRIEND A — PASTE YOUR UTILISATION CHART HERE ═══
  // Instructions: paste the renderUtilChart() call and its function below this line
  // The data you need is already fetched: call api('/api/admin/analytics/utilisation')
  // ═══════════════════════════════════════════════════

}

// ══ STAFF ════════════════════════════════════════════
async function loadStaff(){
  [allStaff,allBuses]=await Promise.all([api('/api/admin/staff'),api('/api/admin/buses')]);
  q('sf-bus').innerHTML='<option value="">None</option>'+allBuses.map(b=>`<option value="${b.id}">${b.reg_number}</option>`).join('');
  renderStaff(allStaff);
}
function renderStaff(data){
  q('staff-tbody').innerHTML=data.length?data.map(s=>{
    const expiry=s.license_expiry?new Date(s.license_expiry):null;
    const daysLeft=expiry?Math.ceil((expiry-new Date())/(1000*60*60*24)):null;
    const expiryBadge=daysLeft===null?'':daysLeft<0?'<span class="badge b-red">Expired</span>':daysLeft<30?`<span class="badge b-yellow">${daysLeft}d left</span>`:'';
    return `<tr>
      <td><span style="font-weight:600">${s.first_name} ${s.last_name}</span><br><span style="font-size:.72rem;color:#9ca3af">${s.email}</span></td>
      <td>${badge(s.role)}</td>
      <td style="font-size:.8rem">${s.phone||'—'}</td>
      <td style="font-size:.8rem">${s.license_id||'—'} ${expiryBadge}</td>
      <td style="font-size:.78rem">${s.license_expiry?fmtD(s.license_expiry):'—'}</td>
      <td style="font-size:.8rem">${s.ntc_number||'—'}</td>
      <td style="font-size:.8rem">${s.assigned_bus||'—'}</td>
      <td style="font-size:.8rem">${parseFloat(s.working_hours||0).toFixed(1)} hrs</td>
      <td style="display:flex;gap:.35rem;">
        <button class="btn btn-gray btn-sm" onclick="editStaff(${s.id})">Edit</button>
        <button class="btn btn-red btn-sm" onclick="delStaff(${s.id})">Remove</button>
      </td></tr>`;
  }).join('')
  :'<tr><td colspan="9" style="text-align:center;padding:2rem;color:#9ca3af;">No staff found.</td></tr>';

  // ═══ FRIEND A — PASTE YOUR LICENSE EXPIRY ALERT HERE ═══
  // Instructions: after staff table renders, check for expiring licenses and show an alert banner
  // Data available: allStaff array — each item has license_expiry, first_name, last_name
  // Target element: id="staff-expiry-alert"
  // ═══════════════════════════════════════════════════
}
function filterStaff(){
  const v=q('staff-search').value.toLowerCase();
  renderStaff(allStaff.filter(s=>[s.first_name,s.last_name,s.email,s.role,s.ntc_number||'',s.license_id||''].join(' ').toLowerCase().includes(v)));
}
function editStaff(id){
  const s=allStaff.find(x=>x.id===id);
  q('staff-modal-title').textContent='Edit Staff Member';
  q('sf-id').value=s.id; q('sf-fname').value=s.first_name; q('sf-lname').value=s.last_name;
  q('sf-email').value=s.email; q('sf-phone').value=s.phone||'';
  q('sf-role').value=s.role; q('sf-bus').value=s.assigned_bus_id||'';
  q('sf-lic').value=s.license_id||''; q('sf-ntc').value=s.ntc_number||'';
  q('sf-expiry').value=s.license_expiry?s.license_expiry.split('T')[0]:'';
  q('sf-hours').value=s.working_hours||0;
  q('sf-pass').value=''; q('sf-err').classList.add('hidden');
  openModal('m-staff');
}
async function saveStaff(){
  const fd=new FormData();
  const id=q('sf-id').value; if(id)fd.append('id',id);
  fd.append('first_name',q('sf-fname').value); fd.append('last_name',q('sf-lname').value);
  fd.append('email',q('sf-email').value); fd.append('phone',q('sf-phone').value);
  fd.append('role',q('sf-role').value); fd.append('license_id',q('sf-lic').value);
  fd.append('license_expiry',q('sf-expiry').value||'');
  fd.append('working_hours',q('sf-hours').value||0);
  fd.append('ntc_number',q('sf-ntc').value); fd.append('assigned_bus_id',q('sf-bus').value);
  fd.append('password',q('sf-pass').value);
  const file=q('sf-photo').files[0]; if(file)fd.append('license_photo',file);
  const res=await apiForm('/api/admin/staff',fd);
  if(res.success){closeModal('m-staff');q('sf-id').value='';q('staff-modal-title').textContent='Add Staff Member';loadStaff();}
  else{q('sf-err').textContent=res.message;q('sf-err').classList.remove('hidden');}
}
async function delStaff(id){
  if(!confirm('Deactivate this staff member?'))return;
  await api('/api/admin/staff/'+id,'DELETE'); loadStaff();
}

// ══ BUSES ════════════════════════════════════════════
async function loadBuses(){
  [allBuses,allRoutes]=await Promise.all([api('/api/admin/buses'),api('/api/admin/routes')]);
  q('bm-route').innerHTML='<option value="">None</option>'+allRoutes.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
  renderBuses(allBuses);
}
function renderBuses(data){
  q('buses-tbody').innerHTML=data.length?data.map(b=>`<tr>
    <td style="font-weight:700">${b.reg_number}</td>
    <td>${b.capacity} seats</td>
    <td>${parseFloat(b.mileage).toLocaleString()} km</td>
    <td style="font-size:.75rem;color:#6b7280">${b.route_name||'—'}</td>
    <td>${badge(b.status)}</td>
    <td style="display:flex;gap:.35rem;">
      <button class="btn btn-gray btn-sm" onclick="editBus(${b.id})">Edit</button>
      <button class="btn btn-red btn-sm" onclick="delBus(${b.id})">Delete</button>
    </td></tr>`).join('')
  :'<tr><td colspan="6" style="text-align:center;padding:2rem;color:#9ca3af;">No buses found.</td></tr>';
}
function filterBuses(){
  const v=q('bus-search').value.toLowerCase();
  renderBuses(allBuses.filter(b=>[b.reg_number,b.status,b.route_name||''].join(' ').toLowerCase().includes(v)));
}
function editBus(id){
  const b=allBuses.find(x=>x.id===id);
  q('bus-modal-title').textContent='Edit Bus';
  q('bm-id').value=b.id; q('bm-reg').value=b.reg_number;
  q('bm-cap').value=b.capacity; q('bm-mil').value=b.mileage;
  q('bm-status').value=b.status; q('bm-route').value=b.route_id||'';
  openModal('m-bus');
}
async function saveBus(){
  const id=q('bm-id').value;
  const body={reg_number:q('bm-reg').value,capacity:q('bm-cap').value,mileage:q('bm-mil').value||0,status:q('bm-status').value,route_id:q('bm-route').value||null};
  if(id)await api('/api/admin/buses/'+id,'PATCH',body);
  else await api('/api/admin/buses','POST',body);
  closeModal('m-bus'); q('bm-id').value=''; q('bus-modal-title').textContent='Add Bus'; loadBuses();
}
async function delBus(id){
  if(!confirm('Delete this bus?'))return;
  await api('/api/admin/buses/'+id,'DELETE'); loadBuses();
}

// ══ ROUTES ═══════════════════════════════════════════
async function loadRoutes(){
  allRoutes=await api('/api/admin/routes');
  renderRoutes(allRoutes);
}
function renderRoutes(data){
  q('routes-tbody').innerHTML=data.length?data.map(r=>`<tr>
    <td style="font-weight:600">${r.name}</td>
    <td>${r.origin}</td><td>${r.destination}</td>
    <td>${r.total_distance} km</td>
    <td style="font-size:.72rem">${r.road_options.map(o=>`<span style="display:inline-block;background:#eef2ff;color:#4338ca;padding:.1rem .4rem;border-radius:9999px;margin:.1rem">${o.road_name}</span>`).join('')||'—'}</td>
    <td>${badge(r.status)}</td>
    <td style="display:flex;gap:.35rem;">
      <button class="btn btn-gray btn-sm" onclick="editRoute(${r.id})">Edit</button>
      <button class="btn btn-red btn-sm" onclick="delRoute(${r.id})">Delete</button>
    </td></tr>`).join('')
  :'<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9ca3af;">No routes found.</td></tr>';
}
function filterRoutes(){
  const v=q('route-search').value.toLowerCase();
  renderRoutes(allRoutes.filter(r=>[r.name,r.origin,r.destination].join(' ').toLowerCase().includes(v)));
}
function editRoute(id){
  const r=allRoutes.find(x=>x.id===id);
  q('route-modal-title').textContent='Edit Route';
  q('rm-id').value=r.id; q('rm-name').value=r.name;
  q('rm-orig').value=r.origin; q('rm-dest').value=r.destination;
  q('rm-dist').value=r.total_distance;
  q('road-rows').innerHTML='';
  r.road_options.forEach(o=>{
    const div=document.createElement('div'); div.className='road-row';
    div.innerHTML=`<input placeholder="Road name" class="inp road-n" value="${o.road_name}"/><input type="number" placeholder="km" class="inp road-d" value="${o.distance}"/><input placeholder="Description" class="inp road-desc" value="${o.description||''}"/>`;
    q('road-rows').appendChild(div);
  });
  openModal('m-route');
}
function addRoadRow(){
  const d=document.createElement('div'); d.className='road-row';
  d.innerHTML=`<input placeholder="Road name" class="inp road-n"/><input type="number" placeholder="km" class="inp road-d"/><input placeholder="Description" class="inp road-desc"/>`;
  q('road-rows').appendChild(d);
}
async function saveRoute(){
  const id=q('rm-id').value;
  const road_options=[...document.querySelectorAll('#road-rows .road-row')].map(r=>({
    road_name:r.querySelector('.road-n').value,
    distance:r.querySelector('.road-d').value,
    description:r.querySelector('.road-desc').value
  })).filter(o=>o.road_name);
  const body={name:q('rm-name').value,origin:q('rm-orig').value,destination:q('rm-dest').value,total_distance:q('rm-dist').value,road_options};
  if(id)await api('/api/admin/routes/'+id,'PATCH',body);
  else await api('/api/admin/routes','POST',body);
  closeModal('m-route'); q('rm-id').value=''; q('road-rows').innerHTML='';
  q('route-modal-title').textContent='Add Route'; loadRoutes();
}
async function delRoute(id){
  if(!confirm('Delete this route?'))return;
  await api('/api/admin/routes/'+id,'DELETE'); loadRoutes();
}

// ══ SCHEDULES (with weekly/monthly filter) ════════════
async function loadScheds(){
  if(!allBuses.length)allBuses=await api('/api/admin/buses');
  if(!allStaff.length)allStaff=await api('/api/admin/staff');
  if(!allRoutes.length)allRoutes=await api('/api/admin/routes');
  q('sc-route').innerHTML='<option value="">Select Route</option>'+allRoutes.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');
  q('sc-bus').innerHTML='<option value="">Select Bus</option>'+allBuses.filter(b=>b.status==='active').map(b=>`<option value="${b.id}">${b.reg_number}</option>`).join('');
  const drivers=allStaff.filter(s=>s.role==='driver');
  const conductors=allStaff.filter(s=>s.role==='conductor');
  q('sc-driver').innerHTML='<option value="">Select Driver / Conductor</option>'
    +(drivers.length?'<optgroup label="── Drivers ──">'+drivers.map(s=>`<option value="${s.id}">🚌 ${s.first_name} ${s.last_name}</option>`).join('')+'</optgroup>':'')
    +(conductors.length?'<optgroup label="── Conductors ──">'+conductors.map(s=>`<option value="${s.id}">🎫 ${s.first_name} ${s.last_name}</option>`).join('')+'</optgroup>':'');
  await refreshSchedView();
}
async function refreshSchedView(){
  const today=new Date().toISOString().split('T')[0];
  const url=schedPeriod==='all'?'/api/admin/schedules':`/api/admin/schedules?view=${schedPeriod}&date=${today}`;
  allScheds=await api(url);
  renderScheds(allScheds);
  // update period buttons
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.toggle('active',b.dataset.p===schedPeriod));
}
function setSchedPeriod(p){schedPeriod=p;refreshSchedView();}

function renderScheds(data){
  q('sched-tbody').innerHTML=data.length?data.map(s=>`<tr>
    <td style="font-weight:600;font-size:.82rem">${s.route_name}</td>
    <td style="font-size:.82rem">${s.bus_reg}</td>
    <td style="font-size:.82rem">${s.driver_name}</td>
    <td style="font-size:.75rem;color:#6b7280">${s.road_name||'—'}</td>
    <td style="font-size:.78rem">${fmtDT(s.departure_time)}</td>
    <td style="font-size:.78rem">${fmtDT(s.arrival_time)}</td>
    <td>${s.is_delayed?badge('delayed'):badge(s.status)}${s.is_emergency?' <span class="badge b-red">⚠️</span>':''}</td>
    <td style="display:flex;gap:.25rem;align-items:center;">
      <select onchange="updateSched(${s.id},this.value)" class="inp" style="width:110px;font-size:.72rem;padding:.25rem .5rem;">
        ${['scheduled','in_progress','completed','cancelled'].map(st=>`<option value="${st}"${s.status===st?' selected':''}>${st}</option>`).join('')}
      </select>
      <button class="btn btn-red btn-sm" onclick="delSched(${s.id})">Del</button>
    </td></tr>`).join('')
  :'<tr><td colspan="8" style="text-align:center;padding:2rem;color:#9ca3af;">No schedules found.</td></tr>';
  renderTimeline(data);
}
function filterScheds(){
  const v=q('sched-search').value.toLowerCase();
  renderScheds(allScheds.filter(s=>[s.route_name,s.bus_reg,s.driver_name].join(' ').toLowerCase().includes(v)));
}
function toggleSchedView(){
  schedView=schedView==='table'?'timeline':'table';
  q('sched-table-view').classList.toggle('hidden',schedView==='timeline');
  q('sched-timeline-view').classList.toggle('hidden',schedView==='table');
}
function renderTimeline(data){
  if(!data.length){q('timeline-content').innerHTML='<p style="color:#9ca3af;font-size:.85rem">No schedules.</p>';return;}
  const sorted=[...data].sort((a,b)=>new Date(a.departure_time)-new Date(b.departure_time));
  const minT=new Date(sorted[0].departure_time).getHours();
  const colors=['#4f46e5','#0d9488','#d97706','#7c3aed','#dc2626','#059669'];
  q('timeline-content').innerHTML=sorted.map((s,i)=>{
    const dep=new Date(s.departure_time),arr=new Date(s.arrival_time);
    const left=Math.max(((dep.getHours()-minT)/12*100),0).toFixed(1);
    const width=Math.max(((arr-dep)/1000/3600/12*100),4).toFixed(1);
    const barColor=s.is_delayed?'#dc2626':colors[i%colors.length];
    return `<div class="tl-row">
      <div class="tl-time">${dep.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} — ${arr.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
      <div class="tl-bar-wrap">
        <div class="tl-bar" style="left:${left}%;width:${width}%;background:${barColor}" title="${s.route_name}${s.is_delayed?' [DELAYED]':''}">
          ${s.bus_reg} · ${s.route_name}${s.is_delayed?' ⚠️':''}
        </div>
      </div>
    </div>`;
  }).join('');
}
function onRouteChange(){
  const id=q('sc-route').value;
  const r=allRoutes.find(x=>x.id==id);
  q('sc-road').innerHTML='<option value="">Select Road</option>'+(r?r.road_options.map(o=>`<option value="${o.id}">${o.road_name}</option>`).join(''):'');
}
async function saveSched(){
  const id=q('sc-id').value;
  const route_id=q('sc-route').value;
  const bus_id=q('sc-bus').value;
  const driver_id=q('sc-driver').value;
  const dep=q('sc-dep').value;
  const arr=q('sc-arr').value;
  if(!route_id||!bus_id||!driver_id||!dep||!arr){
    q('sc-conflict').textContent='Please fill in all required fields (route, bus, driver, departure and arrival time).';
    q('sc-conflict').classList.remove('hidden');
    return;
  }
  const body={route_id,bus_id,driver_id,
    road_option_id:q('sc-road').value||null,departure_time:q('sc-dep').value,arrival_time:q('sc-arr').value,
    is_emergency:q('sc-emerg').checked,override_reason:q('sc-reason').value};
  const res=id?await api('/api/admin/schedules/'+id,'PATCH',body):await api('/api/admin/schedules','POST',body);
  if(res.conflict){
    q('sc-conflict').textContent=res.message; q('sc-conflict').classList.remove('hidden');
    q('sc-override').classList.remove('hidden');
  } else if(res.success){
    q('sc-conflict').classList.add('hidden'); q('sc-override').classList.add('hidden');
    closeModal('m-sched'); q('sc-id').value=''; loadScheds();
  }
}
async function updateSched(id,status){await api('/api/admin/schedules/'+id,'PATCH',{status});}
async function delSched(id){
  if(!confirm('Delete this schedule?'))return;
  await api('/api/admin/schedules/'+id,'DELETE'); loadScheds();
}

// ══ LIVE TRACKING ════════════════════════════════════
async function loadLive(){
  if(!liveMap){
    liveMap=L.map('live-map').setView([7.8731,80.7718],8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(liveMap);
  }
  allLive=await api('/api/admin/live');
  filterLive();
  setTimeout(loadLive,15000);
}
function filterLive(){
  const v=q('live-search').value.toLowerCase();
  const filtered=allLive.filter(b=>!v||b.reg_number.toLowerCase().includes(v));
  const cards=q('live-cards');
  if(!filtered.length){cards.innerHTML='<p style="color:#9ca3af;font-size:.85rem;grid-column:span 4">No active buses found.</p>';return;}
  cards.innerHTML=filtered.map(b=>`
    <div class="card" style="padding:.875rem;cursor:pointer;" onclick="liveMap.setView([${b.latitude},${b.longitude}],14);liveMap.invalidateSize()">
      ${b.sos?'<div style="font-size:.65rem;font-weight:700;color:#dc2626;background:#fee2e2;padding:2px 8px;border-radius:6px;margin-bottom:5px;">🆘 SOS ALERT</div>':''}
      <p style="font-weight:700;font-size:.85rem">🚌 ${b.reg_number}</p>
      <p style="font-size:.72rem;color:#6b7280;margin-top:.2rem">${b.route_name||'No active route'}</p>
      <p style="font-size:.7rem;color:#9ca3af">${b.driver_name}</p>
    </div>`).join('');
  filtered.forEach(b=>{
    const icon=L.divIcon({html:`<div style="background:${b.sos?'#dc2626':'#1a4fa0'};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid white;">🚌</div>`,iconSize:[28,28],iconAnchor:[14,14],className:''});
    if(liveMarkers[b.reg_number])liveMarkers[b.reg_number].setLatLng([b.latitude,b.longitude]);
    else liveMarkers[b.reg_number]=L.marker([b.latitude,b.longitude],{icon}).addTo(liveMap)
      .bindPopup(`<b>🚌 ${b.reg_number}</b><br>${b.route_name||''}<br>${b.driver_name}${b.sos?'<br><b style="color:red">🆘 SOS ACTIVE</b>':''}`);
  });
}

// ══ MAINTENANCE ══════════════════════════════════════
async function loadMaint(){
  if(!allBuses.length)allBuses=await api('/api/admin/buses');
  q('mm-bus').innerHTML='<option value="">Select Bus</option>'+allBuses.map(b=>`<option value="${b.id}">${b.reg_number}</option>`).join('');
  allMaint=await api('/api/admin/maintenance');
  renderMaint(allMaint);

  // service due alerts
  const due=await api('/api/admin/maintenance/due');
  if(due.length){
    q('maint-due-box').innerHTML=due.map(m=>{
      const daysLeft=Math.ceil((new Date(m.next_service)-new Date())/(1000*60*60*24));
      return `<div style="display:flex;justify-content:space-between;font-size:.78rem;padding:.4rem 0;border-bottom:1px solid rgba(255,255,255,.1)">
        <span>🚌 <b>${m.reg_number}</b> — ${m.description||m.type}</span>
        <span style="font-weight:700;color:${daysLeft<=7?'#fca5a5':'#fde68a'}">${daysLeft===0?'TODAY':daysLeft+'d'}</span>
      </div>`;
    }).join('');
    q('maint-due').classList.remove('hidden');
  } else {
    q('maint-due').classList.add('hidden');
  }

  // ═══ FRIEND B — PASTE YOUR FUEL CONSUMPTION CHART HERE ═══
  // Instructions: call api('/api/admin/expenses/fuel-trend') and render a bar chart
  // Target element: id="fuel-chart-wrap"
  // Data format: [{month:'2025-01', total:45000}, ...]
  // ═══════════════════════════════════════════════════
}
function renderMaint(data){
  if(!data.length){q('maint-tbody').innerHTML='<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9ca3af;">No maintenance logs.</td></tr>';return;}
  const grouped={};
  data.forEach(m=>{if(!grouped[m.reg_number])grouped[m.reg_number]=[];grouped[m.reg_number].push(m);});
  let html='';
  Object.entries(grouped).forEach(([bus,logs])=>{
    const total=logs.reduce((a,b)=>a+parseFloat(b.cost||0),0);
    const rowId='mrow_'+bus.replace(/[^a-z0-9]/gi,'');
    html+=`<tr class="detail-row" style="background:#eef2ff;cursor:pointer" onclick="toggleDetail('${rowId}')">
      <td><span style="color:#4f46e5;font-size:.75rem;font-weight:700" id="arrow_${rowId}">▶</span></td>
      <td style="font-weight:700">🚌 ${bus}</td>
      <td colspan="2" style="color:#6b7280;font-size:.8rem">${logs.length} log(s)</td>
      <td style="font-weight:700;color:#c2410c">LKR ${total.toLocaleString()}</td>
      <td colspan="2"></td></tr>`;
    logs.forEach(m=>{
      html+=`<tr id="${rowId}" class="detail-panel">
        <td></td><td style="color:#9ca3af;font-size:.72rem;padding-left:1.5rem">↳</td>
        <td>${badge(m.type)}</td><td style="font-size:.8rem">${fmtD(m.service_date)}</td>
        <td style="font-size:.8rem">LKR ${parseFloat(m.cost).toLocaleString()}</td>
        <td style="font-size:.8rem">${m.next_service?fmtD(m.next_service):'—'}</td>
        <td style="font-size:.75rem;color:#6b7280">${m.technician_name||'—'} · ${m.description}</td></tr>`;
    });
  });
  q('maint-tbody').innerHTML=html;
}
function toggleDetail(id){
  document.querySelectorAll('#'+id).forEach(el=>el.classList.toggle('open'));
  const arrow=q('arrow_'+id);
  if(arrow)arrow.textContent=arrow.textContent==='▶'?'▼':'▶';
}
function filterMaint(){
  const v=q('maint-search').value.toLowerCase();
  renderMaint(allMaint.filter(m=>[m.reg_number,m.technician_name||''].join(' ').toLowerCase().includes(v)));
}
async function saveMaint(){
  await api('/api/admin/maintenance','POST',{bus_id:q('mm-bus').value,service_date:q('mm-date').value,type:q('mm-type').value,description:q('mm-desc').value,cost:q('mm-cost').value,technician_name:q('mm-tech').value,next_service:q('mm-next').value||null});
  closeModal('m-maint'); loadMaint();
}

// ══ EXPENSES ═════════════════════════════════════════
async function loadExpenses(){
  if(!allBuses.length)allBuses=await api('/api/admin/buses');
  q('exp-bus-filter').innerHTML='<option value="">All Buses</option>'+allBuses.map(b=>`<option value="${b.id}">${b.reg_number}</option>`).join('');
  const busId=q('exp-bus-filter').value;
  const [rows,summary]=await Promise.all([api('/api/admin/expenses'+(busId?'?bus_id='+busId:'')),api('/api/admin/expenses/summary')]);
  allExp=rows;
  q('exp-summary').innerHTML=summary.map(b=>`
    <div class="card" style="padding:1rem;">
      <p style="font-weight:700;font-size:.85rem">🚌 ${b.reg_number}</p>
      <p style="font-size:1.25rem;font-weight:800;color:#c2410c;margin:.2rem 0">LKR ${parseFloat(b.total||0).toLocaleString()}</p>
      <p style="font-size:.72rem;color:#6b7280">Fuel: LKR ${parseFloat(b.fuel||0).toLocaleString()}</p>
      <p style="font-size:.72rem;color:#6b7280">Toll: LKR ${parseFloat(b.toll||0).toLocaleString()}</p>
      <p style="font-size:.72rem;color:#9ca3af">${b.receipts||0} receipts</p>
    </div>`).join('');
  renderExp(rows);
}
function renderExp(data){
  q('exp-tbody').innerHTML=data.length?data.map(r=>`<tr>
    <td style="font-weight:600;font-size:.82rem">${r.staff_name}</td>
    <td style="font-size:.8rem">${r.reg_number||'—'}</td>
    <td>${badge(r.category)}</td>
    <td style="font-weight:700;font-size:.82rem">LKR ${parseFloat(r.amount).toLocaleString()}</td>
    <td style="font-size:.75rem;color:#6b7280">${r.notes||'—'}</td>
    <td style="font-size:.78rem">${fmtD(r.submitted_at)}</td>
    <td>${r.receipt_image?`<a href="${r.receipt_image}" target="_blank" style="color:#4f46e5;font-size:.78rem;font-weight:600;text-decoration:underline">View</a>`:'—'}</td>
  </tr>`).join('')
  :'<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9ca3af;">No expenses found.</td></tr>';
}
function filterExp(){
  const v=q('exp-search').value.toLowerCase();
  const cat=q('exp-cat-filter').value;
  renderExp(allExp.filter(r=>(!v||[r.staff_name,r.notes||''].join(' ').toLowerCase().includes(v))&&(!cat||r.category===cat)));
}

// ══ REPORTS ══════════════════════════════════════════
async function loadReports(){
  if(!allBuses.length)allBuses=await api('/api/admin/buses');
  q('rep-bus').innerHTML='<option value="">All Buses</option>'+allBuses.map(b=>`<option value="${b.id}">${b.reg_number}</option>`).join('');

  // trip completion rate chart
  const completion=await api('/api/admin/analytics/completion');
  if(completion.length){
    const maxRate=Math.max(...completion.map(r=>r.rate));
    q('completion-chart').innerHTML=completion.slice(0,8).map(r=>`
      <div style="margin-bottom:.6rem;">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:.2rem;">
          <span style="color:#374151;font-weight:600">${r.route_name}</span>
          <span style="color:#1a4fa0;font-weight:700">${r.rate}%</span>
        </div>
        <div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;">
          <div style="height:100%;width:${r.rate}%;background:${r.rate>=80?'#16a34a':r.rate>=50?'#d97706':'#dc2626'};border-radius:4px;transition:width .4s;"></div>
        </div>
      </div>`).join('');
  }

  // ═══ FRIEND B — PASTE YOUR WEEKLY/MONTHLY REPORT FILTER HERE ═══
  // Instructions: add UI for period selector (week/month/all) and wire it to genReport()
  // Target element: id="rep-period-wrap"
  // The genReport() function already accepts period param — just set q('rep-period').value
  // ═══════════════════════════════════════════════════
}

async function genReport(){
  const type=q('rep-type').value, busId=q('rep-bus').value;
  const period=q('rep-period')?q('rep-period').value:'all';
  const [scheds,expSum]=await Promise.all([api('/api/admin/schedules'),api('/api/admin/expenses/summary')]);
  const filtered=busId?scheds.filter(s=>s.bus_id==busId):scheds;
  const expFiltered=busId?expSum.filter(e=>e.id==busId):expSum;
  const totalExp=expFiltered.reduce((a,b)=>a+parseFloat(b.total||0),0);
  const completed=filtered.filter(s=>s.status==='completed').length;
  const delayed=filtered.filter(s=>s.is_delayed).length;
  const completionRate=filtered.length>0?Math.round((completed/filtered.length)*100):0;
  q('rep-preview').innerHTML=`
    <div style="text-align:left">
      <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;">
        <span style="font-size:2rem">📄</span>
        <div>
          <p style="font-weight:700;color:#1f2937;margin:0">DTSL — ${type.toUpperCase()} REPORT</p>
          <p style="font-size:.72rem;color:#9ca3af;margin:.15rem 0 0">Generated ${new Date().toLocaleString()}${busId?' · Bus: '+allBuses.find(b=>b.id==busId)?.reg_number:''}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1rem;">
        <div style="background:#eef2ff;border-radius:.5rem;padding:.75rem;text-align:center"><p style="font-size:1.5rem;font-weight:800;color:#4f46e5;margin:0">${filtered.length}</p><p style="font-size:.65rem;color:#6b7280;margin:.15rem 0 0">Total Trips</p></div>
        <div style="background:#f0fdf4;border-radius:.5rem;padding:.75rem;text-align:center"><p style="font-size:1.5rem;font-weight:800;color:#16a34a;margin:0">${completed}</p><p style="font-size:.65rem;color:#6b7280;margin:.15rem 0 0">Completed</p></div>
        <div style="background:#fffbeb;border-radius:.5rem;padding:.75rem;text-align:center"><p style="font-size:1.5rem;font-weight:800;color:#d97706;margin:0">${completionRate}%</p><p style="font-size:.65rem;color:#6b7280;margin:.15rem 0 0">Completion Rate</p></div>
        <div style="background:#fff7ed;border-radius:.5rem;padding:.75rem;text-align:center"><p style="font-size:1rem;font-weight:800;color:#c2410c;margin:0">LKR ${totalExp.toLocaleString()}</p><p style="font-size:.65rem;color:#6b7280;margin:.15rem 0 0">Total Expenses</p></div>
      </div>
      ${delayed>0?`<div style="background:#fee2e2;border-radius:.5rem;padding:.5rem .875rem;font-size:.78rem;color:#dc2626;margin-bottom:.75rem;font-weight:600">⚠️ ${delayed} delayed trip${delayed>1?'s':''} detected in this period</div>`:''}
      <p style="font-size:.78rem;font-weight:700;color:#374151;margin-bottom:.5rem">Expense by Bus</p>
      ${expFiltered.map(b=>`<div style="display:flex;justify-content:space-between;font-size:.78rem;padding:.4rem 0;border-bottom:1px solid #f3f4f6"><span>🚌 ${b.reg_number}</span><span style="font-weight:700">LKR ${parseFloat(b.total||0).toLocaleString()}</span></div>`).join('')}
    </div>`;
  const res=await api('/api/admin/reports/generate','POST',{type,bus_id:busId||null,period});
  if(res.success){
    q('rep-link').classList.remove('hidden');
    q('rep-a').href=res.file;
    q('rep-a').textContent='Download PDF Report';
  }
}

// ══ INIT ═════════════════════════════════════════════
loadDash();
