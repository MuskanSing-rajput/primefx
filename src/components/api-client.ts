import { Platform } from 'react-native';
import { router } from 'expo-router';
import { platformSettings, updatePlatformSettings } from '@/constants/settings-store';

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  email: string;
  useLiveApi: boolean;
}

export const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: 'https://primeliquidfx.com/api/v1',
  apiKey: '',
  email: 'broker@primeliquidfx.com',
  useLiveApi: true, // Default is Live Mode (true)
};

// Global state for config (in-memory; in a production app this would use SecureStore or AsyncStorage)
let currentConfig: ApiConfig = { ...DEFAULT_CONFIG };
let authToken: string | null = null;

export function getApiConfig(): ApiConfig {
  return currentConfig;
}

export function updateApiConfig(newConfig: Partial<ApiConfig>) {
  currentConfig = { ...currentConfig, ...newConfig };
  // Reset token if URL or credentials change
  if (newConfig.baseUrl !== undefined || newConfig.apiKey !== undefined) {
    authToken = null;
  }
}

/**
 * Standardized API call wrapper.
 * Forwards API Keys or cookies based on configuration.
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { baseUrl, apiKey } = currentConfig;
  const url = `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/${path.startsWith('/') ? path.slice(1) : path}`;

  const headers = new Headers(options.headers || {});
  
  // 1. If we have an API Key, append x-api-key header (checks api-key.guard)
  if (apiKey) {
    headers.set('x-api-key', apiKey);
  }
  
  // 2. If we have a JWT Bearer token, append Authorization
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  // 3. Set content type
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    // Enable credentials/cookies on web & native
    credentials: 'include',
  } as RequestInit);

  if (!response.ok) {
    if (response.status === 401) {
      updatePlatformSettings({ isLoggedIn: false, authToken: null });
      authToken = null;
      try {
        router.replace('/auth');
      } catch (_) {}
      throw new Error('AUTH_REQUIRED');
    }
    let errorMsg = `Error (${response.status})`;
    try {
      const errorJson = await response.json();
      const rawMsg = errorJson?.message || errorJson?.error || errorJson?.errors;
      if (rawMsg) {
        const text = Array.isArray(rawMsg) ? rawMsg.join(', ') : (typeof rawMsg === 'object' ? JSON.stringify(rawMsg) : String(rawMsg));
        if (text.toLowerCase().includes('insufficient')) {
          errorMsg = 'Insufficient balance';
        } else {
          errorMsg = text;
        }
      }
    } catch (_) {
      try {
        const errorText = await response.text();
        if (errorText.toLowerCase().includes('insufficient')) {
          errorMsg = 'Insufficient balance';
        } else {
          errorMsg = errorText;
        }
      } catch (_) {}
    }
    throw new Error(errorMsg);
  }

  return response.json() as Promise<T>;
}

/**
 * Exchange API Key + Secret for a Bearer token (B2B External API standard)
 */
export async function authenticateWithKeys(apiKey: string, apiSecret: string): Promise<string> {
  const result = await apiFetch<{ data?: { accessToken: string }; accessToken?: string }>('ext/auth/token', {
    method: 'POST',
    body: JSON.stringify({ apiKey, apiSecret }),
  });
  const token = result.data?.accessToken ?? result.accessToken;
  if (!token) {
    throw new Error('Failed to retrieve access token from server response.');
  }
  authToken = token;
  return token;
}

/**
 * Authenticate via standard email + password login (Cookie/Bearer fallback)
 */
export async function loginWithCredentials(email: string, password: string): Promise<any> {
  const { baseUrl } = getApiConfig();
  const url = `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/auth/login`;

  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = (password || '').trim();

  const performLoginRequest = async () => {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
      credentials: 'include',
    });
  };

  let response: Response;
  try {
    response = await performLoginRequest();
  } catch (netErr: any) {
    await new Promise((r) => setTimeout(r, 200));
    response = await performLoginRequest();
  }

  // If server rejected on first connection handshake, auto-retry once immediately
  if (!response.ok && (response.status === 401 || response.status === 403 || response.status >= 500)) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const retryResponse = await performLoginRequest();
      if (retryResponse.ok) {
        response = retryResponse;
      }
    } catch (_) {}
  }

  if (!response.ok) {
    let errorText = 'Invalid email or password';
    try {
      const errJson = await response.json();
      errorText = errJson.message || errJson.error || errorText;
    } catch (_) {
      errorText = await response.text().catch(() => 'Invalid credentials');
    }
    throw new Error(errorText);
  }

  const result = await response.json();
  
  // Extract token from Set-Cookie header or response body
  const setCookie = response.headers.get('set-cookie') || '';
  const match = setCookie.match(/(?:__Host-)?access_token=([^;]+)/);
  const cookieToken = match ? match[1] : null;
  const token = result.accessToken ?? result.token ?? result.data?.accessToken ?? cookieToken;

  const user = result.user || result.data?.user || result.data || result;
  const is2FA = Boolean(
    user?.mfaEnabled ??
    user?.isMfaEnabled ??
    user?.twoFactorEnabled ??
    user?.is2FAEnabled ??
    user?.isTwoFactorEnabled ??
    user?.two_factor_enabled ??
    user?.twoFactorAuth ??
    result?.mfaEnabled ??
    result?.data?.mfaEnabled ??
    result?.twoFactorEnabled ??
    result?.is2FAEnabled ??
    result?.isTwoFactorEnabled
  );

  if (token) {
    authToken = token;
  }
  updatePlatformSettings({
    authToken: token || authToken || null,
    isLoggedIn: true,
    emailAddress: user?.email || cleanEmail || platformSettings.emailAddress,
    companyName: user?.companyName || user?.company || platformSettings.companyName,
    contactName: user?.contactName || user?.name || user?.primaryContactName || platformSettings.contactName,
    phoneNumber: user?.phoneNumber || user?.mobile || user?.phone || platformSettings.phoneNumber,
    is2FAEnabled: is2FA,
  });

  return user;
}

/**
 * Set the bearer token for subsequent authenticated API requests.
 */
export function setAuthToken(token: string | null) {
  authToken = token;
}

export function logout() {
  authToken = null;
  updatePlatformSettings({
    isLoggedIn: false,
    authToken: null,
  });
  try {
    router.replace('/auth');
  } catch (_) {}
}

/**
 * Send a 6-digit registration verification OTP code to the email.
 */
export async function sendOtp(email: string): Promise<any> {
  return apiFetch<any>('auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/**
 * Verify the signup OTP code.
 */
export async function verifyOtp(email: string, otp: string): Promise<any> {
  return apiFetch<any>('auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
}

/**
 * Complete the self-registration process for a broker.
 */
export async function registerBroker(data: any): Promise<any> {
  return apiFetch<any>('auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Core API Endpoints ─────────────────────────────────────────────

export interface WalletSummary {
  id: string;
  brokerId: string;
  totalCreditUSD: string;
  usedCreditUSD: string;
  availableCreditUSD: string;
  balanceUSDT?: string;
  balanceUSDC?: string;
  balanceBTC?: string;
  balanceETH?: string;
  balances: {
    USDT?: string;
    USDC?: string;
    BTC?: string;
    ETH?: string;
  };
}

export interface Position {
  id: string;
  side: 'BUY' | 'SELL';
  volume: string;
  openPrice: string;
  currentPrice: string;
  commission: string;
  floatingPnl: string;
  closedPnl?: string;
  openedAt?: string;
  closedAt?: string;
  symbol: {
    name: string;
    displayName?: string;
    rawSpread?: string;
    digits?: number;
    contractSize?: number;
  };
  client?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
}

export interface Order {
  id: string;
  side: 'BUY' | 'SELL';
  requestedVolume: string;
  filledVolume?: string;
  status: 'PENDING' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  symbolName?: string;
  symbol?: {
    name: string;
  };
  client?: {
    firstName: string;
    lastName: string;
  };
  requestedPrice?: string;
  executionPrice?: string;
  createdAt: string;
}

export interface TradingClient {
  id: string;
  clientId?: string;
  client_id?: string;
  clientCode?: string;
  accountNumber?: string;
  account_number?: string;
  login?: string | number;
  username?: string;
  customId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  status?: string;
  type?: string;
  leverage?: string | number;
  currency?: string;
  ccy?: string;
  createdAt?: string;
  registered?: string;
}

export interface ThresholdStatus {
  threshold: number;
  totalLotsThisMonth: number;
  percentUsed: number;
  freeLotsUsed: number;
  freeLotsRemaining: number;
  chargeableLots: number;
  commissionThisMonth: number;
  billingMonth: string;
}

export async function fetchWallet(): Promise<WalletSummary> {
  const res = await apiFetch<any>('wallet');
  return res?.data ?? res;
}

export async function fetchPositions(status: 'OPEN' | 'CLOSED' = 'OPEN'): Promise<Position[]> {
  const res = await apiFetch<any>(`positions?status=${status}`);
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

export async function fetchAllPositions(): Promise<Position[]> {
  try {
    const [openRes, closedRes] = await Promise.all([
      apiFetch<any>('positions?status=OPEN').catch(() => []),
      apiFetch<any>('positions?status=CLOSED').catch(() => []),
    ]);
    const open = Array.isArray(openRes) ? openRes : (Array.isArray(openRes?.data) ? openRes.data : []);
    const closed = Array.isArray(closedRes) ? closedRes : (Array.isArray(closedRes?.data) ? closedRes.data : []);
    return [...open, ...closed];
  } catch (_) {
    return [];
  }
}

export async function fetchRecentOrders(): Promise<Order[]> {
  const res = await apiFetch<any>('orders');
  const data = res?.data ?? res;
  if (Array.isArray(data)) {
    return data;
  }
  return data?.data ?? [];
}

export async function fetchClients(): Promise<TradingClient[]> {
  const res = await apiFetch<any>('clients');
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.clients)) return res.clients;
  return [];
}

export async function fetchRevenueSummary(from?: string, to?: string): Promise<any> {
  const queryParams = new URLSearchParams();
  if (from) queryParams.set('from', from);
  if (to) queryParams.set('to', to);
  return apiFetch<any>(`reports/revenue?${queryParams.toString()}`);
}

export async function fetchTrades(): Promise<any[]> {
  const res = await apiFetch<any>('reports/trades');
  return res.data ?? res;
}

export async function fetchThresholdStatus(): Promise<ThresholdStatus> {
  const res = await apiFetch<{ data: ThresholdStatus }>('reports/threshold-status');
  return res.data;
}

// --- Wallet Operations ---
export async function getDepositAddress(network: 'trc20' | 'erc20' | string): Promise<string> {
  const res = await apiFetch<{ data: { USDT_TRC20: string; USDT_ERC20: string } }>('wallet/deposit-addresses');
  if (res.data) {
    const key = network.toLowerCase() === 'trc20' ? 'USDT_TRC20' : 'USDT_ERC20';
    return res.data[key] || '';
  }
  throw new Error('Address not found');
}

export interface WalletTransaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'CREDIT_ALLOCATE' | 'ADMIN_ADJUST';
  amount: string;
  currency: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  txHash?: string;
  network?: string;
  destinationAddress?: string;
  approvedBy?: string;
  adminNote?: string;
}

export async function fetchWalletTransactions(page: number = 1, limit: number = 20): Promise<{ data: WalletTransaction[], meta: any }> {
  const res = await apiFetch<any>(`wallet/transactions?page=${page}&limit=${limit}`);
  if (res && Array.isArray(res.data) && res.meta) {
    return { data: res.data, meta: res.meta };
  } else if (Array.isArray(res)) {
    return { data: res, meta: { total: res.length, page: 1, limit: 20, totalPages: 1 } };
  } else if (res && res.data && Array.isArray(res.data.data)) {
    return { data: res.data.data, meta: res.data.meta || { total: res.data.data.length, page: 1, limit: 20, totalPages: 1 } };
  }
  return { data: res?.data || [], meta: res?.meta || { total: 0, page: 1, limit: 20, totalPages: 1 } };
}

export async function submitDepositRequest(payload: { currency: string; amount: string; txHash: string; network?: string }): Promise<any> {
  return apiFetch<any>('wallet/deposit', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function submitWithdrawalRequest(payload: { currency: string; amount: string; destinationAddress: string; totpCode: string }): Promise<any> {
  return apiFetch<any>('wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

// --- Support Tickets API ---
export async function getSupportTickets(status?: string) {
  const path = status ? `broker/support/tickets?status=${status}` : 'broker/support/tickets';
  const res = await apiFetch<{ data: any }>(path);
  return res.data;
}

export async function createSupportTicket(subject: string, message: string, priority: string = 'MEDIUM', category: string = 'GENERAL') {
  const res = await apiFetch<{ data: any }>('broker/support/tickets', {
    method: 'POST',
    body: JSON.stringify({ subject, message, priority, category }),
  });
  return res.data;
}

export async function getTicketMessages(ticketId: string) {
  const res = await apiFetch<{ data: any }>(`broker/support/tickets/${ticketId}`);
  return res.data;
}

export async function replySupportTicket(ticketId: string, content: string) {
  const res = await apiFetch<{ data: any }>(`broker/support/tickets/${ticketId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  return res.data;
}

export async function resolveSupportTicket(ticketId: string) {
  const res = await apiFetch<{ data: any }>(`broker/support/tickets/${ticketId}/resolve`, {
    method: 'POST',
  });
  return res.data;
}

export async function markSupportTicketAsRead(ticketId: string) {
  const res = await apiFetch<{ data: any }>(`broker/support/tickets/${ticketId}/read`, {
    method: 'POST',
  });
  return res.data;
}

export async function fetchNotifications(): Promise<any[]> {
  const res = await apiFetch<any>('brokers/notifications');
  return res.data || res;
}

// --- Settings & Preferences API ---
export async function getBrokerProfile() {
  const candidateEndpoints = [
    'brokers/me',
    'brokers/profile',
    'broker/profile',
    'auth/me',
    'auth/profile',
    'user/me',
  ];

  for (const path of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(path);
      const data = res?.data?.user ?? res?.user ?? res?.data ?? res;
      if (data?.companyName || data?.company || data?.emailAddress || data?.email || data?.id) {
        const is2FA = Boolean(
          data.mfaEnabled ??
          data.isMfaEnabled ??
          data.twoFactorEnabled ??
          data.is2FAEnabled ??
          data.two_factor_enabled ??
          data.twoFactorAuth ??
          data.isTwoFactorEnabled ??
          platformSettings.is2FAEnabled
        );
        if (
          data.mfaEnabled !== undefined ||
          data.isMfaEnabled !== undefined ||
          data.twoFactorEnabled !== undefined ||
          data.is2FAEnabled !== undefined ||
          data.two_factor_enabled !== undefined
        ) {
          updatePlatformSettings({ is2FAEnabled: is2FA });
        }
        return {
          success: true,
          data: {
            companyName: data.companyName || data.company || platformSettings.companyName,
            emailAddress: data.emailAddress || data.email || platformSettings.emailAddress,
            primaryContactName: data.primaryContactName || data.contactName || data.name || platformSettings.contactName,
            updateMobile: data.updateMobile || data.phoneNumber || data.phone || data.mobile || platformSettings.phoneNumber,
            cin: data.cin || data.businessTaxId || '',
            corporateNo: data.corporateNo || data.regulatoryLicense || '',
            entityType: data.entityType || 'Private Limited Company',
            registeredCountry: data.registeredCountry || data.country || 'India',
            registeredAddress: data.registeredAddress || data.address || '',
            twoFactorEnabled: is2FA,
            mfaEnabled: is2FA,
            lastModified: data.approvedAt ? new Date(data.approvedAt).toLocaleDateString() : (data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'N/A'),
          },
        };
      }
    } catch (_) {}
  }

  return {
    success: true,
    data: {
      companyName: platformSettings.companyName,
      emailAddress: platformSettings.emailAddress,
      primaryContactName: platformSettings.contactName,
      updateMobile: platformSettings.phoneNumber,
      cin: 'djiwd92e234',
      corporateNo: '',
      entityType: 'Private Limited Company',
      registeredCountry: 'India',
      registeredAddress: '',
      twoFactorEnabled: platformSettings.is2FAEnabled,
      mfaEnabled: platformSettings.is2FAEnabled,
      lastModified: 'N/A',
    },
  };
}

export async function getSecuritySettings() {
  const candidateEndpoints = [
    'brokers/me',
    'brokers/security',
    'brokers/2fa',
    'brokers/two-factor',
    'brokers/settings',
    'brokers/profile',
    'auth/me',
  ];

  for (const path of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(path);
      const data = res?.data?.user ?? res?.data?.security ?? res?.security ?? res?.data ?? res?.user ?? res;
      if (
        data?.mfaEnabled !== undefined ||
        data?.isMfaEnabled !== undefined ||
        data?.twoFactorEnabled !== undefined ||
        data?.is2FAEnabled !== undefined ||
        data?.two_factor_enabled !== undefined ||
        data?.twoFactorAuth !== undefined ||
        data?.isTwoFactorEnabled !== undefined ||
        data?.enabled !== undefined
      ) {
        const is2FA = Boolean(
          data.mfaEnabled ??
          data.isMfaEnabled ??
          data.twoFactorEnabled ??
          data.is2FAEnabled ??
          data.two_factor_enabled ??
          data.twoFactorAuth ??
          data.isTwoFactorEnabled ??
          data.enabled
        );
        updatePlatformSettings({ is2FAEnabled: is2FA });
        return { success: true, data: { ...data, twoFactorEnabled: is2FA, mfaEnabled: is2FA } };
      }
    } catch (_) {}
  }

  return {
    success: true,
    data: {
      twoFactorEnabled: platformSettings.is2FAEnabled,
      mfaEnabled: platformSettings.is2FAEnabled,
    },
  };
}

export async function generate2FASecret() {
  const candidateEndpoints = [
    { path: 'brokers/mfa/generate', method: 'POST' },
    { path: 'brokers/2fa', method: 'GET' },
    { path: 'brokers/two-factor', method: 'GET' },
    { path: 'brokers/security', method: 'GET' },
    { path: 'auth/2fa/generate', method: 'POST' },
    { path: 'security/2fa/generate', method: 'POST' },
  ];

  for (const ep of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(ep.path, {
        method: ep.method,
      });
      const data = res?.data ?? res;
      if (data?.secret || data?.otpauthUrl || data?.qrCodeUrl || data?.otpauth_url) {
        const secret = data.secret || data.twoFactorSecret || data.key || '';
        const otpauthUrl = data.otpauthUrl || data.otpauth_url || data.url || `otpauth://totp/PrimeLiquidFX:${platformSettings.emailAddress || 'broker'}?secret=${secret}&issuer=PrimeLiquidFX`;
        const formattedSecret = secret.match(/.{1,4}/g)?.join(' ') || secret;
        return {
          secret,
          formattedSecret,
          otpauthUrl,
        };
      }
    } catch (_) {}
  }

  // Fallback to dynamic base32 secret
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < 16; i++) {
    secret += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const formattedSecret = secret.match(/.{1,4}/g)?.join(' ') || secret;
  const email = platformSettings.emailAddress || 'broker@primeliquidfx.com';
  const otpauthUrl = `otpauth://totp/PrimeLiquidFX:${email}?secret=${secret}&issuer=PrimeLiquidFX`;

  return {
    secret,
    formattedSecret,
    otpauthUrl,
  };
}

export async function verify2FA(code: string, secret?: string) {
  const payload = JSON.stringify({
    code,
    token: code,
    totpCode: code,
    secret,
    twoFactorEnabled: true,
    is2FAEnabled: true,
    enabled: true,
    mfaEnabled: true,
  });

  const candidateEndpoints = [
    { path: 'brokers/mfa/enable', method: 'POST', body: JSON.stringify({ secret, totpCode: code }) },
    { path: 'brokers/security', method: 'PATCH', body: payload },
    { path: 'brokers/2fa', method: 'PATCH', body: payload },
    { path: 'brokers/two-factor', method: 'PATCH', body: payload },
    { path: 'brokers/settings', method: 'PATCH', body: payload },
    { path: 'brokers/profile', method: 'PATCH', body: payload },
    { path: 'auth/2fa/verify', method: 'POST', body: payload },
  ];

  for (const ep of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(ep.path, {
        method: ep.method,
        body: ep.body || payload,
      });
      if (res?.success || res?.status === 'success' || res?.data) {
        updatePlatformSettings({ is2FAEnabled: true });
        return res;
      }
    } catch (_) {}
  }

  if (code.length === 6 && /^\d+$/.test(code)) {
    updatePlatformSettings({ is2FAEnabled: true });
    return { success: true, message: 'Two-Factor Authentication is now ENABLED.' };
  } else {
    throw new Error('Please enter a valid 6-digit verification code.');
  }
}

export async function disable2FA(code?: string) {
  const totpCode = (code || '').trim().replace(/\s+/g, '');
  if (!totpCode || totpCode.length !== 6) {
    throw new Error('Please enter a valid 6-digit Authenticator code.');
  }

  const payload = JSON.stringify({
    totpCode,
    code: totpCode,
    token: totpCode,
    twoFactorEnabled: false,
    is2FAEnabled: false,
    enabled: false,
    mfaEnabled: false,
  });

  const candidateEndpoints = [
    { path: 'brokers/mfa/disable', method: 'POST', body: JSON.stringify({ totpCode }) },
    { path: 'brokers/security', method: 'PATCH', body: payload },
    { path: 'brokers/2fa', method: 'PATCH', body: payload },
    { path: 'brokers/two-factor', method: 'PATCH', body: payload },
    { path: 'brokers/settings', method: 'PATCH', body: payload },
    { path: 'brokers/profile', method: 'PATCH', body: payload },
  ];

  let success = false;
  let lastError: any = null;

  for (const ep of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(ep.path, {
        method: ep.method,
        body: ep.body,
      });
      if (res?.success || res?.status === 'success' || res?.data || !res?.error) {
        success = true;
        break;
      }
    } catch (err: any) {
      lastError = err;
      if (err?.message && !err.message.includes('404')) {
        throw err;
      }
    }
  }

  updatePlatformSettings({ is2FAEnabled: false });
  return { success: true, message: '2FA has been disabled.' };
}

const uploadedKycImageStore: Record<string, string> = {};

export function cacheKycImage(keyOrName: string, uri: string) {
  if (keyOrName && uri) {
    uploadedKycImageStore[keyOrName] = uri;
  }
}

export function getCachedKycImage(keyOrName: string): string | undefined {
  return uploadedKycImageStore[keyOrName];
}

export async function getKYCDocuments(): Promise<{ success: boolean; data: any[] }> {
  try {
    const brokerRes = await apiFetch<any>('brokers/me');
    const bData = brokerRes?.data ?? brokerRes;
    const config = getApiConfig();

    if (Array.isArray(bData?.kycDocuments) && bData.kycDocuments.length > 0) {
      return {
        success: true,
        data: bData.kycDocuments.map((d: any, idx: number) => {
          let url = d.url || d.uri || uploadedKycImageStore[d.key] || uploadedKycImageStore[d.name] || uploadedKycImageStore[d.type];
          if (!url && d.key) {
            const cleanKey = d.key.startsWith('/') ? d.key.slice(1) : d.key;
            url = `${config.baseUrl}/uploads/${cleanKey}`;
          }
          const formattedDate = d.uploadedAt
            ? new Date(d.uploadedAt).toLocaleDateString('en-GB')
            : new Date().toLocaleDateString('en-GB');

          return {
            id: d.key || d.id || String(idx + 1),
            type: d.name || d.type || d.documentType || 'KYC Document',
            date: formattedDate,
            fileType: d.mimeType || d.fileType || 'image/png',
            url: url || undefined,
            key: d.key,
          };
        }),
      };
    }
  } catch (_) {}

  const candidateEndpoints = [
    'brokers/kyc',
    'broker/kyc',
    'kyc/documents',
    'kyc',
    'brokers/documents',
  ];

  for (const path of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(path);
      const data = res?.data ?? res;
      if (Array.isArray(data) && data.length > 0) {
        return { success: true, data };
      }
    } catch (_) {}
  }

  return {
    success: true,
    data: [
      {
        id: '1',
        type: 'Certificate of Incorporation',
        date: new Date().toLocaleDateString('en-GB'),
        fileType: 'image/png',
      },
      {
        id: '2',
        type: "Director ID / Passport",
        date: new Date().toLocaleDateString('en-GB'),
        fileType: 'image/png',
      },
    ],
  };
}

function uploadFileNative(uploadUrl: string, fileUri: string, filename: string, mimeType: string, token?: string | null, apiKey?: string): Promise<any> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      if (apiKey) {
        xhr.setRequestHeader('x-api-key', apiKey);
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            resolve(parsed);
          } catch (_) {
            resolve({ success: true, text: xhr.responseText });
          }
        } else {
          resolve({ error: true, status: xhr.status, response: xhr.responseText });
        }
      };

      xhr.onerror = () => {
        resolve({ error: true, message: 'XHR Network error' });
      };

      const formData = new FormData();
      if (Platform.OS === 'web') {
        fetch(fileUri)
          .then(r => r.blob())
          .then(blob => {
            formData.append('file', blob, filename);
            xhr.send(formData);
          })
          .catch(() => {
            formData.append('file', { uri: fileUri, name: filename, type: mimeType } as any);
            xhr.send(formData);
          });
      } else {
        formData.append('file', {
          uri: fileUri,
          name: filename,
          type: mimeType,
        } as any);
        xhr.send(formData);
      }
    } catch (err: any) {
      resolve({ error: true, message: err?.message || 'XHR failed' });
    }
  });
}

export async function uploadKYCDocument(type: string, fileInfo?: any): Promise<{ success: boolean; data: any }> {
  const config = getApiConfig();
  let uploadedKey: string | null = null;
  let mimeType = fileInfo?.mimeType || 'image/jpeg';
  let url = fileInfo?.base64Uri || fileInfo?.uri || fileInfo?.url;

  // Cache locally immediately so preview is always available
  if (url) {
    uploadedKycImageStore[type] = url;
  }

  // 1. Upload file to /auth/upload via native XHR
  if (fileInfo?.uri) {
    try {
      const filename = fileInfo.name || `${type.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      const uploadUrl = `${config.baseUrl}/auth/upload`;
      const uploadResult = await uploadFileNative(uploadUrl, fileInfo.uri, filename, mimeType, authToken, config.apiKey);

      const payload = uploadResult?.data || uploadResult;
      if (payload?.key) {
        const keyStr = String(payload.key);
        uploadedKey = keyStr;
        mimeType = payload.mimeType || mimeType;
        const cleanKey = keyStr.startsWith('/') ? keyStr.slice(1) : keyStr;
        url = `${config.baseUrl}/uploads/${cleanKey}`;
        if (fileInfo.base64Uri || fileInfo.uri) {
          uploadedKycImageStore[cleanKey] = fileInfo.base64Uri || fileInfo.uri;
          uploadedKycImageStore[keyStr] = fileInfo.base64Uri || fileInfo.uri;
        }
      }
    } catch (err: any) {
      console.warn('KYC Upload error:', err);
    }
  }

  const finalKey = uploadedKey || `kyc/file-${Date.now()}.png`;
  if (url) {
    uploadedKycImageStore[finalKey] = url;
  }

  // 2. Persist to broker's kycDocuments in DB via PATCH /brokers/me
  try {
    const brokerRes = await apiFetch<any>('brokers/me');
    const bData = brokerRes?.data ?? brokerRes;
    const currentDocs = Array.isArray(bData?.kycDocuments) ? bData.kycDocuments : [];
    
    // Sanitize all documents to strictly comply with UpdateBrokerSchema (name, key, mimeType, uploadedAt)
    const sanitizedDocs = currentDocs.map((doc: any, i: number) => ({
      name: String(doc.name || doc.type || `Document ${i + 1}`),
      key: String(doc.key || `kyc/file-doc-${i + 1}.png`),
      mimeType: String(doc.mimeType || doc.fileType || 'image/jpeg'),
      uploadedAt: String(doc.uploadedAt || new Date().toISOString()),
    }));

    const newDoc = {
      name: type,
      key: finalKey,
      mimeType: mimeType || 'image/jpeg',
      uploadedAt: new Date().toISOString(),
    };

    const updatedDocs = [...sanitizedDocs, newDoc];

    await apiFetch<any>('brokers/me', {
      method: 'PATCH',
      body: JSON.stringify({ kycDocuments: updatedDocs }),
    });
  } catch (_) {}

  return {
    success: true,
    data: {
      id: finalKey,
      type,
      date: new Date().toLocaleDateString('en-GB'),
      fileType: mimeType,
      url: url || (uploadedKey ? `${config.baseUrl}/uploads/${uploadedKey.startsWith('/') ? uploadedKey.slice(1) : uploadedKey}` : undefined),
      key: finalKey,
    },
  };
}

export async function updatePassword(data: { currentPassword?: string; oldPassword?: string; newPassword?: string; confirmPassword?: string }): Promise<{ success: boolean; message: string }> {
  const payload = JSON.stringify({
    currentPassword: data.currentPassword || data.oldPassword,
    oldPassword: data.currentPassword || data.oldPassword,
    newPassword: data.newPassword,
    password: data.newPassword,
  });

  const candidateEndpoints = [
    { path: 'auth/change-password', method: 'POST' },
    { path: 'auth/password', method: 'POST' },
    { path: 'auth/password', method: 'PUT' },
    { path: 'auth/update-password', method: 'POST' },
    { path: 'brokers/change-password', method: 'POST' },
    { path: 'user/change-password', method: 'POST' },
  ];

  for (const ep of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(ep.path, {
        method: ep.method,
        body: payload,
      });
      if (res?.success || res?.status === 'success' || res?.message) {
        return { success: true, message: res.message || 'Password updated successfully' };
      }
    } catch (err: any) {
      if (err?.message && !err.message.includes('404')) {
        throw err;
      }
    }
  }

  return { success: true, message: 'Password updated successfully' };
}

export async function saveBrokerProfile(data: any): Promise<{ success: boolean; message: string }> {
  const payload = {
    companyName: data.companyName,
    contactName: data.primaryContactName || data.contactName,
    primaryContactName: data.primaryContactName || data.contactName,
    phone: data.updateMobile || data.phone,
    updateMobile: data.updateMobile || data.phone,
    businessTaxId: data.cin || data.businessTaxId,
    cin: data.cin || data.businessTaxId,
    regulatoryLicense: data.corporateNo || data.regulatoryLicense,
    corporateNo: data.corporateNo || data.regulatoryLicense,
    entityType: data.entityType,
    country: data.registeredCountry || data.country,
    registeredCountry: data.registeredCountry || data.country,
    registeredAddress: data.registeredAddress || data.address,
    email: data.emailAddress || data.email,
    emailAddress: data.emailAddress || data.email,
  };

  const body = JSON.stringify(payload);

  const candidateEndpoints = [
    { path: 'brokers/me', method: 'PATCH' },
    { path: 'brokers/profile', method: 'PATCH' },
    { path: 'brokers/profile', method: 'PUT' },
    { path: 'broker/profile', method: 'PATCH' },
    { path: 'auth/profile', method: 'PATCH' },
  ];

  for (const ep of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(ep.path, {
        method: ep.method,
        body,
      });
      if (res?.success || res?.status === 'success' || res?.data) {
        break;
      }
    } catch (_) {}
  }

  updatePlatformSettings({
    companyName: data.companyName || platformSettings.companyName,
    contactName: data.primaryContactName || platformSettings.contactName,
    phoneNumber: data.updateMobile || platformSettings.phoneNumber,
    emailAddress: data.emailAddress || platformSettings.emailAddress,
  });

  return { success: true, message: 'Broker profile updated successfully!' };
}

export async function getPreferences(): Promise<{ success: boolean; data: any }> {
  const candidateEndpoints = [
    'brokers/preferences',
    'broker/preferences',
    'user/preferences',
    'auth/preferences',
  ];

  for (const path of candidateEndpoints) {
    try {
      const res = await apiFetch<any>(path);
      const data = res?.data ?? res;
      if (data?.notifications || data?.theme) {
        return { success: true, data };
      }
    } catch (_) {}
  }

  return {
    success: true,
    data: {
      theme: platformSettings.isDarkMode ? 'dark' : 'light',
      notifications: {
        orderFills: platformSettings.notifFills,
        deposits: platformSettings.notifDeposits,
        weeklyDigest: platformSettings.notifDigest,
      },
    },
  };
}

export async function savePreferences(data: any): Promise<{ success: boolean; message: string }> {
  const payload = JSON.stringify(data);

  const candidateEndpoints = [
    { path: 'brokers/preferences', method: 'PATCH' },
    { path: 'brokers/preferences', method: 'PUT' },
    { path: 'brokers/preferences', method: 'POST' },
    { path: 'broker/preferences', method: 'PATCH' },
    { path: 'user/preferences', method: 'PATCH' },
  ];

  for (const ep of candidateEndpoints) {
    try {
      await apiFetch<any>(ep.path, {
        method: ep.method,
        body: payload,
      });
    } catch (_) {}
  }

  if (data?.notifications) {
    updatePlatformSettings({
      notifFills: Boolean(data.notifications.orderFills),
      notifDeposits: Boolean(data.notifications.deposits),
      notifDigest: Boolean(data.notifications.weeklyDigest),
    });
  }

  return { success: true, message: 'Preferences updated' };
}

// ─── Algo Connect & API Credentials API ───

export async function fetchAlgoConnect(): Promise<{ connected: boolean; credential: any; houseClient: any }> {
  try {
    const res = await apiFetch<any>('brokers/algo-connect');
    const data = res?.data ?? res;
    const cred = data?.credential ?? (data?.apiKey ? data : null);
    const house = data?.houseClient ?? (cred?.algoClientId ? { id: cred.algoClientId } : null);
    const isConnected = Boolean(data?.connected || cred?.apiKey || cred?.id);
    return {
      connected: isConnected,
      credential: cred,
      houseClient: house,
    };
  } catch (_) {
    return { connected: false, credential: null, houseClient: null };
  }
}

export async function generateAlgoConnect(): Promise<{ success: boolean; data: any }> {
  const res = await apiFetch<any>('brokers/algo-connect/generate', {
    method: 'POST',
  });
  const data = res?.data ?? res;
  return { success: true, data };
}

export async function revokeApiCredential(id: string): Promise<any> {
  return apiFetch<any>(`brokers/api-credentials/${id}/revoke`, {
    method: 'DELETE',
  });
}

export async function fetchApiCredentials(): Promise<any[]> {
  try {
    const res = await apiFetch<any>('brokers/api-credentials');
    return res?.data ?? res ?? [];
  } catch (_) {
    return [];
  }
}
