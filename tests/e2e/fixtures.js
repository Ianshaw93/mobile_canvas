// Generates single-page PDF fixtures with coloured vector content, so the
// e2e run needs no checked-in binaries. Coloured bands stand in for the
// detail engineers need to read on site; the small black squares are
// registration marks at known fractions of the page.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function makePdf(filePath, w, h, label) {
  const ops = [];
  ops.push(`1 1 1 rg\n0 0 ${w} ${h} re f\n`);
  const bands = [[0.85, 0.1, 0.1], [0.1, 0.6, 0.2], [0.1, 0.3, 0.9], [0.95, 0.75, 0.05]];
  const bw = w / (bands.length + 1);
  bands.forEach(([r, g, b], i) => {
    ops.push(`${r} ${g} ${b} rg\n`);
    ops.push(`${bw * (i + 0.5)} ${h * 0.55} ${bw * 0.7} ${h * 0.3} re f\n`);
  });
  ops.push('0 0 0 rg\n');
  for (const [fx, fy] of [[0.1, 0.1], [0.5, 0.1], [0.9, 0.1], [0.5, 0.9]]) {
    ops.push(`${w * fx - 3} ${h * fy - 3} 6 6 re f\n`);
  }
  ops.push(`BT /F1 24 Tf 40 ${h * 0.4} Td (${label}) Tj ET\n`);
  const comp = zlib.deflateSync(Buffer.from(ops.join(''), 'latin1'));

  const objs = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] `
      + '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Length ${comp.length} /Filter /FlateDecode >>\nstream\n`),
      comp, Buffer.from('\nendstream')]),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];

  const parts = [Buffer.from('%PDF-1.4\n')];
  let len = parts[0].length;
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(len);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    parts.push(b); len += b.length;
  });
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += String(off).padStart(10, '0') + ' 00000 n \n';
  parts.push(Buffer.from(xref
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`));

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat(parts));
  return filePath;
}

// A4 landscape original + a same-size replacement; A3 for a uniform 1.414x
// page change; portrait for a non-uniform one.
function writeFixtures(dir) {
  return {
    a4: makePdf(path.join(dir, 'plan-a4.pdf'), 841.89, 595.28, 'LEVEL 00 - COLOUR'),
    a4v2: makePdf(path.join(dir, 'plan-a4-v2.pdf'), 841.89, 595.28, 'LEVEL 00 - REPLACED'),
    a3: makePdf(path.join(dir, 'plan-a3.pdf'), 1190.55, 841.89, 'LEVEL 00 - A3'),
    portrait: makePdf(path.join(dir, 'plan-portrait.pdf'), 595.28, 841.89, 'LEVEL 00 - PORTRAIT'),
  };
}

module.exports = { makePdf, writeFixtures };
