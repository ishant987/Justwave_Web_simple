export interface PassPrintItem {
  amount: string;
  childName: string;
  code: string;
  durationLabel: string;
  guardianName: string;
  validTillTime?: string;
  phone: string;
  printCountLabel?: string;
  qrSrc: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPrintCount(label?: string) {
  if (!label) return '';
  return `<div class="print-count">${escapeHtml(label)}</div>`;
}

function renderValidTill(item: PassPrintItem) {
  if (!item.validTillTime) return '';

  return `
    <div class="ticket-valid-till ticket-valid-till-right">
      <span>SCAN VALID TILL</span>
      <strong>${escapeHtml(item.validTillTime || '-')}</strong>
    </div>
  `;
}

function renderTicket(item: PassPrintItem, index: number, total: number) {
  const breakStyle = index === total - 1 ? '' : ' page-break-after: always; break-after: page;';

  return `
    <section class="ticket-page" style="${breakStyle}">
      <article class="ticket-sheet">
        ${renderPrintCount(item.printCountLabel)}
        <section class="ticket-left">
          <div class="ticket-heading">
            <div class="ticket-brand">JUSTWAVE</div>
            <div class="ticket-badge">CHILD PASS</div>
            <div class="ticket-admit">ADMIT ONE</div>
            <div class="ticket-child-name">${escapeHtml(item.childName)}</div>
          </div>
          <div class="ticket-meta-grid">
            <div>
              <span>TIME / DURATION</span>
              <strong>${escapeHtml(item.durationLabel)}</strong>
            </div>
            <div>
              <span>AMOUNT</span>
              <strong>${escapeHtml(item.amount)}</strong>
            </div>
            <div>
              <span>GUARDIAN</span>
              <strong>${escapeHtml(item.guardianName)}</strong>
            </div>
            <div>
              <span>PHONE</span>
              <strong>${escapeHtml(item.phone)}</strong>
            </div>
          </div>
          ${item.validTillTime ? `
            <div class="ticket-valid-till">
              <span>PASS VALID TILL</span>
              <strong>${escapeHtml(item.validTillTime || '-')}</strong>
            </div>
          ` : ''}
        </section>
        <section class="ticket-right">
          ${renderValidTill(item)}
          <div class="ticket-qr-frame">
            ${item.qrSrc ? `<img src="${item.qrSrc}" alt="QR" class="ticket-qr-image" />` : ''}
          </div>
          <div class="ticket-code">${escapeHtml(item.code)}</div>
        </section>
      </article>
    </section>
  `;
}

export function buildPassPrintDocument(items: PassPrintItem[], title: string) {
  const pages = items.map((item, index) => renderTicket(item, index, items.length)).join('');

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page {
            size: 297mm 170mm;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          html,
          body {
            width: 297mm;
            margin: 0;
            padding: 0;
            background: #ffffff;
            font-family: Arial, Helvetica, sans-serif;
          }
          body {
            overflow: hidden;
          }
          .ticket-page {
            width: 297mm;
            height: 170mm;
            overflow: hidden;
          }
          .ticket-sheet {
            position: relative;
            width: 100%;
            height: 100%;
            border: 2px solid #111111;
            background: #ffffff;
            display: grid;
            grid-template-columns: minmax(0, 1fr) 4.45in;
            overflow: hidden;
          }
          .ticket-left {
            padding: 0.55in 0.62in 0.38in;
            display: grid;
            grid-template-rows: auto auto;
            align-content: start;
            gap: 0.42in;
            min-width: 0;
            overflow: hidden;
          }
          .ticket-right {
            border-left: 3px dashed #111111;
            padding: 0.3in calc(0.26in + 10px) 0.24in 0.24in;
            display: grid;
            align-content: center;
            justify-items: center;
            gap: 0.12in;
            min-width: 0;
            overflow: hidden;
          }
          .ticket-brand {
            font-size: 46pt;
            font-weight: 900;
            letter-spacing: 0.02em;
            line-height: 0.95;
            color: #000000;
          }
          .ticket-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            justify-self: start;
            margin-top: 0.14in;
            padding: 0.09in 0.24in;
            border: 2px solid #111111;
            border-radius: 0.2in;
            font-size: 20pt;
            font-weight: 900;
            letter-spacing: 0.04em;
            color: #000000;
          }
          .ticket-admit {
            margin-top: 0.14in;
            font-size: 22pt;
            font-weight: 900;
            letter-spacing: 0.03em;
            color: #000000;
          }
          .ticket-child-name {
            margin-top: 0.08in;
            font-size: 40pt;
            font-weight: 900;
            line-height: 0.92;
            text-transform: uppercase;
            max-width: 100%;
            word-break: normal;
            overflow-wrap: anywhere;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            color: #000000;
          }
          .ticket-heading {
            display: grid;
            justify-items: start;
            gap: 0.02in;
          }
          .ticket-meta-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.2in 0.36in;
            margin-top: 0.05in;
          }
          .ticket-meta-grid span {
            display: block;
            margin-bottom: 0.05in;
            font-size: 16pt;
            font-weight: 900;
            color: #000000;
          }
          .ticket-meta-grid strong {
            display: block;
            font-size: 21pt;
            font-weight: 900;
            line-height: 1.05;
            word-break: break-word;
            color: #000000;
          }
          .ticket-valid-till {
            margin-top: 0.28in;
            display: grid;
            gap: 0.06in;
          }
          .ticket-valid-till-right {
            margin-top: 0;
            margin-bottom: 0.12in;
            text-align: center;
            justify-items: center;
          }
          .ticket-valid-till span {
            font-size: 16pt;
            font-weight: 900;
            color: #000000;
          }
          .ticket-valid-till strong {
            font-size: 20pt;
            font-weight: 900;
            line-height: 1.08;
            color: #000000;
          }
          .ticket-qr-frame {
            width: 3.15in;
            height: 3.15in;
            border: 2px solid #111111;
            border-radius: 0.22in;
            display: grid;
            place-items: center;
            padding: 0.1in;
            background: #ffffff;
          }
          .ticket-qr-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
            image-rendering: pixelated;
          }
          .ticket-code {
            font-size: 20pt;
            font-weight: 900;
            letter-spacing: 0.11in;
            text-align: center;
            color: #000000;
          }
          .print-count {
            position: absolute;
            top: 0.18in;
            right: 0.2in;
            z-index: 2;
            color: #111111;
            font-size: 22pt;
            font-weight: 900;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>${pages}</body>
    </html>
  `;
}
