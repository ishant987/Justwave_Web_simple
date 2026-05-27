import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import * as entryExitApi from '../api/entryExitApi';
import * as locationApi from '../api/locationApi';
import { ApiError } from '../api/http';
import { useAuth } from '../hooks/useAuth';
import { useFlash } from '../hooks/useFlash';
import { StatusBanner } from '../components/StatusBanner';
import type { ChildRecord, DurationPrice, EntryExitLog, Location, PassCreatePayload, PassPaymentMode, PaymentSplit } from '../types/entryExit';
import { buildPassPrintDocument } from '../utils/passPrint';

const PAYMENT_SPLIT_OPTIONS: { mode: PassPaymentMode; label: string }[] = [
  { mode: 'cash', label: 'Cash' },
  { mode: 'upi', label: 'UPI' },
  { mode: 'card', label: 'Card' },
  { mode: 'bank_transfer', label: 'Bank Transfer' },
  { mode: 'other', label: 'Other' },
];

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

type ListResponsePayload<T> =
  | {
      data?: T[] | { data?: T[]; entry_exit_logs?: T[]; logs?: T[]; passes?: T[]; items?: T[]; results?: T[] };
      entry_exit_logs?: T[];
      logs?: T[];
      passes?: T[];
      items?: T[];
      results?: T[];
    }
  | T[]
  | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeListResponse<T>(payload: ListResponsePayload<T> | unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (typeof payload.id === 'string') return [payload as T];

  for (const key of ['data', 'entry_exit_logs', 'logs', 'passes', 'items', 'results']) {
    const value = payload[key];
    if (Array.isArray(value)) return value as T[];
    if (isRecord(value)) {
      const nested = normalizeListResponse<T>(value);
      if (nested.length) return nested;
    }
  }

  return [];
}

function normalizeText(value?: string | null) {
  return (value || '').trim().toLowerCase();
}

function uniquePassesById(items: EntryExitLog[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function lookupPassesForFallback(token: string, query: string) {
  try {
    return await entryExitApi.lookupPasses(token, query);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}

function compactDurationLabel(label?: string | null): string {
  if (!label) return '40 mins';
  return label.replace(/\s*\([^)]*\)/g, '').trim();
}

function formatAmountCompact(value?: number | null) {
  const amount = Number(value ?? 0);
  return Number.isInteger(amount) ? `Rs.${amount}` : `Rs.${amount.toFixed(2)}`;
}

function formatDurationLabel(minutes?: number | null) {
  const totalMinutes = Number(minutes ?? 0) || 0;
  if (!totalMinutes) return '40m';
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60}h`;
  if (totalMinutes > 60) {
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  return `${totalMinutes}m`;
}

function centsFromAmount(value: number) {
  return Math.round(value * 100);
}

function centsFromInput(value: string) {
  return Math.max(0, Math.round((Number(value) || 0) * 100));
}

function formatAmountFromCents(cents: number) {
  const amount = Math.max(0, cents) / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function buildEvenSplitAmounts(modes: PassPaymentMode[], total: number): Record<PassPaymentMode, string> {
  const next: Record<PassPaymentMode, string> = {
    cash: '0',
    upi: '0',
    card: '0',
    bank_transfer: '0',
    other: '0',
  };
  if (!modes.length) return next;

  const totalCents = centsFromAmount(total);
  const baseCents = Math.floor(totalCents / modes.length);
  let remainderCents = totalCents - baseCents * modes.length;

  modes.forEach((mode) => {
    const amountCents = baseCents + (remainderCents > 0 ? 1 : 0);
    next[mode] = formatAmountFromCents(amountCents);
    remainderCents -= 1;
  });

  return next;
}

function appendGroupedItem<T>(groups: Map<string, T[]>, key: string, item: T) {
  groups.set(key, [...(groups.get(key) ?? []), item]);
}

function sortDurationPrices<T extends { sort_order: number; duration_minutes: number }>(items: T[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order || a.duration_minutes - b.duration_minutes);
}

function buildDefaultChildName(index: number, phone: string) {
  const lastFour = phone.replace(/\D/g, '').slice(-4) || '0000';
  return `${index + 1}Child${lastFour}`;
}

function getDefaultChildSequence(name: string, phone: string) {
  const lastFour = phone.replace(/\D/g, '').slice(-4) || '0000';
  const normalizedName = normalizeText(name);
  const suffix = `child${lastFour}`;
  if (!normalizedName.endsWith(suffix)) return null;

  const sequence = Number(normalizedName.slice(0, -suffix.length));
  return Number.isInteger(sequence) && sequence > 0 ? sequence : null;
}

function buildNextDefaultChildName(usedNames: Set<string>, phone: string) {
  let index = 0;
  let candidate = buildDefaultChildName(index, phone);

  while (usedNames.has(normalizeText(candidate))) {
    index += 1;
    candidate = buildDefaultChildName(index, phone);
  }

  return candidate;
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
  const { showFlash } = useFlash();
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
  const [paymentMode, setPaymentMode] = useState<PassPaymentMode>('cash');
  const [paymentPlan, setPaymentPlan] = useState<'once' | 'parts'>('once');
  const [selectedSplitModes, setSelectedSplitModes] = useState<PassPaymentMode[]>(['cash', 'upi']);
  const [splitAmounts, setSplitAmounts] = useState<Record<PassPaymentMode, string>>({
    cash: '0',
    upi: '0',
    card: '0',
    bank_transfer: '0',
    other: '0',
  });
  const [qrByPassId, setQrByPassId] = useState<Record<string, string>>({});
  const [isEditingCustomerName, setIsEditingCustomerName] = useState(false);
  const [editableCustomerName, setEditableCustomerName] = useState('');
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

  const updateCustomerMutation = useMutation({
    mutationFn: ({ customerId, name, phone }: { customerId: string; name: string; phone: string }) =>
      entryExitApi.updateCustomer(token!, customerId, { name, phone }),
    onSuccess: () => {
      showFlash('Customer name updated successfully.', 'success');
      setIsEditingCustomerName(false);
      const normalizedPhone = lookupPhone.replace(/\D/g, '').trim();
      if (normalizedPhone.length === 10) {
        lookupMutation.mutate(normalizedPhone);
      }
    },
  });

  const printMutation = useMutation({
    mutationFn: async () => {
      const passGenerationStartedAt = Date.now();
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

      const childIdsByDuration = new Map<string, string[]>();
      const childNamesByDuration = new Map<string, string[]>();

      selectedChildIds.forEach((childId) => {
        const childDuration = durationPriceMap[childDurationById[childId]]
          ? childDurationById[childId]
          : effectiveDurationPriceId;
        if (!childDuration) return;
        appendGroupedItem(childIdsByDuration, childDuration, childId);
      });

      draftChildren
        .filter((child) => selectedDraftChildIds.includes(child.id))
        .forEach((child) => {
          const childDuration = durationPriceMap[child.durationPriceId] ? child.durationPriceId : effectiveDurationPriceId;
          if (!childDuration || !child.name.trim()) return;
          appendGroupedItem(childNamesByDuration, childDuration, child.name.trim());
        });

      const basePaymentPayload =
        paymentPlan === 'parts'
          ? ({
              payment_mode: selectedSplitModes[0] || 'cash',
            } satisfies Pick<PassCreatePayload, 'payment_mode'>)
          : ({
              payment_mode: paymentMode,
            } satisfies Pick<PassCreatePayload, 'payment_mode'>);

      const passPayloads: PassCreatePayload[] = [
        ...Array.from(childIdsByDuration.entries()).map(([childDuration, childIds]) => ({
          ...sharedPayload,
          ...baseIdentity,
          ...basePaymentPayload,
          child_ids: childIds,
          duration_price_id: childDuration,
        })),
        ...Array.from(childNamesByDuration.entries()).map(([childDuration, childNames]) => ({
          ...sharedPayload,
          ...baseIdentity,
          ...basePaymentPayload,
          child_names: childNames,
          child_count: childNames.length,
          duration_price_id: childDuration,
        })),
      ];

      const selectedChildNames = new Set(
        [
          ...selectedChildIds
            .map((childId) => existingChildren.find((child) => child.id === childId)?.name)
            .filter((name): name is string => Boolean(name)),
          ...draftChildren
            .filter((child) => selectedDraftChildIds.includes(child.id))
            .map((child) => child.name),
        ].map(normalizeText),
      );

      if (!passPayloads.length) {
        throw new Error('Select or add at least one child before printing tickets.');
      }

      const hasKnownIdentity = Boolean(lookupData?.parent?.id || lookupData?.customer?.id);
      const responses: Awaited<ReturnType<typeof entryExitApi.createPass>>[] = [];

      if (hasKnownIdentity) {
        responses.push(...(await Promise.all(passPayloads.map((payload) => entryExitApi.createPass(token!, payload)))));
      } else {
        let createdCustomerId = '';
        for (const payload of passPayloads) {
          const response = await entryExitApi.createPass(token!, {
            ...payload,
            ...(createdCustomerId ? { customer_id: createdCustomerId, customer_name: undefined, phone: undefined } : baseIdentity),
          });
          responses.push(response);
          createdCustomerId = createdCustomerId || normalizeListResponse<EntryExitLog>(response).find((item) => item.customer_id)?.customer_id || '';
        }
      }

      let createdPasses = responses.flatMap((response) => normalizeListResponse<EntryExitLog>(response));
      if (!createdPasses.length && lookupPhone) {
        const lookupQuery = lookupData?.customer?.id
          ? `customer_id=${encodeURIComponent(lookupData.customer.id)}`
          : `phone=${encodeURIComponent(lookupPhone)}`;
        const [pendingListResponse, allListResponse, lookupResponse] = await Promise.all([
          entryExitApi.listPasses(token!, `status=pending&search=${encodeURIComponent(lookupPhone)}&per_page=50`),
          entryExitApi.listPasses(token!, `search=${encodeURIComponent(lookupPhone)}&per_page=50`),
          lookupPassesForFallback(token!, lookupQuery),
        ]);
        const fallbackPasses = uniquePassesById([
          ...normalizeListResponse<EntryExitLog>(pendingListResponse),
          ...normalizeListResponse<EntryExitLog>(allListResponse),
          ...normalizeListResponse<EntryExitLog>(lookupResponse),
        ]);
        const recentMatchingPasses = fallbackPasses.filter((passItem) => {
          const createdAt = passItem.created_at ? Date.parse(passItem.created_at) : NaN;
          const isRecent = Number.isNaN(createdAt) || createdAt >= passGenerationStartedAt - 5 * 60 * 1000;
          const childName = normalizeText(passItem.child_name);
          const isSelectedChild = !selectedChildNames.size || selectedChildNames.has(childName);
          return isRecent && isSelectedChild;
        });

        createdPasses = (recentMatchingPasses.length ? recentMatchingPasses : fallbackPasses).slice(
          0,
          Math.max(totalSelectedChildren, passPayloads.length),
        );
      }

      if (!createdPasses.length) {
        throw new Error(
          'No entry passes were returned for printing. Checked POST /entry-exit/passes, GET /entry-exit/passes, and GET /entry-exit/passes/lookup.',
        );
      }

      const ids = createdPasses.map((item) => item.id);
      let printablePasses = createdPasses;

      const hasPendingPasses = createdPasses.some((item) => item.payment_status !== 'paid');
      if (ids.length && (hasPendingPasses || paymentPlan === 'parts')) {
        const paidResponse = await entryExitApi.markPassPaid(
          token!,
          paymentPlan === 'parts'
            ? {
                ids,
                payment_mode: 'split',
                payment_splits: paymentSplits,
              }
            : {
                ids,
                payment_mode: paymentMode,
              },
        );
        const paidPasses = normalizeListResponse<EntryExitLog>(paidResponse);
        if (paidPasses.length) {
          printablePasses = paidPasses;
        }
      }

      const qrEntries = await Promise.all(
        printablePasses.map(async (passItem) => {
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

      await printHtmlDocument(
        buildPassPrintDocument(
          printablePasses.map((passItem) => {
            const selectedDurationId = durationPriceMap[childDurationById[passItem.child_id || '']]
              ? childDurationById[passItem.child_id || '']
              : effectiveDurationPriceId;
            const durationLabel = passItem.expected_duration_minutes
              ? formatDurationLabel(passItem.expected_duration_minutes)
              : compactDurationLabel(durationPriceMap[selectedDurationId]?.duration_label);
            const guardianName = passItem.parent_name || passItem.customer_name || lookupData?.parent?.name || '-';

            return {
              amount: formatAmountCompact(passItem.bill_total_amount ?? passItem.pass_price ?? 0),
              childName: passItem.child_name || 'Walk-In Child',
              code: passItem.id.slice(0, 8).toUpperCase(),
              durationLabel,
              guardianName,
              phone: passItem.phone || lookupPhone || '-',
              printCountLabel: 'Printed 1x',
              qrSrc: nextQrByPassId[passItem.id] || '',
            };
          }),
          'Entry Tickets',
        ),
      );

      return {
        createdPasses: printablePasses,
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

  const locations = normalizeListResponse<Location>(locationsQuery.data);
  const durationPrices = useMemo(
    () => sortDurationPrices(normalizeListResponse<DurationPrice>(durationPricesQuery.data).filter((item) => item.is_active !== false)),
    [durationPricesQuery.data],
  );
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
  const defaultDurationPriceId = durationPrices[0]?.id || '';
  const effectiveDurationPriceId = durationPriceMap[durationPriceId] ? durationPriceId : defaultDurationPriceId;
  const totalSelectedChildren = selectedChildIds.length + selectedDraftChildIds.length;
  const totalAmount = useMemo(() => {
    const existingTotal = selectedChildIds.reduce((sum, childId) => {
      const priceId = durationPriceMap[childDurationById[childId]] ? childDurationById[childId] : effectiveDurationPriceId;
      return sum + (durationPriceMap[priceId]?.price ?? 0);
    }, 0);
    const draftTotal = draftChildren.reduce(
      (sum, child) =>
        selectedDraftChildIds.includes(child.id)
          ? sum + (durationPriceMap[durationPriceMap[child.durationPriceId] ? child.durationPriceId : effectiveDurationPriceId]?.price ?? 0)
          : sum,
      0,
    );
    return existingTotal + draftTotal;
  }, [childDurationById, draftChildren, durationPriceMap, effectiveDurationPriceId, selectedChildIds, selectedDraftChildIds]);
  const paymentTotal = useMemo(
    () =>
      selectedChildIds.reduce((sum, childId) => {
        const priceId = durationPriceMap[childDurationById[childId]] ? childDurationById[childId] : effectiveDurationPriceId;
        return sum + (durationPriceMap[priceId]?.price ?? 0);
      }, 0) +
      draftChildren.reduce(
        (sum, child) =>
          selectedDraftChildIds.includes(child.id)
            ? sum + (durationPriceMap[durationPriceMap[child.durationPriceId] ? child.durationPriceId : effectiveDurationPriceId]?.price ?? 0)
            : sum,
        0,
      ),
    [childDurationById, draftChildren, durationPriceMap, effectiveDurationPriceId, selectedChildIds, selectedDraftChildIds],
  );
  const paymentSplits = useMemo<PaymentSplit[]>(
    () =>
      selectedSplitModes.map((mode) => ({
        mode,
        amount: centsFromInput(splitAmounts[mode]) / 100,
      })),
    [selectedSplitModes, splitAmounts],
  );
  const splitTotalCents = paymentSplits.reduce((sum, item) => sum + centsFromAmount(item.amount), 0);
  const paymentTotalCents = centsFromAmount(paymentTotal);
  const splitDifferenceCents = paymentTotalCents - splitTotalCents;
  const isSplitPaymentValid =
    selectedSplitModes.length > 0 &&
    splitDifferenceCents === 0 &&
    paymentSplits.every((item) => item.amount > 0);
  const hasLookupPhone = lookupPhone.trim().length > 0;
  const isNewCustomerFlowActive = manualCustomerName.trim().length > 0 || draftChildren.length > 0;
  const pendingPasses = useMemo<PendingPassPreview[]>(
    () => [
      ...existingChildren
        .filter((child) => selectedChildIds.includes(child.id))
        .map((child) => {
          const selectedDurationPriceId = durationPriceMap[childDurationById[child.id]]
            ? childDurationById[child.id]
            : effectiveDurationPriceId;
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
        .map((child) => {
          const selectedDurationPriceId = durationPriceMap[child.durationPriceId] ? child.durationPriceId : effectiveDurationPriceId;
          return {
            childKey: child.id,
            childName: child.name,
            durationPriceId: selectedDurationPriceId,
            amount: durationPriceMap[selectedDurationPriceId]?.price ?? 0,
            guardianName: lookupData?.parent?.name || lookupData?.customer?.name || manualCustomerName || '-',
            phone: lookupPhone,
            isDraft: true,
          };
        }),
    ],
    [
      childDurationById,
      draftChildren,
      durationPriceMap,
      effectiveDurationPriceId,
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
    if (defaultDurationPriceId && !durationPriceMap[durationPriceId]) {
      setDurationPriceId(defaultDurationPriceId);
    }
  }, [defaultDurationPriceId, durationPriceId, durationPriceMap]);

  useEffect(() => {
    if (!effectiveDurationPriceId) return;
    setChildDurationById((current) => {
      const next = { ...current };
      existingChildren.forEach((child) => {
        if (!durationPriceMap[next[child.id]]) {
          next[child.id] = effectiveDurationPriceId;
        }
      });
      return next;
    });
    setDraftChildren((current) =>
      current.map((child) => ({
        ...child,
        durationPriceId: durationPriceMap[child.durationPriceId] ? child.durationPriceId : effectiveDurationPriceId,
      })),
    );
  }, [durationPriceMap, effectiveDurationPriceId, existingChildren]);

  useEffect(() => {
    setSelectedChildIds((current) => current.filter((id) => !insideChildIds.has(id)));
  }, [insideChildIds]);

  useEffect(() => {
    setEditableCustomerName(lookupData?.customer?.name || lookupData?.parent?.name || '');
    setIsEditingCustomerName(false);
  }, [lookupData?.customer?.id, lookupData?.customer?.name, lookupData?.parent?.id, lookupData?.parent?.name]);

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
    lookupMutation.reset();
    lastLookupPhoneRef.current = normalizedPhone;
    lookupMutation.mutate(normalizedPhone);
  }

  function triggerLookupForPhone(normalizedPhone: string) {
    if (normalizedPhone.length < 10) return;
    if (normalizedPhone === lastLookupPhoneRef.current) return;
    setSelectedChildIds([]);
    setDraftChildren([]);
    setResultMessage('');
    lookupMutation.reset();
    lastLookupPhoneRef.current = normalizedPhone;
    lookupMutation.mutate(normalizedPhone);
  }

  function startEditingCustomerName() {
    setEditableCustomerName(customerNameValue);
    setIsEditingCustomerName(true);
  }

  function cancelEditingCustomerName() {
    setEditableCustomerName(customerNameValue);
    setIsEditingCustomerName(false);
  }

  function saveCustomerName() {
    const customerId = lookupData?.customer?.id;
    const nextName = editableCustomerName.trim();
    const phone = (lookupData?.customer?.phone || lookupData?.parent?.phone || lookupPhone).replace(/\D/g, '').trim();

    if (!customerId || !nextName || !phone) {
      return;
    }

    updateCustomerMutation.mutate({
      customerId,
      name: nextName,
      phone,
    });
  }

  function openAddChildModal() {
    if (!hasLookupPhone) {
      return;
    }
    setPendingChildCount('1');
    setPendingChildNames(['']);
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
    const existingSelectedIds = new Set(selectedChildIds);
    const usedNames = new Set([...existingChildren, ...draftChildren].map((child) => normalizeText(child.name)).filter(Boolean));
    const reusableDefaultChildren = existingChildren
      .filter(
        (child) =>
          !insideChildIds.has(child.id) &&
          !existingSelectedIds.has(child.id) &&
          getDefaultChildSequence(child.name, lookupPhone) !== null,
      )
      .sort((firstChild, secondChild) => {
        const firstSequence = getDefaultChildSequence(firstChild.name, lookupPhone) ?? Number.MAX_SAFE_INTEGER;
        const secondSequence = getDefaultChildSequence(secondChild.name, lookupPhone) ?? Number.MAX_SAFE_INTEGER;
        return firstSequence - secondSequence || firstChild.name.localeCompare(secondChild.name);
      });
    const nextSelectedChildIds: string[] = [];
    const nextDraftChildren: DraftChild[] = [];

    pendingChildNames.forEach((item, index) => {
      const trimmedName = item.trim();
      const reusableChild = trimmedName
        ? existingChildren.find(
            (child) =>
              normalizeText(child.name) === normalizeText(trimmedName) &&
              !insideChildIds.has(child.id) &&
              !existingSelectedIds.has(child.id) &&
              !nextSelectedChildIds.includes(child.id),
          )
        : reusableDefaultChildren.find((child) => !nextSelectedChildIds.includes(child.id));

      if (reusableChild) {
        nextSelectedChildIds.push(reusableChild.id);
        return;
      }

      const fallbackName = trimmedName && !usedNames.has(normalizeText(trimmedName))
        ? trimmedName
        : buildNextDefaultChildName(usedNames, lookupPhone);
      usedNames.add(normalizeText(fallbackName));
      nextDraftChildren.push({
        id: `draft-${Date.now()}-${draftChildren.length + index}-${fallbackName}`,
        name: fallbackName,
        durationPriceId: effectiveDurationPriceId,
      });
    });

    setSelectedChildIds((current) => [...current, ...nextSelectedChildIds.filter((childId) => !current.includes(childId))]);
    setDraftChildren((current) => [...current, ...nextDraftChildren]);
    setSelectedDraftChildIds((current) => [...current, ...nextDraftChildren.map((child) => child.id)]);
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

  function selectPaymentPlan(nextPlan: 'once' | 'parts') {
    setPaymentPlan(nextPlan);
    if (nextPlan === 'parts') {
      setSplitAmounts(buildEvenSplitAmounts(selectedSplitModes, paymentTotal));
    }
  }

  function toggleSplitMode(mode: PassPaymentMode) {
    setSelectedSplitModes((current) => {
      const nextModes = current.includes(mode)
        ? current.length > 1
          ? current.filter((item) => item !== mode)
          : current
        : [...current, mode];
      setSplitAmounts(buildEvenSplitAmounts(nextModes, paymentTotal));
      return nextModes;
    });
  }

  function updateSplitAmount(mode: PassPaymentMode, value: string) {
    const normalizedValue = value.replace(/[^\d.]/g, '');
    setSplitAmounts((current) => {
      const next = { ...current, [mode]: normalizedValue };
      const adjustableMode = [...selectedSplitModes].reverse().find((item) => item !== mode);

      if (adjustableMode) {
        const usedCents = selectedSplitModes.reduce((sum, item) => {
          if (item === adjustableMode) return sum;
          const amount = item === mode ? normalizedValue : next[item];
          return sum + centsFromInput(amount);
        }, 0);
        next[adjustableMode] = formatAmountFromCents(paymentTotalCents - usedCents);
      }

      return next;
    });
  }

  function handleCreatePass(event: FormEvent) {
    event.preventDefault();

    if (!pendingPasses.length) {
      showFlash('Select or add at least one child before generating passes.', 'warning');
      return;
    }

    setResultMessage('');
    setPaymentMode('cash');
    setPaymentPlan('once');
    setSelectedSplitModes(['cash', 'upi']);
    setSplitAmounts(buildEvenSplitAmounts(['cash', 'upi'], paymentTotal));
    setIsPaymentOpen(true);
  }

  const existingCustomerId = lookupData?.customer?.id;
  const customerNameValue = lookupData?.customer?.name || lookupData?.parent?.name || manualCustomerName;
  const customerNameInputValue = isEditingCustomerName ? editableCustomerName : customerNameValue;
  const hasChildrenToShow = existingChildren.length > 0 || draftChildren.length > 0;
  const canSaveCustomerName =
    Boolean(existingCustomerId) &&
    editableCustomerName.trim().length > 0 &&
    editableCustomerName.trim() !== customerNameValue.trim() &&
    !updateCustomerMutation.isPending;

  return (
    <div className="simple-page">
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
                      lookupMutation.reset();
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
              <div className="input-shell input-shell-static customer-name-shell">
                <span className="input-leading-icon">
                  <UiIcon type="user" />
                </span>
                <input
                  value={customerNameInputValue}
                  onChange={(event) => {
                    if (isEditingCustomerName) {
                      setEditableCustomerName(event.target.value);
                      return;
                    }
                    setManualCustomerName(event.target.value);
                  }}
                  placeholder="Required if this phone is new"
                  disabled={!hasLookupPhone || (Boolean(existingCustomerId) && !isEditingCustomerName)}
                />
                {existingCustomerId ? (
                  <div className="customer-name-actions">
                    {isEditingCustomerName ? (
                      <>
                        <button type="button" className="inline-action-button compact" onClick={saveCustomerName} disabled={!canSaveCustomerName}>
                          {updateCustomerMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="inline-action-button compact muted-action"
                          onClick={cancelEditingCustomerName}
                          disabled={updateCustomerMutation.isPending}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" className="inline-action-button compact" onClick={startEditingCustomerName}>
                        Edit
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </label>
          </div>

          {lookupMutation.isError ? (
            !isNewCustomerFlowActive ? (
              <StatusBanner tone="danger" message={lookupMutation.error instanceof Error ? lookupMutation.error.message : 'Lookup failed.'} />
            ) : null
          ) : null}

          {updateCustomerMutation.isError ? (
            <StatusBanner
              tone="danger"
              message={updateCustomerMutation.error instanceof Error ? updateCustomerMutation.error.message : 'Customer name update failed.'}
            />
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
                  {hasChildrenToShow ? (
                    <>
                      {existingChildren.map((child) => (
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
                            value={durationPriceMap[childDurationById[child.id]] ? childDurationById[child.id] : effectiveDurationPriceId}
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
                      ))}

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
                            value={durationPriceMap[child.durationPriceId] ? child.durationPriceId : effectiveDurationPriceId}
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
                    </>
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
                        value={durationPriceMap[child.durationPriceId] ? child.durationPriceId : effectiveDurationPriceId}
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
                onFocus={(event) => event.currentTarget.select()}
                onMouseUp={(event) => event.preventDefault()}
                onChange={(event) => handlePendingChildCountChange(event.target.value)}
              />
            </label>

            {pendingChildNames.length ? (
              <div className="modal-name-list">
                {pendingChildNames.map((name, index) => (
                  <label key={`pending-child-${index}`}>
                    Child {draftChildren.length + index + 1} Name
                    <input
                      value={name}
                      onChange={(event) => updatePendingChildName(index, event.target.value)}
                      placeholder={`Enter child ${draftChildren.length + index + 1} name`}
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
                <small>
                  Remaining: Rs.
                  {paymentPlan === 'once' ? '0.00' : Math.max(0, splitDifferenceCents / 100).toFixed(2)}
                </small>
              </div>
            </div>

            <div className="payment-section">
              <h4>Payment</h4>
              <div className="payment-plan-grid">
                <button
                  type="button"
                  className={paymentPlan === 'once' ? 'payment-plan active' : 'payment-plan'}
                  onClick={() => selectPaymentPlan('once')}
                >
                  <span className={paymentPlan === 'once' ? 'plan-radio active' : 'plan-radio'} />
                  Pay at once
                </button>
                <button
                  type="button"
                  className={paymentPlan === 'parts' ? 'payment-plan active' : 'payment-plan'}
                  onClick={() => selectPaymentPlan('parts')}
                >
                  <span className={paymentPlan === 'parts' ? 'plan-radio active' : 'plan-radio'} />
                  Pay in parts
                </button>
              </div>
            </div>

            {paymentPlan === 'once' ? (
              <div className="payment-section">
                <h4>Payment Mode</h4>
                <div className="payment-mode-grid">
                  {PAYMENT_SPLIT_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.mode}
                      className={paymentMode === option.mode ? 'payment-mode-tile active' : 'payment-mode-tile'}
                      onClick={() => setPaymentMode(option.mode)}
                    >
                      <span className={paymentMode === option.mode ? 'payment-check active' : 'payment-check'}>
                        {paymentMode === option.mode ? '✓' : ''}
                      </span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="payment-section">
                <h4>Payment Split</h4>
                <div className="payment-mode-grid split">
                  {PAYMENT_SPLIT_OPTIONS.map((option) => {
                    const isSelected = selectedSplitModes.includes(option.mode);
                    return (
                      <button
                        type="button"
                        key={option.mode}
                        className={isSelected ? 'payment-mode-tile active' : 'payment-mode-tile'}
                        onClick={() => toggleSplitMode(option.mode)}
                      >
                        <span className={isSelected ? 'payment-check active' : 'payment-check'}>{isSelected ? '✓' : ''}</span>
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="payment-split-amount-grid">
                  {PAYMENT_SPLIT_OPTIONS.filter((option) => selectedSplitModes.includes(option.mode)).map((option) => (
                    <label key={option.mode} className="payment-split-amount">
                      <span>{option.label}</span>
                      <input
                        value={splitAmounts[option.mode]}
                        onChange={(event) => updateSplitAmount(option.mode, event.target.value)}
                        inputMode="decimal"
                      />
                    </label>
                  ))}
                </div>

                <p className={isSplitPaymentValid ? 'payment-split-note' : 'payment-split-note warning'}>
                  Amounts auto-adjust to match the total.
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
                disabled={(paymentPlan === 'parts' && !isSplitPaymentValid) || printMutation.isPending}
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
