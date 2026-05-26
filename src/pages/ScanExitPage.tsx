import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as entryExitApi from '../api/entryExitApi';
import { TicketDetailsCard } from '../components/TicketDetailsCard';
import { StatusBanner } from '../components/StatusBanner';
import { useAuth } from '../hooks/useAuth';
import { useFlash } from '../hooks/useFlash';
import type { OvertimeSettlementItem, PaymentMode, ScanExitResponse } from '../types/entryExit';

function normalizeSettlements(
  payload:
    | { data?: OvertimeSettlementItem[] | { settlements?: OvertimeSettlementItem[] } }
    | OvertimeSettlementItem[]
    | undefined,
) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.settlements)) return payload.data.settlements;
  return [];
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function formatAmount(value?: number | null) {
  return `Rs.${Number(value ?? 0).toFixed(2)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function buildFallbackSettlement(data?: ScanExitResponse['data'] | null): OvertimeSettlementItem | null {
  if (!data) return null;
  const overtimeCharge = readNumber(data.overtime_charge ?? data.bill_overtime_amount);
  const overtimePaid = Boolean(data.overtime_paid);
  const status = overtimePaid ? 'settled' : overtimeCharge > 0 ? 'due' : 'not_due';

  return {
    ...data,
    settlement_status: status,
    can_settle: !overtimePaid && overtimeCharge > 0,
  };
}

export function ScanExitPage() {
  const { token } = useAuth();
  const { showFlash } = useFlash();
  const [scanToken, setScanToken] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scannedPass, setScannedPass] = useState<ScanExitResponse['data'] | null>(null);
  const [overtimePhone, setOvertimePhone] = useState('');
  const [settlementRow, setSettlementRow] = useState<OvertimeSettlementItem | null>(null);
  const [settlementMode, setSettlementMode] = useState<PaymentMode>('cash');
  const [settlementMessage, setSettlementMessage] = useState('');

  const scanMutation = useMutation({
    mutationFn: () => entryExitApi.scanExit(token!, scanToken),
    onSuccess: (response) => {
      setInfoMessage(response.message);
      showFlash(response.message, response.status === 'overtime_due' ? 'warning' : 'info');
      setSettlementMessage('');
      setOtpRequired(response.status === 'exit_otp_required');
      setOtp('');
      setScannedPass(response.data ?? null);
      setOvertimePhone(response.status === 'overtime_due' ? response.data?.phone || '' : '');
    },
  });

  const overtimeQuery = useQuery({
    queryKey: ['scan-exit-overtime', overtimePhone],
    queryFn: () => entryExitApi.getOvertimeSettlements(token!, overtimePhone),
    enabled: !!token && !!overtimePhone,
  });

  const verifyMutation = useMutation({
    mutationFn: () => entryExitApi.verifyExitOtp(token!, scanToken, otp),
    onSuccess: (response) => {
      const message = response.message || 'Exit verified.';
      setInfoMessage(message);
      showFlash(message, 'success');
      setSettlementMessage('');
      setOtpRequired(false);
      setOtp('');
      setScannedPass(response.data ?? null);
      setOvertimePhone('');
    },
  });

  const settlementMutation = useMutation({
    mutationFn: () => {
      if (!settlementRow) {
        throw new Error('No overtime settlement selected.');
      }

      return entryExitApi.settleOvertime(token!, settlementRow.id, settlementMode);
    },
    onSuccess: async (response) => {
      const message = response.message || 'Overtime settled.';
      setSettlementMessage(message);
      setInfoMessage('Overtime settled. Scan exit again to complete checkout.');
      showFlash(message, 'success');
      setSettlementRow(null);
      if (overtimePhone) {
        await overtimeQuery.refetch();
      }
    },
  });

  const overtimeDue = scanMutation.data?.status === 'overtime_due';
  const settlementRows = useMemo(() => normalizeSettlements(overtimeQuery.data), [overtimeQuery.data]);
  const fallbackSettlement = useMemo(() => buildFallbackSettlement(scannedPass), [scannedPass]);

  const matchedSettlement = useMemo(() => {
    if (!scannedPass?.id) {
      return fallbackSettlement;
    }

    return settlementRows.find((item) => item.id === scannedPass.id) || fallbackSettlement;
  }, [fallbackSettlement, scannedPass, settlementRows]);

  const canSettle = matchedSettlement
    ? matchedSettlement.can_settle ?? (!matchedSettlement.overtime_paid && readNumber(matchedSettlement.overtime_charge) > 0)
    : false;

  return (
    <div className="scan-layout">
      <section className="scan-camera-panel">
        <div className="scan-panel-header">
          <div>
            <h2>Camera Scanner</h2>
            <p className="muted">Use the device camera to scan the QR at the exit counter.</p>
          </div>
        </div>
        <div className="scan-camera-stage">
          <div className={cameraActive ? 'scan-camera-frame active' : 'scan-camera-frame'}>
            <div className="scan-target-box" />
          </div>
          <div className="scan-camera-actions">
            <button className="scan-light-button" type="button" onClick={() => setCameraActive(true)}>
              Open Camera Scanner
            </button>
            <button className="scan-dark-button" type="button" onClick={() => setCameraActive(false)}>
              Stop Camera
            </button>
          </div>
        </div>
      </section>

      <section className="scan-manual-panel">
        <div className="scan-manual-header">
          <div>
            <h2>Manual Token Entry</h2>
            <p className="muted">Use this if the camera is unavailable or the QR is damaged.</p>
          </div>
          <span className="scan-fallback-badge">Fallback</span>
        </div>

        <label>
          Pass Token
          <input value={scanToken} onChange={(event) => setScanToken(event.target.value)} placeholder="Paste or scan token here" />
        </label>

        <button className="scan-action-button exit" onClick={() => scanMutation.mutate()} disabled={!scanToken || scanMutation.isPending}>
          {scanMutation.isPending ? 'Validating Exit...' : 'Validate Exit'}
        </button>

        {scanMutation.isError ? (
          <StatusBanner tone="danger" message={scanMutation.error instanceof Error ? scanMutation.error.message : 'Exit scan failed.'} />
        ) : null}
        {overtimeQuery.isError ? (
          <StatusBanner
            tone="danger"
            message={overtimeQuery.error instanceof Error ? overtimeQuery.error.message : 'Could not load overtime details.'}
          />
        ) : null}
        {infoMessage ? <StatusBanner tone={overtimeDue ? 'warning' : 'info'} message={infoMessage} /> : null}

        <TicketDetailsCard title="Scanned Exit Ticket" ticket={scannedPass} />

        {matchedSettlement ? (
          <div className="scan-overtime-card">
            <div className="scan-overtime-top">
              <div>
                <h3>{matchedSettlement.child_name || matchedSettlement.customer_name || 'Walk-In Child'}</h3>
                <p className="muted">
                  {matchedSettlement.parent_name || matchedSettlement.customer_name || '-'}
                  {matchedSettlement.phone ? ` • ${matchedSettlement.phone}` : ''}
                </p>
              </div>
              <span
                className={
                  matchedSettlement.overtime_paid
                    ? 'overtime-status settled'
                    : canSettle
                      ? 'overtime-status due'
                      : 'overtime-status not-due'
                }
              >
                {matchedSettlement.overtime_paid ? 'Settled' : canSettle ? 'Overtime Due' : 'No Overtime'}
              </span>
            </div>

            <div className="scan-overtime-grid">
              <div>
                <span className="section-kicker">Booked Exit</span>
                <strong>{formatDateTime(matchedSettlement.booked_exit_time)}</strong>
              </div>
              <div>
                <span className="section-kicker">Overtime</span>
                <strong>{readNumber(matchedSettlement.overtime_minutes)} mins</strong>
              </div>
              <div>
                <span className="section-kicker">Amount</span>
                <strong>{formatAmount(matchedSettlement.overtime_charge ?? matchedSettlement.bill_overtime_amount ?? 0)}</strong>
              </div>
            </div>

            <div className="scan-overtime-actions">
              <button
                type="button"
                className={canSettle ? 'primary-button' : 'secondary-button'}
                disabled={!canSettle}
                onClick={() => {
                  if (!canSettle) return;
                  setSettlementMode((matchedSettlement.overtime_payment_mode as PaymentMode) || 'cash');
                  setSettlementRow(matchedSettlement);
                  setSettlementMessage('');
                }}
              >
                Settle
              </button>
            </div>
          </div>
        ) : null}

        {otpRequired ? (
          <div className="scan-otp-box">
            <p className="muted">Guardian phone: {scanMutation.data?.data?.otp_phone || 'masked by backend'}</p>
            <input value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter OTP" />
            <button className="scan-dark-button full" onClick={() => verifyMutation.mutate()} disabled={!otp || verifyMutation.isPending}>
              {verifyMutation.isPending ? 'Verifying...' : 'Verify OTP'}
            </button>
          </div>
        ) : null}
      </section>

      {settlementRow ? (
        <div className="modal-backdrop" onClick={() => setSettlementRow(null)}>
          <div className="modal-card history-settlement-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Collect Overtime</h3>
                <p className="muted">Complete overtime settlement for this child.</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setSettlementRow(null)}>
                Close
              </button>
            </div>

            <div className="form-stack">
              <div className="payment-total-box">
                <span>Total Payable</span>
                <strong>{formatAmount(settlementRow.overtime_charge ?? settlementRow.bill_overtime_amount ?? 0)}</strong>
                <small>Overtime: {settlementRow.overtime_minutes ?? 0} mins</small>
              </div>

              <label>
                Payment Mode
                <select value={settlementMode} onChange={(event) => setSettlementMode(event.target.value as PaymentMode)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </label>

              {settlementMutation.isError ? (
                <StatusBanner
                  tone="danger"
                  message={settlementMutation.error instanceof Error ? settlementMutation.error.message : 'Settlement failed.'}
                />
              ) : null}

              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setSettlementRow(null)}>
                  Back
                </button>
                <button type="button" className="primary-button" onClick={() => settlementMutation.mutate()} disabled={settlementMutation.isPending}>
                  {settlementMutation.isPending ? 'Settling...' : 'Pay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
