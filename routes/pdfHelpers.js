// ODFFFFFFFF
const COLORS = {
  primary:   '#1a4fa0',
  primaryD:  '#0d2347',
  accent:    '#e11d48',
  green:     '#16a34a',
  amber:     '#d97706',
  red:       '#dc2626',
  gray:      '#6b7280',
  grayLight: '#f3f4f6',
  border:    '#e5e7eb',
  text:      '#1f2937',
  textMuted: '#6b7280',
};

const PAGE_MARGIN = 45;
const PAGE_WIDTH  = 595.28; // A4 width in points
const CONTENT_W   = PAGE_WIDTH - PAGE_MARGIN * 2;

/* ── HEADER / TITLE BAR ──────────────────────────────────────── */
function drawHeader(doc, title, subtitle) {
  const y = doc.y;
  // colored title bar
  doc.rect(PAGE_MARGIN, y, CONTENT_W, 56).fill(COLORS.primaryD);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(17)
     .text('DTSL', PAGE_MARGIN + 16, y + 10);
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
     .text('Digital Transport Sri Lanka', PAGE_MARGIN + 16, y + 30);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff')
     .text(title, PAGE_MARGIN, y + 12, { width: CONTENT_W - 16, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
     .text(subtitle || '', PAGE_MARGIN, y + 30, { width: CONTENT_W - 16, align: 'right' });
  doc.y = y + 56 + 18;
  doc.fillColor(COLORS.text);
}

/* ── SECTION LABEL ───────────────────────────────────────────── */
function sectionTitle(doc, text) {
  doc.moveDown(0.3);
  const y = doc.y;
  doc.rect(PAGE_MARGIN, y, 4, 14).fill(COLORS.primary);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.primaryD)
     .text(text, PAGE_MARGIN + 10, y);
  doc.moveDown(0.6);
  doc.fillColor(COLORS.text).font('Helvetica');
}

/* ── STAT CARDS ROW ──────────────────────────────────────────── */
// stats: [{label, value, color}]
function statCards(doc, stats) {
  const gap = 8;
  const cardW = (CONTENT_W - gap * (stats.length - 1)) / stats.length;
  const cardH = 52;
  const y = doc.y;
  stats.forEach((s, i) => {
    const x = PAGE_MARGIN + i * (cardW + gap);
    doc.roundedRect(x, y, cardW, cardH, 5).fillAndStroke('#fafafa', COLORS.border);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(s.color || COLORS.primary)
       .text(String(s.value), x + 8, y + 8, { width: cardW - 16 });
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.textMuted)
       .text(s.label.toUpperCase(), x + 8, y + 32, { width: cardW - 16, characterSpacing: 0.3 });
  });
  doc.y = y + cardH + 16;
}

/* ── TABLE ───────────────────────────────────────────────────── */
// columns: [{key, label, width(0-1 fraction), align}]
// rows: array of objects
function drawTable(doc, columns, rows, opts = {}) {
  const rowH = opts.rowHeight || 20;
  const headerH = 22;
  let colWidths = columns.map(c => c.width * CONTENT_W);
  let x0 = PAGE_MARGIN;

  function checkPageBreak(neededH) {
    if (doc.y + neededH > doc.page.height - PAGE_MARGIN - 30) {
      doc.addPage();
      doc.y = PAGE_MARGIN;
    }
  }

  // header row
  checkPageBreak(headerH + rowH);
  let y = doc.y;
  doc.rect(x0, y, CONTENT_W, headerH).fill(COLORS.primary);
  let cx = x0;
  columns.forEach((c, i) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
       .text(c.label.toUpperCase(), cx + 6, y + 7, { width: colWidths[i] - 10, align: c.align || 'left' });
    cx += colWidths[i];
  });
  doc.y = y + headerH;

  // body rows
  rows.forEach((row, idx) => {
    checkPageBreak(rowH);
    const ry = doc.y;
    if (idx % 2 === 1) {
      doc.rect(x0, ry, CONTENT_W, rowH).fill(COLORS.grayLight);
    }
    let cx2 = x0;
    columns.forEach((c, i) => {
      const val = typeof c.format === 'function' ? c.format(row[c.key], row) : (row[c.key] ?? '—');
      doc.font('Helvetica').fontSize(8).fillColor(c.color ? (typeof c.color === 'function' ? c.color(row) : c.color) : COLORS.text)
         .text(String(val), cx2 + 6, ry + 6, { width: colWidths[i] - 10, align: c.align || 'left' });
      cx2 += colWidths[i];
    });
    doc.y = ry + rowH;
    doc.moveTo(x0, doc.y).lineTo(x0 + CONTENT_W, doc.y).strokeColor(COLORS.border).lineWidth(0.5).stroke();
  });

  doc.y += 14;
}

/* ── HORIZONTAL BAR CHART ────────────────────────────────────── */
// items: [{label, value, color}]  maxValue optional
function barChart(doc, items, opts = {}) {
  if (!items.length) return;
  const maxVal = opts.maxValue || Math.max(...items.map(i => i.value), 1);
  const barH = 14;
  const gap = 10;
  const labelW = 130;
  const barAreaW = CONTENT_W - labelW - 50;

  items.forEach(item => {
    if (doc.y + barH + gap > doc.page.height - PAGE_MARGIN - 30) {
      doc.addPage(); doc.y = PAGE_MARGIN;
    }
    const y = doc.y;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.text)
       .text(item.label, PAGE_MARGIN, y + 3, { width: labelW - 8 });
    const w = Math.max((item.value / maxVal) * barAreaW, 3);
    doc.rect(PAGE_MARGIN + labelW, y, barAreaW, barH).fill(COLORS.grayLight);
    doc.rect(PAGE_MARGIN + labelW, y, w, barH).fill(item.color || COLORS.primary);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.text)
       .text(String(item.value), PAGE_MARGIN + labelW + barAreaW + 8, y + 3);
    doc.y = y + barH + gap;
  });
  doc.y += 6;
}

/* ── DONUT / PROGRESS RING ───────────────────────────────────── */
// value 0-100, used for completion rates etc
function donutChart(doc, x, y, radius, value, opts = {}) {
  const color = opts.color || (value >= 70 ? COLORS.green : value >= 40 ? COLORS.amber : COLORS.red);
  const lineWidth = opts.lineWidth || 8;
  const startAngle = -90;
  const endAngle = startAngle + (value / 100) * 360;

  // background ring
  doc.save();
  doc.lineWidth(lineWidth);
  doc.strokeColor(COLORS.grayLight);
  doc.circle(x, y, radius).stroke();

  // foreground arc — approximate with path using bezier-ish polyline since pdfkit has no native arc-stroke easily;
  // pdfkit DOES support .path with arcs via SVG-like commands through `doc.path`
  const steps = Math.max(Math.round((value / 100) * 60), 1);
  doc.strokeColor(color);
  doc.lineCap('round');
  let prevX = null, prevY = null;
  for (let i = 0; i <= steps; i++) {
    const ang = (startAngle + (i / 60) * 360) * (Math.PI / 180);
    const px = x + radius * Math.cos(ang);
    const py = y + radius * Math.sin(ang);
    if (prevX !== null) {
      doc.moveTo(prevX, prevY).lineTo(px, py).stroke();
    }
    prevX = px; prevY = py;
  }
  doc.restore();

  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.text)
     .text(value + '%', x - radius, y - 7, { width: radius * 2, align: 'center' });
}

/* ── MULTI DONUT ROW (used for per-depot completion comparison) ─ */
// items: [{label, value}]
function donutRow(doc, items) {
  const radius = 26;
  const cellW = CONTENT_W / items.length;
  const y = doc.y + radius + 6;
  items.forEach((item, i) => {
    const cx = PAGE_MARGIN + cellW * i + cellW / 2;
    donutChart(doc, cx, y, radius, item.value);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.textMuted)
       .text(item.label, PAGE_MARGIN + cellW * i, y + radius + 10, { width: cellW, align: 'center' });
  });
  doc.y = y + radius + 28;
}

/* ── BADGE (inline colored pill — drawn, returns nothing, just renders) ─ */
function badge(doc, text, x, y, color) {
  const w = doc.widthOfString(text) + 12;
  doc.roundedRect(x, y, w, 14, 7).fill(color + '22');
  doc.font('Helvetica-Bold').fontSize(7).fillColor(color)
     .text(text.toUpperCase(), x + 6, y + 4);
  return w;
}

/* ── FOOTER (page numbers, called after content is done) ────── */
function addFooters(doc, generatedBy) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 36;
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_WIDTH - PAGE_MARGIN, y)
       .strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.textMuted)
       .text(`Generated by ${generatedBy} · DTSL Digital Transport Sri Lanka`, PAGE_MARGIN, y + 6, { width: 300 });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_WIDTH - PAGE_MARGIN - 100, y + 6, { width: 100, align: 'right' });
  }
}

module.exports = {
  COLORS, PAGE_MARGIN, PAGE_WIDTH, CONTENT_W,
  drawHeader, sectionTitle, statCards, drawTable,
  barChart, donutChart, donutRow, badge, addFooters,
};
