import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import * as entryExitApi from '../api/entryExitApi';
import * as locationApi from '../api/locationApi';
import { useAuth } from '../hooks/useAuth';
import { StatusBanner } from '../components/StatusBanner';
import type { ChildRecord, EntryExitLog, PassCreatePayload, PaymentMode } from '../types/entryExit';

interface DraftChild {
  id: string;
  name: string;
  durationPriceId: string;
}

interface PendingPassPreview {
  childKey: string;
  childId?: string;
  childName: string;
  durationPriceId: string;
  amount: number;
  guardianName: string;
  phone: string;
  isDraft: boolean;
}

function normalizeListResponse<T>(payload: { data?: T[] } | T[] | undefined): T[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.data ?? [];
}

function compactDurationLabel(label?: string | null): string {
  if (!label) return '40 mins';
  return label.replace(/\s*\([^)]*\)/g, '').trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function printHtmlDocument(html: string) {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 400);
    };

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      iframe.remove();
      reject(new Error('Could not prepare print view. Please try again.'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const finalize = () => {
      cleanup();
      resolve();
    };

    const triggerPrint = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        cleanup();
        reject(new Error('Could not prepare print view. Please try again.'));
        return;
      }

      printWindow.onafterprint = finalize;
      printWindow.focus();
      printWindow.print();
      window.setTimeout(finalize, 1200);
    };

    if (doc.readyState === 'complete') {
      window.setTimeout(triggerPrint, 150);
    } else {
      iframe.onload = () => {
        window.setTimeout(triggerPrint, 150);
      };
    }
  });
}

function UiIcon({ type }: { type: 'phone' | 'user' | 'children' | 'ticket' | 'plus' }) {
  const paths = {
    phone: 'M7.8 4.5c.4-.4 1-.6 1.6-.4l2.1.7c.7.2 1.1.9 1 1.6l-.3 2c0 .4.1.8.4 1.1l1.5 1.5c.3.3.7.4 1.1.4l2-.3c.7-.1 1.4.3 1.6 1l.7 2.1c.2.6 0 1.2-.4 1.6l-1 1a2.5 2.5 0 0 1-2.3.7c-2.6-.7-5.1-2.2-7.2-4.3c-2.1-2.1-3.6-4.6-4.3-7.2A2.5 2.5 0 0 1 6.8 5.5l1-1Z',
    user: 'M12 5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Zm-6 13a6 6 0 0 1 12 0v1H6v-1Z',
    children: 'M9 7a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5Zm7-1a2 2 0 1 1 0 4a2 2 0 0 1 0-4ZM4 18a4.5 4.5 0 0 1 9 0v1H4v-1Zm10 1a3.5 3.5 0 0 1 7 0h-7Z',
    ticket: 'M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V6Zm4 1v10h2V7H9Zm4 0v10h2V7h-2Z',
    plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  } as const;

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[type]} fill="currentColor" />
    </svg>
  );
}

export function NewWalkInPage() {
  const { token } = useAuth();
  const [lookupPhone, setLookupPhone] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [durationPriceId, setDurationPriceId] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [isAddChildOpen, setIsAddChildOpen] = useState(false);
  const [pendingChildCount, setPendingChildCount] = useState('1');
  const [pendingChildNames, setPendingChildNames] = useState<string[]>(['']);
  const [childDurationById, setChildDurationById] = useState<Record<string, string>>({});
  const [draftChildren, setDraftChildren] = useState<DraftChild[]>([]);
  const [selectedDraftChildIds, setSelectedDraftChildIds] = useState<string[]>([]);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [createdPasses, setCreatedPasses] = useState<EntryExitLog[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentPlan, setPaymentPlan] = useState<'once' | 'parts'>('once');
  const [toastMessage, setToastMessage] = useState('');
  const [qrByPassId, setQrByPassId] = useState<Record<string, string>>({});
  const lastLookupPhoneRef = useRef('');

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: () => locationApi.getLocations(token!),
    enabled: !!token,
  });

  const durationPricesQuery = useQuery({
    queryKey: ['duration-prices'],
    queryFn: () => entryExitApi.getDurationPrices(token!),
    enabled: !!token,
  });

  const lookupMutation = useMutation({
    mutationFn: (phone: string) => entryExitApi.lookupParentByPhone(token!, phone),
  });

  const printMutation = useMutation({
    mutationFn: async () => {
      const sharedPayload = {
        location_id: selectedLocationId,
        phone: lookupPhone,
      } satisfies Pick<PassCreatePayload, 'location_id' | 'phone'>;

      const baseIdentity: Partial<PassCreatePayload> = {};
      if (lookupData?.parent?.id) baseIdentity.parent_id = lookupData.parent.id;
      if (lookupData?.customer?.id) baseIdentity.customer_id = lookupData.customer.id;
      if (!lookupData?.parent?.id && !lookupData?.customer?.id && manualCustomerName.trim()) {
        baseIdentity.customer_name = manualCustomerName.trim();
      }

      const requests: Promise<Awaited<ReturnType<typeof entryExitApi.createPass>>>[] = [];

      selectedChildIds.forEach((childId) => {
        const childDuration = childDurationById[childId] || durationPriceId;
        if (!childDuration) return;
        requests.push(
          entryExitApi.createPass(token!, {
            ...sharedPayload,
            ...baseIdentity,
            child_ids: [childId],
            duration_price_id: childDuration,
          }),
        );
      });

      draftChildren
        .filter((child) => selectedDraftChildIds.includes(child.id))
        .forEach((child) => {
          const childDuration = child.durationPriceId || durationPriceId;
          if (!childDuration || !child.name.trim()) return;
          requests.push(
            entryExitApi.createPass(token!, {
              ...sharedPayload,
              ...baseIdentity,
              child_names: [child.name.trim()],
              child_count: 1,
              duration_price_id: childDuration,
            }),
          );
        });

      if (!requests.length) {
        throw new Error('Select or add at least one child before printing tickets.');
      }

      const responses = await Promise.all(requests);
      const nextCreatedPasses = responses.flatMap((response) => response.data);
      const ids = nextCreatedPasses.map((item) => item.id);

      if (ids.length && paymentPlan === 'once') {
        await entryExitApi.markPassPaid(token!, ids, paymentMode);
      }

      const qrEntries = await Promise.all(
        nextCreatedPasses.map(async (passItem) => {
          const dataUrl = await QRCode.toDataURL(passItem.id, {
            margin: 1,
            width: 220,
            color: {
              dark: '#000000',
              light: '#ffffff',
            },
          });
          return [passItem.id, dataUrl] as const;
        }),
      );
      const nextQrByPassId = Object.fromEntries(qrEntries);

      if (ids.length) {
        await entryExitApi.recordPrint(token!, ids);
      }

      const ticketHtml = nextCreatedPasses
        .map((passItem) => {
          const durationLabel = compactDurationLabel(
            durationPriceMap[childDurationById[passItem.child_id || ''] || durationPriceId]?.duration_label,
          );
          const guardianName = passItem.parent_name || passItem.customer_name || lookupData?.parent?.name || '-';
          const qrSrc = nextQrByPassId[passItem.id] || '';

          return `
            <section class="ticket-page">
              <article class="ticket-sheet">
                <div class="ticket-left">
                  <div class="ticket-brand">JUSTWAVE</div>
                  <div class="ticket-badge">CHILD PASS</div>
                  <div class="ticket-admit">ADMIT ONE</div>
                  <div class="ticket-child-name">${escapeHtml(passItem.child_name || 'Walk-In Child')}</div>
                  <div class="ticket-meta-grid">
                    <div>
                      <span>TIME / DURATION</span>
                      <strong>${escapeHtml(durationLabel)}</strong>
                    </div>
                    <div>
                      <span>AMOUNT</span>
                      <strong>Rs.${Number(passItem.bill_total_amount ?? passItem.pass_price ?? 0).toFixed(0)}</strong>
                    </div>
                    <div>
                      <span>GUARDIAN</span>
                      <strong>${escapeHtml(guardianName)}</strong>
                    </div>
                    <div>
                      <span>PHONE</span>
                      <strong>${escapeHtml(lookupPhone)}</strong>
                    </div>
                  </div>
                </div>
                <div class="ticket-right">
                  <div class="ticket-qr-frame">
                    ${qrSrc ? `<img src="${qrSrc}" alt="QR" class="ticket-qr-image" />` : ''}
                  </div>
                  <div class="ticket-code">${escapeHtml(passItem.id.slice(0, 8).toUpperCase())}</div>
                </div>
              </article>
            </section>
          `;
        })
        .join('');

      await printHtmlDocument(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Entry Tickets</title>
            <style>
              @page {
                size: 12in 6in;
                margin: 0;
              }
              * {
                box-sizing: border-box;
              }
              html, body {
                margin: 0;
                padding: 0;
                background: #ffffff;
                font-family: Arial, Helvetica, sans-serif;
              }
              .ticket-page {
                width: 12in;
                height: 6in;
                page-break-after: always;
                break-after: page;
                overflow: hidden;
              }
              .ticket-page:last-child {
                page-break-after: auto;
                break-after: auto;
              }
              .ticket-sheet {
                width: 12in;
                height: 6in;
                border: 2px solid #111111;
                display: grid;
                grid-template-columns: minmax(0, 1.45fr) 3.2in;
                overflow: hidden;
              }
              .ticket-left {
                padding: 0.65in 0.7in 0.55in;
              }
              .ticket-right {
                border-left: 3px dashed #111111;
                padding: 0.45in;
                display: grid;
                align-content: center;
                justify-items: center;
                gap: 0.22in;
              }
              .ticket-brand {
                font-size: 40pt;
                font-weight: 900;
                letter-spacing: 0.02em;
                line-height: 0.95;
              }
              .ticket-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-top: 0.18in;
                padding: 0.08in 0.22in;
                border: 2px solid #111111;
                border-radius: 0.2in;
                font-size: 16pt;
                font-weight: 900;
                letter-spacing: 0.04em;
              }
              .ticket-admit {
                margin-top: 0.4in;
                font-size: 16pt;
                font-weight: 900;
                letter-spacing: 0.03em;
              }
              .ticket-child-name {
                margin-top: 0.12in;
                font-size: 42pt;
                font-weight: 900;
                line-height: 0.95;
                text-transform: uppercase;
                max-width: 100%;
                word-break: break-word;
              }
              .ticket-meta-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 0.32in 0.4in;
                margin-top: 0.75in;
              }
              .ticket-meta-grid span {
                display: block;
                margin-bottom: 0.08in;
                font-size: 14pt;
                font-weight: 900;
              }
              .ticket-meta-grid strong {
                display: block;
                font-size: 18pt;
                font-weight: 900;
                line-height: 1.15;
                word-break: break-word;
              }
              .ticket-qr-frame {
                width: 2.6in;
                height: 2.6in;
                border: 2px solid #111111;
                border-radius: 0.22in;
                display: grid;
                place-items: center;
                padding: 0.12in;
                background: #ffffff;
              }
              .ticket-qr-image {
                width: 100%;
                height: 100%;
                object-fit: contain;
              }
              .ticket-code {
                font-size: 16pt;
                font-weight: 900;
                letter-spacing: 0.12in;
              }
            </style>
          </head>
          <body>${ticketHtml}</body>
        </html>
      `);

      return {
        createdPasses: nextCreatedPasses,
        qrByPassId: nextQrByPassId,
      };
    },
    onSuccess: (response) => {
      setCreatedPasses(response.createdPasses);
      setQrByPassId(response.qrByPassId);
      setResultMessage('Payment completed and ticket printed successfully.');
      setIsTicketOpen(false);
      setIsPaymentOpen(false);
      setCreatedPasses([]);
      setSelectedChildIds([]);
      setSelectedDraftChildIds([]);
      setDraftChildren([]);
      setChildDurationById({});
      setManualCustomerName('');
      setLookupPhone('');
      lastLookupPhoneRef.current = '';
      window.location.replace('/walkin/new');
    },
  });

  const locations = normalizeListResponse(locationsQuery.data);
  const durationPrices = normalizeListResponse(durationPricesQuery.data).filter((item) => item.is_active);
  const lookupData = lookupMutation.data?.data;
  const existingChildren = lookupData?.children ?? [];
  const activeSessions = lookupData?.active_sessions ?? [];
  const insideChildIds = useMemo(
    () =>
      new Set(
        activeSessions
          .filter(
            (session) =>
              !!session.child_id &&
              (session.pass_lifecycle_status === 'claimed_inside' ||
                session.pass_lifecycle_status === 'issued_not_scanned' ||
                !session.actual_exit_time),
          )
          .map((session) => session.child_id as string),
      ),
    [activeSessions],
  );
  const durationPriceMap = useMemo(
    () => Object.fromEntries(durationPrices.map((item) => [item.id, item])),
    [durationPrices],
  );
  const totalSelectedChildren = selectedChildIds.length + selectedDraftChildIds.length;
  const totalAmount = useMemo(() => {
    const existingTotal = selectedChildIds.reduce((sum, childId) => {
      const priceId = childDurationById[childId] || durationPriceId;
      return sum + (durationPriceMap[priceId]?.price ?? 0);
    }, 0);
    const draftTotal = draftChildren.reduce(
      (sum, child) =>
        selectedDraftChildIds.includes(child.id) ? sum + (durationPriceMap[child.durationPriceId]?.price ?? 0) : sum,
      0,
    );
    return existingTotal + draftTotal;
  }, [childDurationById, draftChildren, durationPriceId, durationPriceMap, selectedChildIds, selectedDraftChildIds]);
  const paymentTotal = useMemo(
    () =>
      selectedChildIds.reduce((sum, childId) => {
        const priceId = childDurationById[childId] || durationPriceId;
        return sum + (durationPriceMap[priceId]?.price ?? 0);
      }, 0) +
      draftChildren.reduce(
        (sum, child) =>
          selectedDraftChildIds.includes(child.id) ? sum + (durationPriceMap[child.durationPriceId]?.price ?? 0) : sum,
        0,
      ),
    [childDurationById, draftChildren, durationPriceId, durationPriceMap, selectedChildIds, selectedDraftChildIds],
  );
  const hasLookupPhone = lookupPhone.trim().length > 0;
  const isNewCustomerFlowActive = manualCustomerName.trim().length > 0 || draftChildren.length > 0;
  const pendingPasses = useMemo<PendingPassPreview[]>(
    () => [
      ...existingChildren
        .filter((child) => selectedChildIds.includes(child.id))
        .map((child) => {
          const selectedDurationPriceId = childDurationById[child.id] || durationPriceId;
          return {
            childKey: child.id,
            childId: child.id,
            childName: child.name,
            durationPriceId: selectedDurationPriceId,
            amount: durationPriceMap[selectedDurationPriceId]?.price ?? 0,
            guardianName: lookupData?.parent?.name || lookupData?.customer?.name || manualCustomerName || '-',
            phone: lookupPhone,
            isDraft: false,
          };
        }),
      ...draftChildren
        .filter((child) => selectedDraftChildIds.includes(child.id))
        .map((child) => ({
          childKey: child.id,
          childName: child.name,
          durationPriceId: child.durationPriceId || durationPriceId,
          amount: durationPriceMap[child.durationPriceId || durationPriceId]?.price ?? 0,
          guardianName: lookupData?.parent?.name || lookupData?.customer?.name || manualCustomerName || '-',
          phone: lookupPhone,
          isDraft: true,
        })),
    ],
    [
      childDurationById,
      draftChildren,
      durationPriceId,
      durationPriceMap,
      existingChildren,
      lookupData?.customer?.name,
      lookupData?.parent?.name,
      lookupPhone,
      manualCustomerName,
      selectedChildIds,
      selectedDraftChildIds,
    ],
  );

  useEffect(() => {
    if (!selectedLocationId && locations.length) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!durationPriceId && durationPrices.length) {
      setDurationPriceId(durationPrices[0].id);
    }
  }, [durationPriceId, durationPrices]);

  useEffect(() => {
    if (!durationPriceId) return;
    setChildDurationById((current) => {
      const next = { ...current };
      existingChildren.forEach((child) => {
        if (!next[child.id]) {
          next[child.id] = durationPriceId;
        }
      });
      return next;
    });
    setDraftChildren((current) =>
      current.map((child) => ({
        ...child,
        durationPriceId: child.durationPriceId || durationPriceId,
      })),
    );
  }, [durationPriceId, existingChildren]);

  useEffect(() => {
    setSelectedChildIds((current) => current.filter((id) => !insideChildIds.has(id)));
  }, [insideChildIds]);

  function toggleChild(child: ChildRecord) {
    if (insideChildIds.has(child.id)) {
      return;
    }
    setSelectedChildIds((current) =>
      current.includes(child.id) ? current.filter((id) => id !== child.id) : [...current, child.id],
    );
  }

  function updateExistingChildDuration(childId: string, nextDurationPriceId: string) {
    setChildDurationById((current) => ({
      ...current,
      [childId]: nextDurationPriceId,
    }));
  }

  function handleLookup() {
    const normalizedPhone = lookupPhone.replace(/\D/g, '').trim();
    if (normalizedPhone.length < 10) return;
    setSelectedChildIds([]);
    setDraftChildren([]);
    setResultMessage('');
    lastLookupPhoneRef.current = normalizedPhone;
    lookupMutation.mutate(normalizedPhone);
  }

  function triggerLookupForPhone(normalizedPhone: string) {
    if (normalizedPhone.length < 10) return;
    if (normalizedPhone === lastLookupPhoneRef.current) return;
    setSelectedChildIds([]);
    setDraftChildren([]);
    setResultMessage('');
    lastLookupPhoneRef.current = normalizedPhone;
    lookupMutation.mutate(normalizedPhone);
  }

  function openAddChildModal() {
    if (!hasLookupPhone) {
      return;
    }
    const existingDraftNames = draftChildren.map((child) => child.name);
    setPendingChildCount(String(existingDraftNames.length));
    setPendingChildNames(existingDraftNames);
    setIsAddChildOpen(true);
  }

  function handlePendingChildCountChange(value: string) {
    const normalizedValue = value === '' ? '' : String(Math.max(0, Number(value) || 0));
    setPendingChildCount(normalizedValue);
    const safeCount = normalizedValue === '' ? 0 : Number(normalizedValue);
    setPendingChildNames((current) => {
      const next = Array.from({ length: safeCount }, (_, index) => current[index] ?? '');
      return next;
    });
  }

  function updatePendingChildName(index: number, value: string) {
    setPendingChildNames((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function savePendingChildren() {
    const cleanedNames = pendingChildNames.map((item) => item.trim()).filter(Boolean);
    const nextDraftChildren = cleanedNames.map((name, index) => ({
        id: `draft-${index}-${name}`,
        name,
        durationPriceId: draftChildren[index]?.durationPriceId || durationPriceId,
      }));
    setDraftChildren(nextDraftChildren);
    setSelectedDraftChildIds(nextDraftChildren.map((child) => child.id));
    setIsAddChildOpen(false);
  }

  function updateDraftChildDuration(childId: string, nextDurationPriceId: string) {
    setDraftChildren((current) =>
      current.map((child) =>
        child.id === childId
          ? {
              ...child,
              durationPriceId: nextDurationPriceId,
            }
          : child,
      ),
    );
  }

  function toggleDraftChild(childId: string) {
    setSelectedDraftChildIds((current) =>
      current.includes(childId) ? current.filter((id) => id !== childId) : [...current, childId],
    );
  }

  function handleCreatePass(event: FormEvent) {
    event.preventDefault();

    if (!pendingPasses.length) {
      setToastMessage('Select or add at least one child before generating passes.');
      window.setTimeout(() => setToastMessage(''), 2600);
      return;
    }

    setResultMessage('');
    setPaymentMode('cash');
    setPaymentPlan('once');
    setIsPaymentOpen(true);
  }

  const customerNameValue = lookupData?.parent?.name || lookupData?.customer?.name || manualCustomerName;

  return (
    <div className="simple-page">
      {toastMessage ? <div className="top-toast">{toastMessage}</div> : null}

      <section className="simple-card">
        <form className="simple-form full-height-form" onSubmit={handleCreatePass}>
          <div className="simple-top-row">
            <label className="simple-field">
              <span className="simple-field-label">Customer / Parent Phone Number</span>
              <div className="input-with-button input-shell">
                <span className="input-leading-icon">
                  <UiIcon type="phone" />
                </span>
                <input
                  value={lookupPhone}
                  onChange={(event) => {
                    const normalizedPhone = event.target.value.replace(/\D/g, '').slice(0, 10);
                    setLookupPhone(normalizedPhone);
                    if (normalizedPhone.length < 10) {
                      lastLookupPhoneRef.current = '';
                    }
                    if (normalizedPhone.length === 10) {
                      triggerLookupForPhone(normalizedPhone);
                    }
                  }}
                  placeholder="Enter phone number"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="inline-action-button"
                  onClick={handleLookup}
                  disabled={lookupPhone.replace(/\D/g, '').length < 10 || lookupMutation.isPending}
                >
                  {lookupMutation.isPending ? 'Checking...' : 'Check'}
                </button>
              </div>
            </label>

            <label className="simple-field">
              <span className="simple-field-label">Customer Name</span>
              <div className="input-shell input-shell-static">
                <span className="input-leading-icon">
                  <UiIcon type="user" />
                </span>
                <input
                  value={customerNameValue}
                  onChange={(event) => setManualCustomerName(event.target.value)}
                  placeholder="Required if this phone is new"
                  disabled={!hasLookupPhone || Boolean(lookupData?.parent?.id || lookupData?.customer?.id)}
                />
              </div>
            </label>
          </div>

          {lookupMutation.isError ? (
            !isNewCustomerFlowActive ? (
              <StatusBanner tone="danger" message={lookupMutation.error instanceof Error ? lookupMutation.error.message : 'Lookup failed.'} />
            ) : null
          ) : null}

          {lookupData?.parent ? (
            <section className="simple-guardian-block">
              <div className="children-header">
                <div className="children-heading">
                  <span className="children-heading-icon">
                    <UiIcon type="children" />
                  </span>
                  <h3>Children</h3>
                </div>
                <button type="button" className="children-add-button" onClick={openAddChildModal}>
                  <UiIcon type="plus" />
                  Add Child
                </button>
              </div>

              <div className="children-scroll-area">
                <div className="children-grid">
                  {existingChildren.length ? (
                    existingChildren.map((child) => (
                    <button
                      type="button"
                      key={child.id}
                      className={
                        insideChildIds.has(child.id)
                          ? 'child-card inside'
                          : selectedChildIds.includes(child.id)
                            ? 'child-card active'
                            : 'child-card'
                      }
                      onClick={() => toggleChild(child)}
                      disabled={insideChildIds.has(child.id)}
                    >
                      <div className="child-main">
                        <span className={selectedChildIds.includes(child.id) ? 'child-check active' : 'child-check'}>
                          {selectedChildIds.includes(child.id) ? '✓' : ''}
                        </span>
                        <strong>{child.name}</strong>
                        {insideChildIds.has(child.id) ? <span className="inside-badge">Inside</span> : null}
                      </div>
                      <select
                        value={childDurationById[child.id] || durationPriceId}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateExistingChildDuration(child.id, event.target.value)}
                        disabled={insideChildIds.has(child.id)}
                      >
                          {durationPrices.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.duration_label} - Rs.{item.price.toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </button>
                    ))
                  ) : (
                    <div className="children-empty-state">
                      <div className="children-empty-art" aria-hidden="true">
                        <div className="children-bear-head" />
                        <div className="children-bear-body" />
                        <div className="children-bear-foot left" />
                        <div className="children-bear-foot right" />
                      </div>
                      <p className="muted">No children found for this parent.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          {!lookupData?.parent ? (
            <section className={!hasLookupPhone ? 'simple-list-block locked-section' : 'simple-list-block'}>
              <div className="children-header no-border">
                <div className="children-heading">
                  <span className="children-heading-icon">
                    <UiIcon type="children" />
                  </span>
                  <h3>Children</h3>
                </div>
                <button
                  type="button"
                  className="children-add-button"
                  onClick={openAddChildModal}
                  disabled={!hasLookupPhone}
                >
                  <UiIcon type="plus" />
                  Add Child
                </button>
              </div>
              <p className="muted small">
                {hasLookupPhone
                  ? 'Use the button to add one or more child names before generating passes.'
                  : 'Enter a phone number first to unlock customer name and child entry.'}
              </p>
              {draftChildren.length ? (
                <div className="children-grid compact">
                  {draftChildren.map((child) => (
                    <button
                      type="button"
                      key={child.id}
                      className={selectedDraftChildIds.includes(child.id) ? 'child-card draft active' : 'child-card draft'}
                      onClick={() => toggleDraftChild(child.id)}
                    >
                      <div className="child-main">
                        <span className={selectedDraftChildIds.includes(child.id) ? 'child-check active' : 'child-check'}>
                          {selectedDraftChildIds.includes(child.id) ? '✓' : ''}
                        </span>
                        <span className="new-child-pill">New</span>
                        <strong>{child.name}</strong>
                      </div>
                      <select
                        value={child.durationPriceId || durationPriceId}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateDraftChildDuration(child.id, event.target.value)}
                      >
                        {durationPrices.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.duration_label} - Rs.{item.price.toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <span className="muted">New child</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="children-empty-state">
                  <div className="children-empty-art" aria-hidden="true">
                    <div className="children-bear-head" />
                    <div className="children-bear-body" />
                    <div className="children-bear-foot left" />
                    <div className="children-bear-foot right" />
                  </div>
                </div>
              )}
            </section>
          ) : null}

          <div className="simple-footer">
            <div className="summary-inline summary-ticket">
              <div className="ticket-icon">
                <UiIcon type="ticket" />
              </div>
              <div className="summary-inline-item">
                <span>Passes</span>
                <strong>{Math.max(totalSelectedChildren, 0)}</strong>
              </div>
              <div className="summary-inline-item">
                <span>Total</span>
                <strong>Rs.{totalAmount.toFixed(2)}</strong>
              </div>
            </div>

            <button className="primary-button simple-submit" type="submit" disabled={printMutation.isPending}>
              <UiIcon type="ticket" />
              {printMutation.isPending ? 'Preparing...' : 'Generate Entry Passes'}
            </button>
          </div>

          {resultMessage ? <StatusBanner tone="success" message={resultMessage} /> : null}
        </form>
      </section>

      {isAddChildOpen ? (
        <div className="modal-backdrop" onClick={() => setIsAddChildOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Add Child</h3>
                <p className="muted">Enter how many children you want to add, then fill their names.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setIsAddChildOpen(false)}>
                ×
              </button>
            </div>

            <label>
              Number of Children
              <input
                type="number"
                min="0"
                value={pendingChildCount}
                onChange={(event) => handlePendingChildCountChange(event.target.value)}
              />
            </label>

            {pendingChildNames.length ? (
              <div className="modal-name-list">
                {pendingChildNames.map((name, index) => (
                  <label key={`pending-child-${index}`}>
                    Child {index + 1} Name
                    <input
                      value={name}
                      onChange={(event) => updatePendingChildName(index, event.target.value)}
                      placeholder={`Enter child ${index + 1} name`}
                    />
                  </label>
                ))}
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setIsAddChildOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-button" onClick={savePendingChildren}>
                Save Children
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPaymentOpen ? (
        <div className="modal-backdrop" onClick={() => setIsPaymentOpen(false)}>
          <div className="payment-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Collect Payment</h3>
                <p className="muted">Choose how the customer is paying this bill.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setIsPaymentOpen(false)}>
                ×
              </button>
            </div>

            <div className="payment-modal-top">
              <div className="payment-pass-box">
                  <div className="payment-box-title">Pass Details ({pendingPasses.length})</div>
                <div className="payment-pass-list">
                  {pendingPasses.map((passItem) => (
                    <div key={passItem.childKey} className="payment-pass-row">
                      <span>{passItem.childName || 'Walk-In Pass'}</span>
                      <strong>Rs.{passItem.amount.toFixed(2)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="payment-total-box">
                <span>Total Payable</span>
                <strong>Rs.{paymentTotal.toFixed(2)}</strong>
                <small>Remaining: Rs.{paymentPlan === 'once' ? '0.00' : paymentTotal.toFixed(2)}</small>
              </div>
            </div>

            <div className="payment-section">
              <h4>Payment</h4>
              <div className="payment-plan-grid">
                <button
                  type="button"
                  className={paymentPlan === 'once' ? 'payment-plan active' : 'payment-plan'}
                  onClick={() => setPaymentPlan('once')}
                >
                  <span className={paymentPlan === 'once' ? 'plan-radio active' : 'plan-radio'} />
                  Pay at once
                </button>
                <button
                  type="button"
                  className={paymentPlan === 'parts' ? 'payment-plan active' : 'payment-plan'}
                  onClick={() => setPaymentPlan('parts')}
                >
                  <span className={paymentPlan === 'parts' ? 'plan-radio active' : 'plan-radio'} />
                  Pay in parts
                </button>
              </div>
            </div>

            {paymentPlan === 'once' ? (
              <div className="payment-mode-card">
                <label>
                  Payment Mode
                  <select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="payment-mode-card">
                <p className="muted">
                  Split payment UI can be shown here, but the current backend payment API accepts only one payment mode per payment action.
                </p>
              </div>
            )}

            <div className="modal-actions payment-actions">
              <button type="button" className="secondary-button" onClick={() => setIsPaymentOpen(false)}>
                Back
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={paymentPlan === 'parts' || printMutation.isPending}
                onClick={() => {
                  setIsPaymentOpen(false);
                  setIsTicketOpen(true);
                }}
              >
                Continue to Ticket
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTicketOpen ? (
        <div className="modal-backdrop" onClick={() => setIsTicketOpen(false)}>
          <div className="ticket-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Entry Tickets</h3>
                <p className="muted">Review the selected passes. Actual pass creation will happen only when you click Print Ticket.</p>
              </div>
              <button type="button" className="modal-close" onClick={() => setIsTicketOpen(false)}>
                ×
              </button>
            </div>

            <div className="ticket-grid">
              {pendingPasses.map((passItem, index) => (
                <div key={passItem.childKey} className="ticket-card">
                  <div className="ticket-left">
                    <div className="ticket-brand">JUSTWAVE</div>
                    <div className="ticket-badge">CHILD PASS</div>
                    <div className="ticket-admit">ADMIT ONE</div>
                    <div className="ticket-child-name">{passItem.childName || `CHILD ${index + 1}`}</div>
                    <div className="ticket-meta-grid">
                      <div>
                        <span>TIME / DURATION</span>
                        <strong>{compactDurationLabel(durationPriceMap[passItem.durationPriceId]?.duration_label)}</strong>
                      </div>
                      <div>
                        <span>AMOUNT</span>
                        <strong>Rs.{passItem.amount.toFixed(0)}</strong>
                      </div>
                      <div>
                        <span>GUARDIAN</span>
                        <strong>{passItem.guardianName}</strong>
                      </div>
                      <div>
                        <span>PHONE</span>
                        <strong>{passItem.phone}</strong>
                      </div>
                    </div>
                  </div>
                  <div className="ticket-right">
                    <div className="ticket-qr-frame">
                      <div className="ticket-qr-loading">QR on print</div>
                    </div>
                    <div className="ticket-code">PREVIEW</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions payment-actions">
              <button type="button" className="secondary-button" onClick={() => setIsTicketOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={printMutation.isPending}
                onClick={() => printMutation.mutate()}
              >
                {printMutation.isPending ? 'Preparing Print...' : 'Print Ticket'}
              </button>
            </div>
            {printMutation.isError ? (
              <StatusBanner
                tone="danger"
                message={printMutation.error instanceof Error ? printMutation.error.message : 'Print failed.'}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
