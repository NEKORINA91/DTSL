
let allDepots=[], allStaff=[], allBuses=[];

const SECS=['dashboard','depots','staff','buses','reports'];
function nav(id,el){
  SECS.forEach(s=>document.getElementById('s-'+s).classList.add('hidden'));
  document.getElementById('s-'+id).classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  el.classList.add('active');
  ({dashboard:loadDash,depots:loadDepots,staff:loadStaff,buses:loadBuses})[id]();
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
  const m={active:'b-green',construction:'b-yellow',retiring:'b-orange',inactive:'b-gray',
    driver:'b-indigo',conductor:'b-teal',maintenance:'b-orange',retired:'b-gray'};
  return `<span class="badge ${m[s]||'b-gray'}">${s}</span>`;
}
function fmtD(d){return d?new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';}

// ── DASHBOARD ─────────────────────────────────────────────────
async function loadDash(){
  const d = await api('/api/superadmin/stats');
  document.getElementById('st-depots').textContent       = d.stats.total_depots;
  document.getElementById('st-active-depots').textContent= d.stats.active_depots;
  document.getElementById('st-staff').textContent        = d.stats.total_staff;
  document.getElementById('st-buses').textContent        = d.stats.total_buses;
  document.getElementById('st-routes').textContent       = d.stats.total_routes;
  document.getElementById('st-trips').textContent        = d.stats.total_schedules;

  const statusColor={active:'#16a34a',construction:'#d97706',retiring:'#ea580c',inactive:'#9ca3af'};
  document.getElementById('depot-cards').innerHTML = d.depots.map(dep=>`
    <div class="card p-4">
      <div class="flex justify-between items-start mb-3">
        <div>
          <p class="font-bold text-sm text-gray-800">${dep.name}</p>
          <p class="text-xs text-gray-400 mt-0.5">${dep.depot_code} · ${dep.location||'—'}</p>
        </div>
        <span class="badge" style="background:${statusColor[dep.status]}20;color:${statusColor[dep.status]}">${dep.status}</span>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div style="background:#f3f4f6;border-radius:.5rem;padding:.5rem">
          <p class="text-lg font-bold text-indigo-600">${dep.buses}</p>
          <p class="text-xs text-gray-400">Buses</p>
        </div>
        <div style="background:#f3f4f6;border-radius:.5rem;padding:.5rem">
          <p class="text-lg font-bold text-teal-600">${dep.staff}</p>
          <p class="text-xs text-gray-400">Staff</p>
        </div>
        <div style="background:#f3f4f6;border-radius:.5rem;padding:.5rem">
          <p class="text-lg font-bold text-purple-600">${dep.routes}</p>
          <p class="text-xs text-gray-400">Routes</p>
        </div>
      </div>
    </div>`).join('');
}

// ── DEPOTS ────────────────────────────────────────────────────
async function loadDepots(){
  allDepots = await api('/api/superadmin/depots');
  document.getElementById('depots-tbody').innerHTML = allDepots.length
    ? allDepots.map(d=>`<tr>
        <td class="font-mono font-bold text-indigo-700">${d.depot_code}</td>
        <td class="font-semibold">${d.name}</td>
        <td class="text-sm text-gray-500">${d.location||'—'}</td>
        <td>${badge(d.status)}</td>
        <td>—</td><td>—</td>
        <td style="display:flex;gap:.35rem">
          <button class="btn btn-gray btn-sm" onclick="editDepot(${d.id})">Edit</button>
          <button class="btn btn-red btn-sm" onclick="delDepot(${d.id})">Remove</button>
        </td></tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9ca3af">No depots yet.</td></tr>';
}
function editDepot(id){
  const d=allDepots.find(x=>x.id===id);
  document.getElementById('depot-modal-title').textContent='Edit Depot';
  document.getElementById('dm-id').value=d.id;
  document.getElementById('dm-code').value=d.depot_code;
  document.getElementById('dm-name').value=d.name;
  document.getElementById('dm-loc').value=d.location||'';
  document.getElementById('dm-status').value=d.status;
  document.getElementById('dm-pass').value='';
  document.getElementById('dm-err').classList.add('hidden');
  openModal('m-depot');
}
async function saveDepot(){
  const id=document.getElementById('dm-id').value;
  const body={
    depot_code:document.getElementById('dm-code').value,
    name:document.getElementById('dm-name').value,
    location:document.getElementById('dm-loc').value,
    status:document.getElementById('dm-status').value,
    password:document.getElementById('dm-pass').value
  };
  const res=id?await api('/api/superadmin/depots/'+id,'PATCH',body):await api('/api/superadmin/depots','POST',body);
  if(res.success){closeModal('m-depot');document.getElementById('dm-id').value='';document.getElementById('depot-modal-title').textContent='Add Depot';loadDepots();loadDash();}
  else{document.getElementById('dm-err').textContent=res.message;document.getElementById('dm-err').classList.remove('hidden');}
}
async function delDepot(id){
  if(!confirm('Deactivate this depot?'))return;
  await api('/api/superadmin/depots/'+id,'DELETE'); loadDepots(); loadDash();
}

// ── STAFF ─────────────────────────────────────────────────────
async function loadStaff(){
  [allStaff, allDepots] = await Promise.all([api('/api/superadmin/staff'), api('/api/superadmin/depots-list')]);
  document.getElementById('sf-depot').innerHTML='<option value="">Select Depot</option>'+allDepots.map(d=>`<option value="${d.id}">${d.depot_code} — ${d.name}</option>`).join('');
  renderStaff(allStaff);
}
function renderStaff(data){
  document.getElementById('staff-tbody').innerHTML = data.length
    ? data.map(s=>{
        const exp=s.license_expiry?new Date(s.license_expiry):null;
        const days=exp?Math.ceil((exp-new Date())/(1000*60*60*24)):null;
        const expBadge=days===null?'':days<0?'<span class="badge b-red">Expired</span>':days<30?`<span class="badge b-yellow">${days}d</span>`:'';
        return `<tr>
          <td><span class="font-semibold">${s.first_name} ${s.last_name}</span><br><span class="text-xs text-gray-400">${s.email}</span></td>
          <td>${badge(s.role)}</td>
          <td class="text-sm text-gray-600">${s.depot_name||'—'}</td>
          <td class="text-sm">${s.license_id||'—'} ${expBadge}</td>
          <td class="text-sm">${s.license_expiry?fmtD(s.license_expiry):'—'}</td>
          <td class="text-sm">${s.phone||'—'}</td>
          <td style="display:flex;gap:.35rem">
            <button class="btn btn-gray btn-sm" onclick="editStaff(${s.id})">Edit</button>
            <button class="btn btn-red btn-sm" onclick="delStaff(${s.id})">Remove</button>
          </td></tr>`;
      }).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9ca3af">No employees found.</td></tr>';
}
function filterStaff(){
  const v=document.getElementById('staff-search').value.toLowerCase();
  renderStaff(allStaff.filter(s=>[s.first_name,s.last_name,s.email,s.role,s.depot_name||'',s.license_id||''].join(' ').toLowerCase().includes(v)));
}
function editStaff(id){
  const s=allStaff.find(x=>x.id===id);
  document.getElementById('staff-modal-title').textContent='Edit Employee';
  document.getElementById('sf-id').value=s.id;
  document.getElementById('sf-fname').value=s.first_name;
  document.getElementById('sf-lname').value=s.last_name;
  document.getElementById('sf-email').value=s.email;
  document.getElementById('sf-phone').value=s.phone||'';
  document.getElementById('sf-role').value=s.role;
  document.getElementById('sf-depot').value=s.depot_id||'';
  document.getElementById('sf-lic').value=s.license_id||'';
  document.getElementById('sf-expiry').value=s.license_expiry?s.license_expiry.split('T')[0]:'';
  document.getElementById('sf-ntc').value=s.ntc_number||'';
  document.getElementById('sf-hours').value=s.working_hours||0;
  document.getElementById('sf-pass').value='';
  document.getElementById('sf-err').classList.add('hidden');
  openModal('m-staff');
}
async function saveStaff(){
  const id=document.getElementById('sf-id').value;
  const fd=new FormData();
  if(id)fd.append('id',id);
  ['fname','lname','email','phone','role','lic','ntc','pass'].forEach(k=>fd.append(k==='fname'?'first_name':k==='lname'?'last_name':k==='lic'?'license_id':k==='ntc'?'ntc_number':k==='pass'?'password':k,document.getElementById('sf-'+k).value));
  fd.append('depot_id',document.getElementById('sf-depot').value);
  fd.append('license_expiry',document.getElementById('sf-expiry').value||'');
  fd.append('working_hours',document.getElementById('sf-hours').value||0);
  const res=await fetch('/api/superadmin/staff',{method:'POST',body:fd}).then(r=>r.json());
  if(res.success){closeModal('m-staff');document.getElementById('sf-id').value='';document.getElementById('staff-modal-title').textContent='Add Employee';loadStaff();}
  else{document.getElementById('sf-err').textContent=res.message;document.getElementById('sf-err').classList.remove('hidden');}
}
async function delStaff(id){
  if(!confirm('Remove this employee?'))return;
  await api('/api/superadmin/staff/'+id,'DELETE'); loadStaff();
}

// ── BUSES ─────────────────────────────────────────────────────
async function loadBuses(){
  [allBuses, allDepots]=await Promise.all([api('/api/superadmin/buses'),api('/api/superadmin/depots-list')]);
  document.getElementById('bm-depot').innerHTML='<option value="">No Depot</option>'+allDepots.map(d=>`<option value="${d.id}">${d.depot_code} — ${d.name}</option>`).join('');
  renderBuses(allBuses);
}
function renderBuses(data){
  document.getElementById('buses-tbody').innerHTML=data.length
    ?data.map(b=>`<tr>
        <td class="font-bold">${b.reg_number}</td>
        <td class="text-sm text-gray-600">${b.depot_name||'—'}</td>
        <td>${b.capacity} seats</td>
        <td>${parseFloat(b.mileage).toLocaleString()} km</td>
        <td>${badge(b.status)}</td>
        <td style="display:flex;gap:.35rem">
          <button class="btn btn-gray btn-sm" onclick="editBus(${b.id})">Edit</button>
          <button class="btn btn-red btn-sm" onclick="delBus(${b.id})">Delete</button>
        </td></tr>`).join('')
    :'<tr><td colspan="6" style="text-align:center;padding:2rem;color:#9ca3af">No buses found.</td></tr>';
}
function filterBuses(){
  const v=document.getElementById('bus-search').value.toLowerCase();
  renderBuses(allBuses.filter(b=>[b.reg_number,b.depot_name||'',b.status].join(' ').toLowerCase().includes(v)));
}
function editBus(id){
  const b=allBuses.find(x=>x.id===id);
  document.getElementById('bus-modal-title').textContent='Edit Bus';
  document.getElementById('bm-id').value=b.id;
  document.getElementById('bm-reg').value=b.reg_number;
  document.getElementById('bm-cap').value=b.capacity;
  document.getElementById('bm-mil').value=b.mileage;
  document.getElementById('bm-status').value=b.status;
  document.getElementById('bm-depot').value=b.depot_id||'';
  document.getElementById('bm-err').classList.add('hidden');
  openModal('m-bus');
}
async function saveBus(){
  const id=document.getElementById('bm-id').value;
  const body={reg_number:document.getElementById('bm-reg').value,capacity:document.getElementById('bm-cap').value,mileage:document.getElementById('bm-mil').value||0,status:document.getElementById('bm-status').value,depot_id:document.getElementById('bm-depot').value||null};
  const res=id?await api('/api/superadmin/buses/'+id,'PATCH',body):await api('/api/superadmin/buses','POST',body);
  if(res.success){closeModal('m-bus');document.getElementById('bm-id').value='';document.getElementById('bus-modal-title').textContent='Add Bus';loadBuses();}
  else{document.getElementById('bm-err').textContent=res.message;document.getElementById('bm-err').classList.remove('hidden');}
}
async function delBus(id){
  if(!confirm('Delete this bus?'))return;
  await api('/api/superadmin/buses/'+id,'DELETE'); loadBuses();
}

loadDash();

// ── REPORTS ──────────────────────────────────────────────────
async function loadReports(){
  document.getElementById('rep-link').classList.add('hidden');
  const depots = await api('/api/superadmin/depots-list');
  const sel = document.getElementById('rep-depot');
  sel.innerHTML='<option value="">All Depots</option>'
    +depots.map(d=>`<option value="${d.id}">${d.depot_code} — ${d.name}</option>`).join('');
  // show/hide depot selector based on type
  document.getElementById('rep-type').addEventListener('change', function(){
    const needsDepot = this.value.includes('depot');
    document.getElementById('rep-depot-wrap').style.opacity = needsDepot ? '1' : '0.4';
  });
}

async function genReport(){
  const btn = document.querySelector('#s-reports .btn-primary');
  const type = document.getElementById('rep-type').value;
  const depot_id = document.getElementById('rep-depot').value;
  btn.disabled=true; btn.textContent='Generating...';
  const res = await api('/api/superadmin/reports/generate','POST',{type, depot_id: depot_id||null});
  if(res.success){
    document.getElementById('rep-link').classList.remove('hidden');
    document.getElementById('rep-a').href=res.file;
    document.getElementById('rep-a').textContent='Download PDF Report';
  } else {
    alert('Failed to generate report.');
  }
  btn.disabled=false; btn.textContent='Generate & Download PDF';
}
