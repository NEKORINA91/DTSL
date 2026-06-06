/* ═══════════════════════════════════════════════════
   DTSL — customer.js  (redesigned with seat map)
   ═══════════════════════════════════════════════════ */

let liveMap=null, shareMap=null, shareMarker=null, liveMarkers={};
let sharingLocation=false, shareInterval=null;
let selectedSeat=null;

// ── TAB SWITCH ────────────────────────────────────────
const TABS=['search','live','mybooking','share','emergency'];
function switchTab(t){
  TABS.forEach(id=>{
    document.getElementById('pg-'+id).classList.add('hidden');
    const tb=document.getElementById('tab-'+id);
    if(tb) tb.classList.remove('active');
  });
  document.getElementById('pg-'+t).classList.remove('hidden');
  const activeTb=document.getElementById('tab-'+t);
  if(activeTb) activeTb.classList.add('active');
  if(t==='live'){initLiveMap();refreshLive();}
  if(t==='share'){initShareMap();}
}

// ── HELPERS ───────────────────────────────────────────
function fmtDT(d){return new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function fmtT(d){return new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
function q(id){return document.getElementById(id);}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function callNum(n,l){if(confirm('Call '+l+' ('+n+')?'))window.location.href='tel:'+n;}

// ── SEARCH ────────────────────────────────────────────
async function searchRoutes(){
  const from=q('s-from').value.trim();
  const to=q('s-to').value.trim();
  const date=q('s-date').value;
  const params=new URLSearchParams();
  if(from)params.set('origin',from);
  if(to)params.set('destination',to);
  if(date)params.set('date',date);
  const routes=await fetch('/api/routes?'+params).then(r=>r.json());
  const el=q('search-results');
  if(!routes.length){
    el.innerHTML=`<div class="card card-p" style="text-align:center;padding:3rem;color:var(--text-muted);">
      <p style="font-size:2.5rem;margin-bottom:.75rem">🔍</p>
      <p style="font-weight:700;color:var(--text);margin:0">No routes found</p>
      <p style="font-size:.85rem;margin:.3rem 0 0">Try different origin, destination or date</p>
    </div>`;
    return;
  }
  el.innerHTML=routes.map(r=>`
    <div class="card route-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div style="flex:1">
          <h3 style="font-weight:800;color:#fff;font-size:.95rem;margin:0">${r.name}</h3>
          <p style="font-size:.8rem;color:var(--text-muted);margin:.3rem 0 0">📍 ${r.origin} → ${r.destination} &nbsp;·&nbsp; ${r.total_distance} km</p>
          ${r.road_options&&r.road_options.length?`
            <div style="display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.6rem">
              ${r.road_options.map(o=>`<span class="road-tag">🛣️ ${o.road_name}</span>`).join('')}
            </div>`:''} 
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.5rem;margin-left:1rem">
          <span class="badge b-blue">${r.trip_count} trip${r.trip_count!=1?'s':''}</span>
          <button class="btn btn-primary btn-sm" onclick="loadTimetable(${r.id},'${r.name.replace(/'/g,"\\'")}','${r.origin}','${r.destination}')">
            View Timetable
          </button>
        </div>
      </div>
    </div>`).join('');
}

async function loadTimetable(id,name,origin,dest){
  const date=q('s-date').value;
  const params=new URLSearchParams();
  if(date)params.set('date',date);
  const rows=await fetch(`/api/routes/${id}/timetable?`+params).then(r=>r.json());
  q('tt-title').textContent=name;
  q('tt-sub').textContent=`📍 ${origin} → ${dest}${date?' · '+new Date(date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}):' · Upcoming trips'}`;
  if(!rows.length){
    q('tt-tbody').innerHTML=`<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted);">No trips scheduled${date?' for this date':' upcoming'}.</td></tr>`;
  } else {
    q('tt-tbody').innerHTML=rows.map(t=>{
      const avail=t.capacity-t.booked_seats;
      const pct=Math.round((t.booked_seats/t.capacity)*100);
      const seatColor=avail===0?'#f87171':avail<5?'#fbbf24':'#34d399';
      const seatClass=avail===0?'seat-full':avail<5?'seat-low':'seat-ok';
      return `<tr>
        <td style="font-weight:700;">${fmtT(t.departure_time)}</td>
        <td style="color:var(--text-muted)">${fmtT(t.arrival_time)}</td>
        <td>${t.bus_reg}</td>
        <td style="color:var(--text-muted);font-size:.75rem">${t.road_name||'—'}</td>
        <td style="min-width:90px">
          <div class="${seatClass}" style="font-size:.72rem;font-weight:700;margin-bottom:3px">${avail} left</div>
          <div class="seat-bar"><div class="seat-fill" style="width:${pct}%;background:${seatColor}"></div></div>
        </td>
        <td>
          <span class="badge ${t.status==='in_progress'?'b-yellow':'b-blue'}">${t.status}</span>
          ${t.is_emergency?'<span class="badge b-red" style="margin-left:.2rem">⚠️</span>':''}
        </td>
        <td>
          ${avail>0
            ?`<button class="btn btn-primary btn-sm" onclick="openBooking(${t.id},'${name.replace(/'/g,"\\'")}','${fmtDT(t.departure_time)}','${fmtDT(t.arrival_time)}',${avail},${t.capacity})">Book</button>`
            :`<span style="font-size:.75rem;color:var(--text-dim);font-weight:600">Full</span>`}
        </td>
      </tr>`;
    }).join('');
  }
  q('tt-panel').classList.remove('hidden');
  q('tt-panel').scrollIntoView({behavior:'smooth',block:'start'});
}

// ── SEAT MAP ──────────────────────────────────────────
async function openBooking(schedId,routeName,dep,arr,avail,capacity){
  q('bk-sched-id').value=schedId;
  q('bk-capacity').value=capacity;
  q('bk-trip-info').innerHTML=`<b style="color:#fff">${routeName}</b><br>
    <span style="color:var(--text-muted)">🕐 ${dep} → ${arr}</span><br>
    <span class="badge b-green" style="margin-top:.3rem">${avail} seats available</span>`;
  q('bk-name').value='';
  q('bk-phone').value='';
  q('bk-err').classList.add('hidden');
  q('bk-success').classList.add('hidden');
  q('bk-actions').style.display='flex';
  selectedSeat=null;
  q('bk-selected-label').textContent='';

  // Fetch booked seat numbers for this schedule
  let bookedSeats=[];
  try {
    const res=await fetch(`/api/seats/${schedId}`).then(r=>r.json());
    bookedSeats=res.booked||[];
  } catch(e){ bookedSeats=[]; }

  renderSeatMap(capacity, bookedSeats);
  document.getElementById('book-modal').classList.add('open');
}

function renderSeatMap(capacity, bookedSeats){
  const grid=q('seat-grid-rows');
  grid.innerHTML='';
  // Build rows of 4 seats with aisle gap (2+2)
  const totalRows=Math.ceil(capacity/4);
  for(let row=0;row<totalRows;row++){
    const rowEl=document.createElement('div');
    rowEl.className='seat-aisle-row';
    // seats: A, B | aisle | C, D
    const cols=[0,1,null,2,3];
    cols.forEach(col=>{
      if(col===null){
        const aisle=document.createElement('div');
        aisle.className='seat-aisle';
        rowEl.appendChild(aisle);
        return;
      }
      const seatNum=row*4+col+1;
      if(seatNum>capacity){
        const blank=document.createElement('div');
        rowEl.appendChild(blank);
        return;
      }
      const label=String.fromCharCode(65+col)+(row+1); // A1, B1, C1...
      const isBooked=bookedSeats.includes(seatNum);
      const btn=document.createElement('button');
      btn.className='seat-btn '+(isBooked?'seat-booked':'seat-avail');
      btn.textContent=label;
      btn.dataset.seat=seatNum;
      btn.dataset.label=label;
      if(!isBooked){
        btn.onclick=()=>selectSeat(btn,seatNum,label);
      } else {
        btn.disabled=true;
        btn.title='Already booked';
      }
      rowEl.appendChild(btn);
    });
    grid.appendChild(rowEl);
  }
}

function selectSeat(btn,seatNum,label){
  // Deselect previous
  document.querySelectorAll('.seat-btn.seat-selected').forEach(b=>{
    b.classList.remove('seat-selected');
    b.classList.add('seat-avail');
  });
  if(selectedSeat===seatNum){
    // toggle off
    selectedSeat=null;
    q('bk-selected-label').textContent='';
  } else {
    btn.classList.remove('seat-avail');
    btn.classList.add('seat-selected');
    selectedSeat=seatNum;
    q('bk-selected-label').textContent=`Seat ${label} selected`;
  }
}

// ── CONFIRM BOOKING ───────────────────────────────────
async function confirmBooking(){
  const schedId=q('bk-sched-id').value;
  const name=q('bk-name').value.trim();
  const phone=q('bk-phone').value.trim();
  if(!name||!phone){
    q('bk-err').textContent='Please enter your name and phone number.';
    q('bk-err').classList.remove('hidden');
    return;
  }
  if(!selectedSeat){
    q('bk-err').textContent='Please select a seat from the seat map above.';
    q('bk-err').classList.remove('hidden');
    return;
  }
  q('bk-err').classList.add('hidden');
  const res=await fetch('/api/book',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({schedule_id:schedId, name, phone, seats:1, seat_number:selectedSeat})
  }).then(r=>r.json());
  if(res.success){
    q('bk-success').classList.remove('hidden');
    q('bk-id-display').textContent='#'+res.booking_id;
    q('bk-actions').style.display='none';
    q('bk-err').classList.add('hidden');
    setTimeout(()=>closeModal('book-modal'),6000);
  } else {
    q('bk-err').textContent=res.message||'Booking failed. Please try again.';
    q('bk-err').classList.remove('hidden');
  }
}

// ── MY BOOKING ────────────────────────────────────────
async function lookupBooking(){
  const id=q('lookup-id').value.trim();
  if(!id)return;
  const b=await fetch('/api/booking/'+id).then(r=>r.json());
  const el=q('booking-result');
  if(!b){
    el.innerHTML=`<div class="card card-p" style="max-width:24rem;color:var(--text-muted);text-align:center;padding:2rem"><p>No booking found with ID #${id}</p></div>`;
    return;
  }
  const isConfirmed=b.status==='confirmed';
  el.innerHTML=`
    <div class="card card-p" style="max-width:28rem">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
        <div>
          <p style="font-size:.7rem;color:var(--text-dim);font-weight:700;text-transform:uppercase;margin:0">Booking #${b.id}</p>
          <p style="font-weight:800;font-size:1rem;color:#fff;margin:.2rem 0 0">${b.route_name}</p>
        </div>
        <span class="badge ${isConfirmed?'b-green':'b-gray'}">${b.status}</span>
      </div>
      <hr class="divider"/>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;font-size:.82rem;margin-bottom:1rem">
        <div><p class="lbl">Name</p><p style="font-weight:600;color:var(--text);margin:0">${b.name}</p></div>
        <div><p class="lbl">Phone</p><p style="font-weight:600;color:var(--text);margin:0">${b.phone}</p></div>
        <div><p class="lbl">Bus</p><p style="font-weight:600;color:var(--text);margin:0">${b.bus_reg}</p></div>
        <div><p class="lbl">Seats</p><p style="font-weight:600;color:var(--text);margin:0">${b.seats}</p></div>
        <div><p class="lbl">Departure</p><p style="font-weight:600;color:var(--text);margin:0">${fmtDT(b.departure_time)}</p></div>
        <div><p class="lbl">Arrival</p><p style="font-weight:600;color:var(--text);margin:0">${fmtDT(b.arrival_time)}</p></div>
      </div>
      ${isConfirmed?`
        <hr class="divider"/>
        <p class="lbl">Cancel Booking</p>
        <div style="display:flex;gap:.4rem">
          <input id="cancel-phone" class="inp" placeholder="Enter your phone to confirm" style="font-size:.8rem"/>
          <button class="btn btn-danger btn-sm" onclick="cancelBooking(${b.id})">Cancel</button>
        </div>
        <p id="cancel-msg" class="hidden" style="font-size:.75rem;margin-top:.4rem"></p>`:''} 
    </div>`;
}

async function cancelBooking(id){
  const phone=q('cancel-phone')?.value.trim();
  if(!phone)return;
  const res=await fetch('/api/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({booking_id:id,phone})}).then(r=>r.json());
  const msg=q('cancel-msg');
  if(msg){
    msg.classList.remove('hidden');
    if(res.success){msg.textContent='✅ Booking cancelled.';msg.style.color='#34d399';setTimeout(()=>lookupBooking(),1500);}
    else{msg.textContent='❌ '+res.message;msg.style.color='#f87171';}
  }
}

// ── LIVE MAP ──────────────────────────────────────────
function makeIcon(color,emoji){
  return L.divIcon({html:`<div style="background:${color};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.4);border:2px solid rgba(255,255,255,.4);">${emoji}</div>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-15],className:''});
}
function initLiveMap(){
  if(liveMap)return;
  liveMap=L.map('live-map').setView([7.8731,80.7718],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(liveMap);
}
async function refreshLive(){
  const buses=await fetch('/api/live').then(r=>r.json());
  const cards=q('live-bus-cards');
  if(!buses.length){
    cards.innerHTML=`<p style="color:var(--text-muted);font-size:.85rem;grid-column:span 3;padding:.5rem 0">No buses currently sharing location.</p>`;
    return;
  }
  cards.innerHTML=buses.map(b=>`
    <div class="card live-bus-card" onclick="liveMap&&liveMap.setView([${b.latitude},${b.longitude}],14)">
      ${b.sos?'<div class="sos-badge">🆘 SOS ALERT</div>':''}
      <p style="font-weight:800;font-size:.88rem;color:#fff;margin:0">🚌 ${b.reg_number}</p>
      <p style="font-size:.75rem;color:var(--text-muted);margin:.2rem 0 0">${b.route_name||'En route'}</p>
      <p style="font-size:.7rem;color:var(--text-dim);margin:.1rem 0 0">${b.driver_name}</p>
    </div>`).join('');
  buses.forEach(b=>{
    const icon=makeIcon(b.sos?'#dc2626':'#e11d48','🚌');
    if(liveMarkers[b.reg_number])liveMarkers[b.reg_number].setLatLng([b.latitude,b.longitude]);
    else liveMarkers[b.reg_number]=L.marker([b.latitude,b.longitude],{icon}).addTo(liveMap)
      .bindPopup(`<b>🚌 ${b.reg_number}</b><br>${b.route_name||''}<br>${b.driver_name}${b.sos?'<br><b style="color:red">🆘 SOS ACTIVE</b>':''}`);
  });
}

// ── SHARE LOCATION ────────────────────────────────────
function initShareMap(){
  if(shareMap)return;
  shareMap=L.map('share-map').setView([7.8731,80.7718],8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(shareMap);
}
function toggleShareLocation(){
  const btn=q('share-toggle');
  if(!sharingLocation){
    sharingLocation=true;
    btn.textContent='Stop'; btn.style.background='rgba(220,38,38,.7)'; btn.style.color='#fff'; btn.style.borderColor='rgba(220,38,38,.5)';
    q('share-status-text').textContent='📡 Sharing live location...';
    q('share-status-text').style.color='#34d399';
    const token='share_'+Math.random().toString(36).substr(2,8);
    const link=window.location.origin+'/share/'+token;
    q('share-link-box').classList.remove('hidden');
    q('share-link-inp').value=link;
    sendShareLoc(); shareInterval=setInterval(sendShareLoc,10000);
  } else {
    sharingLocation=false; clearInterval(shareInterval);
    btn.textContent='Start'; btn.style.background=''; btn.style.color=''; btn.style.borderColor='';
    q('share-status-text').textContent='Not sharing';
    q('share-status-text').style.color='var(--text-muted)';
    q('share-coords').textContent='';
    q('share-link-box').classList.add('hidden');
  }
}
function sendShareLoc(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{
    const{latitude:lat,longitude:lng}=pos.coords;
    q('share-coords').textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if(!shareMarker){
      shareMarker=L.marker([lat,lng],{icon:makeIcon('#6366f1','👤')}).addTo(shareMap).bindPopup('Your location');
      shareMap.setView([lat,lng],14);
    } else { shareMarker.setLatLng([lat,lng]); shareMap.setView([lat,lng],14); }
  },err=>console.warn(err.message));
}
function copyShareLink(){
  const inp=q('share-link-inp'); inp.select(); document.execCommand('copy');
  const btn=event.currentTarget; btn.textContent='Copied!';
  setTimeout(()=>btn.textContent='Copy',2000);
}

// ── INIT ──────────────────────────────────────────────
q('s-date').value=new Date().toISOString().split('T')[0];
searchRoutes();
