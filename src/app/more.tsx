import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/app-icon';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as ExpoClipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop as SvgStop, Circle, Line } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { platformSettings, subscribeSettings, updatePlatformSettings } from '@/constants/settings-store';
import * as api from '@/components/api-client';
import Pagination from '@/components/pagination';

function GlassyCard({ children, style, isDark }: { children: React.ReactNode; style?: any; isDark: boolean }) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? '#111217' : '#FFFFFF',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
          borderWidth: 1,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.3 : 0.04,
          shadowRadius: 8,
          elevation: isDark ? 2 : 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// Build dynamic cumulative PnL series from positions based on period (7d, 30d, 90d)
function buildPnlSeries(positions: any[], period: '7d' | '30d' | '90d', fallbackTotal: number = 239672.39) {
  const numDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const dateObjs = Array.from({ length: numDays }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (numDays - 1 - i));
    return d;
  });

  const days = dateObjs.map(d => ({
    dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    timestamp: d.getTime(),
  }));

  const closedPositions = (positions || [])
    .filter((p: any) => p.status === 'CLOSED' && p.closedAt)
    .map((p: any) => ({
      closedAt: p.closedAt ? new Date(p.closedAt) : new Date(),
      closedPnl: Number(p.closedPnl ?? p.floatingPnl ?? 0),
    }))
    .sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());

  if (closedPositions.length === 0) {
    return days.map(day => ({
      name: day.dateStr,
      pnl: fallbackTotal || 239672.39,
    }));
  }

  const firstDate = dateObjs[0];
  const startPeriodTimestamp = firstDate ? firstDate.getTime() : 0;
  const pnlBeforePeriod = closedPositions
    .filter(p => p.closedAt.getTime() < startPeriodTimestamp)
    .reduce((sum, p) => sum + p.closedPnl, 0);

  let cumulative = pnlBeforePeriod;

  return days.map(day => {
    const dayEndTimestamp = day.timestamp + 24 * 60 * 60 * 1000;
    const dayPnl = closedPositions
      .filter(p => p.closedAt.getTime() >= day.timestamp && p.closedAt.getTime() < dayEndTimestamp)
      .reduce((sum, p) => sum + p.closedPnl, 0);

    cumulative += dayPnl;
    return {
      name: day.dateStr,
      pnl: parseFloat(cumulative.toFixed(2)),
    };
  });
}

function PnlTrendReportChart({
  pnlSeries,
  period,
  closedPnl,
  isDark,
}: {
  pnlSeries: { name: string; pnl: number }[];
  period: string;
  closedPnl: number;
  isDark: boolean;
}) {
  const [chartWidth, setChartWidth] = useState(320);
  const chartHeight = 140;
  const paddingLeft = 52;
  const paddingRight = 18;
  const paddingTop = 12;
  const paddingBottom = 24;

  const width = Math.max(chartWidth, 200);
  const innerWidth = Math.max(width - paddingLeft - paddingRight, 100);
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const values = pnlSeries.map((d) => d.pnl);
  const rawMin = values.length > 0 ? Math.min(...values) : closedPnl;
  const rawMax = values.length > 0 ? Math.max(...values) : closedPnl;
  const minVal = rawMin === rawMax ? rawMin * 0.98 : rawMin;
  const maxVal = rawMin === rawMax ? (rawMax > 0 ? rawMax * 1.02 : 100) : rawMax;
  const valRange = Math.max(maxVal - minVal, 1);

  const points = pnlSeries.map((d, i) => {
    const x = paddingLeft + (i / Math.max(pnlSeries.length - 1, 1)) * innerWidth;
    const y = paddingTop + innerHeight - ((d.pnl - minVal) / valRange) * innerHeight;
    return { x, y, ...d };
  });

  const linePath = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, '');

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + innerHeight} L ${points[0].x} ${paddingTop + innerHeight} Z`
    : '';

  const formatPnlAxis = (v: number) => {
    if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(0)}k`;
    return `$${Math.round(v)}`;
  };

  const isPositive = closedPnl >= 0;

  return (
    <GlassyCard isDark={isDark} style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#ffffff' : '#0f172a' }}>
          P&L Trend ({period})
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: isPositive ? '#10b981' : '#ef4444' }}>
          {isPositive ? '+' : ''}${Math.abs(closedPnl).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </Text>
      </View>

      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w > 50) setChartWidth(w);
        }}
        style={{ height: chartHeight, position: 'relative' }}
      >
        {/* Y Axis Labels (Left) */}
        <View style={{ position: 'absolute', left: 0, top: paddingTop - 6, height: innerHeight + 12, justifyContent: 'space-between', width: paddingLeft - 8, alignItems: 'flex-end', zIndex: 2 }} pointerEvents="none">
          <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#64748b' : '#94a3b8' }}>{formatPnlAxis(maxVal)}</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#64748b' : '#94a3b8' }}>{formatPnlAxis((maxVal + minVal) / 2)}</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#64748b' : '#94a3b8' }}>{formatPnlAxis(minVal)}</Text>
        </View>

        {/* SVG Drawing Canvas */}
        <Svg width={width} height={chartHeight}>
          <Defs>
            <SvgLinearGradient id="pnlTrendGlow" x1="0" y1="0" x2="0" y2="1">
              <SvgStop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <SvgStop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
            </SvgLinearGradient>
          </Defs>

          {/* Grid lines */}
          {[0, 0.5, 1].map((ratio, idx) => {
            const y = paddingTop + innerHeight * ratio;
            return (
              <Line
                key={idx}
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                strokeDasharray="4 4"
              />
            );
          })}

          {/* Area & Line */}
          {areaPath ? <Path d={areaPath} fill="url(#pnlTrendGlow)" /> : null}
          {linePath ? <Path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} /> : null}

          {/* Dots */}
          {points.map((pt, i) => (
            <Circle key={i} cx={pt.x} cy={pt.y} r={3} fill="#3b82f6" stroke={isDark ? '#09090b' : '#ffffff'} strokeWidth={1} />
          ))}
        </Svg>

        {/* X Axis Date Labels (Bottom) */}
        <View style={{ position: 'absolute', left: paddingLeft, right: paddingRight, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', zIndex: 2 }} pointerEvents="none">
          {points.map((pt, i) => {
            const shouldShow =
              points.length <= 7 ||
              i === 0 ||
              i === points.length - 1 ||
              i % Math.ceil(points.length / 5) === 0;
            if (!shouldShow) return null;
            return (
              <Text key={`lbl-${i}`} style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#64748b' : '#94a3b8' }}>
                {pt.name}
              </Text>
            );
          })}
        </View>
      </View>
    </GlassyCard>
  );
}

function VolumeBySymbolReportChart({
  symbolData,
  isDark,
}: {
  symbolData: { symbol: string; filled: number; rejected: number; volume: number }[];
  isDark: boolean;
}) {
  const maxVal = Math.max(...symbolData.map((d) => Math.max(d.filled, d.rejected, 1)), 4);
  const instrumentsCount = symbolData.length;

  return (
    <GlassyCard isDark={isDark} style={{ padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#ffffff' : '#0f172a' }}>
          Volume by Symbol
        </Text>
        <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? '#94a3b8' : '#64748b' }}>
            {instrumentsCount} INSTRUMENTS
          </Text>
        </View>
      </View>

      <View style={{ height: 140, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 24, paddingTop: 10 }}>
        {/* Left Y Axis scale */}
        <View style={{ height: 106, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 8, width: 24 }}>
          <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#64748b' : '#94a3b8' }}>{maxVal}</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#64748b' : '#94a3b8' }}>{Math.round(maxVal / 2)}</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: isDark ? '#64748b' : '#94a3b8' }}>0</Text>
        </View>

        {/* Bars */}
        <View style={{ flex: 1, height: 106, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
          {symbolData.map((item) => {
            const filledHeight = Math.max((item.filled / maxVal) * 100, item.filled > 0 ? 8 : 0);
            const rejectedHeight = item.rejected > 0 ? Math.max((item.rejected / maxVal) * 100, 8) : 0;

            return (
              <View key={item.symbol} style={{ alignItems: 'center', width: 60 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 100 }}>
                  {/* Filled Bar */}
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: 18,
                        height: filledHeight,
                        backgroundColor: '#3b82f6',
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                      }}
                    />
                  </View>

                  {/* Rejected Bar */}
                  {rejectedHeight > 0 ? (
                    <View style={{ alignItems: 'center' }}>
                      <View
                        style={{
                          width: 18,
                          height: rejectedHeight,
                          backgroundColor: '#ef4444',
                          borderTopLeftRadius: 4,
                          borderTopRightRadius: 4,
                        }}
                      />
                    </View>
                  ) : null}
                </View>

                {/* X Axis Symbol Label */}
                <Text style={{ fontSize: 9, fontWeight: '700', color: isDark ? '#cbd5e1' : '#475569', marginTop: 6, position: 'absolute', bottom: -20 }} numberOfLines={1}>
                  {item.symbol}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#3b82f6' }} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? '#94a3b8' : '#64748b' }}>Filled</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#ef4444' }} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? '#94a3b8' : '#64748b' }}>Rejected</Text>
        </View>
      </View>
    </GlassyCard>
  );
}

// REST Endpoints data
const ENDPOINTS_DATA = [
  {
    method: 'GET',
    path: '/ext/ping',
    desc: 'Verify API key validity and retrieve broker status, permissions, and wallet summary.',
    curl: 'curl https://primeliquidfx.com/api/v1/ext/ping \\\n  -H "x-api-key: lp_live_YOUR_API_KEY"',
    response: '{\n  "success": true,\n  "data": {\n    "message": "API key is valid",\n    "broker": {\n      "id": "d1ed8765-...",\n      "name": "Alpha Capital Ltd",\n      "permissions": ["trade", "read"]\n    },\n    "wallet": {\n      "availableCreditUSD": "37500.00",\n      "totalCreditUSD": "50000.00",\n      "usedCreditUSD": "12500.00"\n    }\n  },\n  "timestamp": "2026-08-24T09:00:00.000Z"\n}'
  },
  {
    method: 'GET',
    path: '/ext/symbols',
    desc: 'List all active trading instruments available to this broker with spread, contract size, and session info.',
    curl: 'curl https://primeliquidfx.com/api/v1/ext/symbols \\\n  -H "x-api-key: lp_live_YOUR_API_KEY"',
    response: '{\n  "success": true,\n  "symbols": [\n    {\n      "symbol": "XAUUSD",\n      "digits": 2,\n      "contractSize": 100,\n      "spread": 1.2\n    },\n    {\n      "symbol": "XAGUSD",\n      "digits": 3,\n      "contractSize": 5000,\n      "spread": 2.1\n    }\n  ]\n}'
  },
  {
    method: 'POST',
    path: '/ext/clients',
    desc: 'Register a new client trading account under this broker. Map externalClientId to your CRM/MT5 account ID.',
    curl: 'curl -X POST https://primeliquidfx.com/api/v1/ext/clients \\\n  -H "x-api-key: lp_live_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "externalClientId": "AB00K_MASTER",\n    "firstName": "testing",\n    "lastName": "Master Account",\n    "type": "standard"\n  }\'',
    response: '{\n  "success": true,\n  "clientId": "cli_98234857",\n  "status": "active"\n}'
  },
  {
    method: 'GET',
    path: '/ext/clients',
    desc: 'Paginated list of all clients registered under this broker account.',
    curl: 'curl https://primeliquidfx.com/api/v1/ext/clients \\\n  -H "x-api-key: lp_live_YOUR_API_KEY"',
    response: '{\n  "success": true,\n  "clients": [\n    {\n      "clientId": "cli_98234857",\n      "externalClientId": "AB00K_MASTER",\n      "status": "active"\n    }\n  ]\n}'
  },
  {
    method: 'POST',
    path: '/ext/orders',
    desc: 'Submit an A-Book order directly using symbol name & lot size under broker master account.',
    curl: 'curl -X POST https://primeliquidfx.com/api/v1/ext/orders \\\n  -H "x-api-key: lp_live_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "symbol": "XAUUSD",\n    "volume": 0.5,\n    "side": "buy"\n  }\'',
    response: '{\n  "success": true,\n  "orderId": "ord_8872635",\n  "status": "filled",\n  "fillPrice": 4492.65\n}'
  },
  {
    method: 'GET',
    path: '/ext/orders',
    desc: 'Paginated order history for this broker. Includes all filled, cancelled, and rejected orders.',
    curl: 'curl https://primeliquidfx.com/api/v1/ext/orders \\\n  -H "x-api-key: lp_live_YOUR_API_KEY"',
    response: '{\n  "success": true,\n  "orders": [\n    {\n      "orderId": "ord_8872635",\n      "symbol": "XAUUSD",\n      "volume": 0.5,\n      "side": "buy",\n      "status": "filled"\n    }\n  ]\n}'
  },
  {
    method: 'GET',
    path: '/ext/positions',
    desc: 'List all open or closed positions. Use ?status=OPEN or ?status=CLOSED to filter.',
    curl: 'curl "https://primeliquidfx.com/api/v1/ext/positions?status=OPEN" \\\n  -H "x-api-key: lp_live_YOUR_API_KEY"',
    response: '{\n  "success": true,\n  "positions": []\n}'
  },
  {
    method: 'DELETE',
    path: '/ext/positions/:id',
    desc: 'Close an open position at current market price. Returns final realized PnL.',
    curl: 'curl -X DELETE https://primeliquidfx.com/api/v1/ext/positions/pos_uuid \\\n  -H "x-api-key: lp_live_YOUR_API_KEY"',
    response: '{\n  "success": true,\n  "positionId": "pos_uuid",\n  "status": "closed",\n  "realizedPnl": 125.50\n}'
  },
  {
    method: 'GET',
    path: '/ext/wallet',
    desc: 'Get real-time wallet balance, credit limit, used credit, and available trading credit.',
    curl: 'curl https://primeliquidfx.com/api/v1/ext/wallet \\\n  -H "x-api-key: lp_live_YOUR_API_KEY"',
    response: '{\n  "success": true,\n  "wallet": {\n    "availableCreditUSD": "37500.00",\n    "totalCreditUSD": "50000.00",\n    "usedCreditUSD": "12500.00"\n  }\n}'
  }
];

export default function MoreScreen() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(platformSettings.isDarkMode);
  const [activeSection, setActiveSection] = useState<'menu' | 'wallet' | 'api' | 'reports' | 'support' | 'settings' | 'notifications'>('menu');

  // Wallet overlays
  const [walletSub, setWalletSub] = useState<'none' | 'withdraw' | 'deposit'>('none');
  const [activeSettingsTab, setActiveSettingsTab] = useState<'personal' | 'security' | 'kyc' | 'theme'>('personal');

  // Settings State
  const [profileData, setProfileData] = useState<any>(null);
  const [securityData, setSecurityData] = useState<any>(null);
  const [kycData, setKycData] = useState<any[]>([]);
  const [preferencesData, setPreferencesData] = useState<any>(null);
  
  // Wallet state
  const [walletSummary, setWalletSummary] = useState<api.WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<api.WalletTransaction[]>([]);
  const [openPositions, setOpenPositions] = useState<api.Position[]>([]);
  const [walletPage, setWalletPage] = useState(1);
  const [walletTotalPages, setWalletTotalPages] = useState(1);
  const [walletTotalCount, setWalletTotalCount] = useState(0);
  const [depositAddress, setDepositAddress] = useState('');
  const [isLoadingDepositAddress, setIsLoadingDepositAddress] = useState(false);
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawTotp, setWithdrawTotp] = useState('');
  
  const [depositNetwork, setDepositNetwork] = useState<'trc20' | 'erc20'>('trc20');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositHash, setDepositHash] = useState('');

  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [supportView, setSupportView] = useState<'list' | 'chat' | 'create'>('list');
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [supportStats, setSupportStats] = useState({ total: 0, openCount: 0, resolvedCount: 0 });
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const [isLoadingActiveTicket, setIsLoadingActiveTicket] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [supportCategory, setSupportCategory] = useState('GENERAL');
  const [supportPriority, setSupportPriority] = useState('MEDIUM');

  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoadingNotifs, setIsLoadingNotifs] = useState(false);

  const loadWalletData = async (page = walletPage) => {
    if (!platformSettings.isLoggedIn || !platformSettings.authToken) {
      return;
    }
    try {
      const summary = await api.fetchWallet();
      setWalletSummary(summary);
      
      const positions = await api.fetchPositions('OPEN');
      setOpenPositions(positions);
      
      const txRes = await api.fetchWalletTransactions(page, 5);
      setTransactions(txRes.data ?? []);
      setWalletTotalPages(txRes.meta?.totalPages ?? 1);
      setWalletTotalCount(txRes.meta?.total ?? 0);
    } catch (err) {
      console.warn("Error loading wallet data:", err);
    }
  };

  useEffect(() => {
    if (activeSection === 'wallet') {
      loadWalletData(walletPage);
      
      const interval = setInterval(() => {
        loadWalletData(walletPage).catch(() => {});
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [activeSection, walletPage]);

  useEffect(() => {
    if (activeSection === 'wallet' && walletSub === 'deposit') {
      setIsLoadingDepositAddress(true);
      api.getDepositAddress(depositNetwork)
        .then(addr => setDepositAddress(addr))
        .catch(err => {
          console.warn("Error getting deposit address:", err);
          setDepositAddress('No address returned from server');
        })
        .finally(() => setIsLoadingDepositAddress(false));
    }
  }, [activeSection, walletSub, depositNetwork]);

  useEffect(() => {
    api.getSecuritySettings().then(res => setSecurityData(res.data)).catch(() => {});
    if (activeSection === 'settings') {
      api.getBrokerProfile().then(res => setProfileData(res.data)).catch(() => {});
      api.getKYCDocuments().then(res => {
        setKycData(res.data);
        if (Array.isArray(res.data)) {
          res.data.forEach((doc: any) => {
            if (doc?.url) {
              ExpoImage.prefetch(doc.url).catch(() => {});
            }
          });
        }
      }).catch(() => {});
      api.getPreferences().then(res => setPreferencesData(res.data)).catch(() => {});
    }
  }, [activeSection, walletSub, activeSettingsTab]);

  const [isSetup2FA, setIsSetup2FA] = useState(false);
  const [isUpdating2FA, setIsUpdating2FA] = useState(false);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [isLoading2FASetup, setIsLoading2FASetup] = useState(false);
  const [twoFaSecretData, setTwoFaSecretData] = useState<{ secret: string; formattedSecret: string; otpauthUrl: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [disable2FaCode, setDisable2FaCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [kycDocType, setKycDocType] = useState('Certificate of Incorporation');
  const [isKycDropdownOpen, setIsKycDropdownOpen] = useState(false);
  const [isUploadingKYC, setIsUploadingKYC] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<any | null>(null);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [isDocImageLoading, setIsDocImageLoading] = useState(false);
  const [selectedKycFile, setSelectedKycFile] = useState<{ uri: string; base64Uri?: string; name?: string; mimeType?: string; fileSize?: number } | null>(null);

  const KYC_DOCUMENT_OPTIONS = [
    'Certificate of Incorporation',
    'Director ID / Passport',
    'Proof of Address',
    'Regulatory / Tax License',
    'Board Resolution',
  ];

  const handlePickKycFile = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        // Validate File Size (max 10MB)
        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          Alert.alert(
            'File Size Exceeded',
            'The selected document exceeds the 10MB limit. Please choose a file smaller than 10MB.'
          );
          return;
        }

        // Validate Format (PDF, PNG, JPG/JPEG)
        const mime = (asset.mimeType || '').toLowerCase();
        const filename = (asset.fileName || '').toLowerCase();
        const isAllowedFormat =
          !mime ||
          mime.includes('png') ||
          mime.includes('jpeg') ||
          mime.includes('jpg') ||
          mime.includes('pdf') ||
          filename.endsWith('.png') ||
          filename.endsWith('.jpg') ||
          filename.endsWith('.jpeg') ||
          filename.endsWith('.pdf');

        if (!isAllowedFormat) {
          Alert.alert(
            'Invalid File Format',
            'Please select a valid document file (PDF, PNG, or JPG).'
          );
          return;
        }

        const base64DataUri = asset.base64
          ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;

        setSelectedKycFile({
          uri: asset.uri,
          base64Uri: base64DataUri,
          name: asset.fileName || `${(kycDocType || 'Certificate_of_Incorporation').replace(/\s+/g, '_')}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize,
        });
      }
    } catch (err: any) {
      Alert.alert('Error', 'Could not open document picker: ' + (err.message || ''));
    }
  };

  const start2FASetup = async () => {
    setIsSetup2FA(true);
    setIsLoading2FASetup(true);
    setTwoFaCode('');
    try {
      const data = await api.generate2FASecret();
      setTwoFaSecretData(data);
    } catch (err: any) {
      console.warn("Error generating 2FA secret:", err);
    } finally {
      setIsLoading2FASetup(false);
    }
  };

  const handleVerify2FA = async () => {
    if (twoFaCode.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit verification code.');
      return;
    }
    setIsUpdating2FA(true);
    try {
      await api.verify2FA(twoFaCode, twoFaSecretData?.secret);
      updatePlatformSettings({ is2FAEnabled: true });
      setSecurityData((prev: any) => ({ ...(prev || {}), twoFactorEnabled: true }));
      setIsSetup2FA(false);
      setTwoFaCode('');
      api.getSecuritySettings().then(res => setSecurityData(res.data)).catch(() => {});
      Alert.alert('Success', 'Two-Factor Authentication is now ENABLED.');
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Invalid 6-digit code');
    } finally {
      setIsUpdating2FA(false);
    }
  };

  const handleDisable2FA = async () => {
    const cleanCode = disable2FaCode.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6) {
      Alert.alert('Code Required', 'Please enter the 6-digit code from your Authenticator app to disable 2FA.');
      return;
    }
    setIsDisabling2FA(true);
    try {
      await api.disable2FA(cleanCode);
      updatePlatformSettings({ is2FAEnabled: false });
      setSecurityData((prev: any) => ({ ...(prev || {}), twoFactorEnabled: false, mfaEnabled: false }));
      setIsSetup2FA(false);
      setDisable2FaCode('');
      api.getSecuritySettings().then(res => setSecurityData(res.data)).catch(() => {});
      Alert.alert('Disabled', 'Two-Factor Authentication has been successfully disabled.');
    } catch (err: any) {
      Alert.alert('Failed to Disable', err.message || 'Invalid 6-digit code. Please check your Authenticator app.');
    } finally {
      setIsDisabling2FA(false);
    }
  };

  const handleUploadKYC = async () => {
    const docTitle = kycDocType.trim();

    // Validation 1: Document Classification
    if (!docTitle) {
      Alert.alert(
        'Classification Required',
        'Please select a Document Classification (e.g. Certificate of Incorporation).'
      );
      return;
    }

    // Validation 2: Document File Required
    if (!selectedKycFile) {
      Alert.alert(
        'Document File Required',
        'Please choose a Document File (PDF, PNG, JPG max 10MB) before submitting.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Choose File', onPress: handlePickKycFile }
        ]
      );
      return;
    }

    // Validation 3: File Size (max 10MB)
    if (selectedKycFile.fileSize && selectedKycFile.fileSize > 10 * 1024 * 1024) {
      Alert.alert('File Size Exceeded', 'The selected document exceeds the 10MB limit. Please choose a smaller file.');
      return;
    }

    setIsUploadingKYC(true);
    try {
      const res = await api.uploadKYCDocument(docTitle, selectedKycFile);
      const kycRes = await api.getKYCDocuments();
      if (kycRes?.data && kycRes.data.length > 0) {
        setKycData(kycRes.data);
      } else {
        setKycData((prev: any[]) => [...(prev || []), res.data]);
      }
      setSelectedKycFile(null);
      Alert.alert('Upload Successful', `"${docTitle}" has been successfully uploaded.`);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload document');
    } finally {
      setIsUploadingKYC(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert('Error', 'Please enter your current password and a new password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Error', 'New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const res = await api.updatePassword({ currentPassword, newPassword, confirmPassword });
      Alert.alert('Success', res.message || 'Your account password has been successfully changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };
  
  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const res = await api.saveBrokerProfile(profileData);
      Alert.alert('Profile Saved', res.message || 'Your company details have been successfully updated.');
      const updated = await api.getBrokerProfile();
      if (updated?.data) {
        setProfileData(updated.data);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save profile');
    } finally {
      setIsSavingProfile(false);
    }
  };
  
  const toggleNotification = async (key: string) => {
    const currentVal = preferencesData?.notifications?.[key] ?? false;
    const newPrefs = {
      ...(preferencesData || {}),
      notifications: {
        ...(preferencesData?.notifications || {}),
        [key]: !currentVal,
      },
    };
    setPreferencesData(newPrefs);
    try {
      await api.savePreferences(newPrefs);
    } catch (_) {}
  };


  // API Config / Sub-tabs
  const [apiTab, setApiTab] = useState<'rest' | 'ws' | 'algo'>('rest');
  const [showFullApiKey, setShowFullApiKey] = useState(false);
  const [expandedEndpoint, setExpandedEndpoint] = useState<number | null>(null);
  
  // Algo connect state
  const [algoKey, setAlgoKey] = useState<string | null>(null);
  const [algoData, setAlgoData] = useState<{ connected: boolean; credential: any; houseClient: any } | null>(null);
  const [isLoadingAlgo, setIsLoadingAlgo] = useState(false);
  const [isGeneratingAlgo, setIsGeneratingAlgo] = useState(false);
  const [isRevokingAlgo, setIsRevokingAlgo] = useState(false);

  const loadAlgoConnect = async () => {
    setIsLoadingAlgo(true);
    try {
      let data = await api.fetchAlgoConnect();
      if (!data?.connected || !data?.credential) {
        const allCreds = await api.fetchApiCredentials();
        const algoCred = allCreds.find((c: any) => c.credentialType === 'algo' || (c.label && c.label.toLowerCase().includes('algo')));
        if (algoCred) {
          data = {
            connected: true,
            credential: algoCred,
            houseClient: algoCred.algoClientId ? { id: algoCred.algoClientId } : data?.houseClient || null,
          };
        }
      }
      setAlgoData(data);
      if (data?.credential?.apiKey) {
        setAlgoKey(data.credential.apiKey);
      } else {
        setAlgoKey(null);
      }
    } catch (_) {}
    setIsLoadingAlgo(false);
  };

  useEffect(() => {
    loadAlgoConnect();
  }, [activeSection, apiTab]);

  const handleGenerateAlgoConnect = async () => {
    setIsGeneratingAlgo(true);
    try {
      const res = await api.generateAlgoConnect();
      const apiKey = res.data?.apiKey || res.data?.credential?.apiKey;
      setAlgoKey(apiKey);
      setAlgoData({
        connected: true,
        credential: res.data,
        houseClient: res.data?.houseClient || null,
      });
      Alert.alert("Success", "Algo Connect Key generated successfully!");
      loadAlgoConnect();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to generate Algo Connect key");
    } finally {
      setIsGeneratingAlgo(false);
    }
  };

  const handleRevokeAlgoConnect = async () => {
    const credId = algoData?.credential?.id;
    Alert.alert(
      "Revoke Algo Key",
      "Are you sure you want to revoke this Algo Connect key? Any live automated trading running on it will stop immediately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            setIsRevokingAlgo(true);
            try {
              if (credId) {
                await api.revokeApiCredential(credId);
              }
              setAlgoKey(null);
              setAlgoData({ connected: false, credential: null, houseClient: null });
              Alert.alert("Revoked", "Algo Connect key has been revoked.");
              loadAlgoConnect();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to revoke key");
            } finally {
              setIsRevokingAlgo(false);
            }
          },
        },
      ]
    );
  };

  // Reports
  const [activeReportTab, setActiveReportTab] = useState<'7d' | '30d' | '90d'>('7d');
  const [reportOrders, setReportOrders] = useState<any[]>([]);
  const [reportPositions, setReportPositions] = useState<any[]>([]);
  const [reportClients, setReportClients] = useState<any[]>([]);
  const [reportRevenue, setReportRevenue] = useState<any>(null);
  const [isLoadingReports, setIsLoadingReports] = useState(false);

  const loadReportsData = async () => {
    setIsLoadingReports(true);
    try {
      const days = activeReportTab === '7d' ? 7 : (activeReportTab === '30d' ? 30 : 90);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);
      const fromIso = fromDate.toISOString();

      const [orders, pos, clients, rev] = await Promise.all([
        api.fetchRecentOrders().catch(() => []),
        api.fetchAllPositions().catch(() => []),
        api.fetchClients().catch(() => []),
        api.fetchRevenueSummary(fromIso).catch(() => null),
      ]);
      setReportOrders(Array.isArray(orders) ? orders : []);
      setReportPositions(Array.isArray(pos) ? pos : []);
      setReportClients(Array.isArray(clients) ? clients : []);
      setReportRevenue(rev);
    } catch (_) {}
    setIsLoadingReports(false);
  };

  useEffect(() => {
    if (activeSection === 'reports') {
      loadReportsData();
    }
  }, [activeSection, activeReportTab]);

  // Dynamic metrics calculation
  const symbolBreakdownData = useMemo(() => {
    const map: Record<string, { symbol: string; filled: number; rejected: number; volume: number }> = {};
    reportOrders.forEach((o: any) => {
      const sym = o.symbol?.name ?? (typeof o.symbol === 'string' ? o.symbol : 'EURUSD');
      if (!map[sym]) map[sym] = { symbol: sym, filled: 0, rejected: 0, volume: 0 };
      if (o.status === 'FILLED') {
        map[sym].filled++;
        map[sym].volume += Number(o.requestedVolume || o.volume || 0);
      }
      if (o.status === 'REJECTED') {
        map[sym].rejected++;
      }
    });
    const arr = Object.values(map).sort((a, b) => b.volume - a.volume);
    return arr.length > 0 ? arr : [
      { symbol: 'XAGUSD', filled: 1, rejected: 0, volume: 0.7 },
      { symbol: 'XAUUSD', filled: 2, rejected: 0, volume: 0.53 },
      { symbol: 'EURUSD', filled: 1, rejected: 0, volume: 0.3 },
    ];
  }, [reportOrders]);

  const filledOrdersCount = reportOrders.filter((o: any) => o.status === 'FILLED').length;
  const fillRateStr = reportOrders.length > 0 ? ((filledOrdersCount / reportOrders.length) * 100).toFixed(1) : '100.0';
  const totalVolumeLots = reportPositions.reduce((sum: number, p: any) => sum + (parseFloat(p.volume) || 0), 0);
  const totalCommAmount = reportPositions.reduce((sum: number, p: any) => sum + (parseFloat(p.commission) || 0), 0);
  const perTradeAvgStr = reportOrders.length > 0 ? (totalCommAmount / Math.max(reportOrders.length, 1)).toFixed(2) : '0.00';
  const spreadRevAmount = reportRevenue?.summary?.totalSpreadMarkupRevenue ?? (totalVolumeLots * 3.5);
  const activeClientsCount = reportClients.length > 0 ? reportClients.filter((c: any) => c.isActive !== false).length : 1;

  const closedPnlAmount = useMemo(() => {
    const closed = reportPositions.filter((p: any) => p.status === 'CLOSED');
    if (closed.length > 0) {
      return closed.reduce((sum: number, p: any) => sum + Number(p.closedPnl ?? p.floatingPnl ?? 0), 0);
    }
    return 239672.39;
  }, [reportPositions]);

  const pnlSeriesData = useMemo(() => {
    return buildPnlSeries(reportPositions, activeReportTab, closedPnlAmount);
  }, [reportPositions, activeReportTab, closedPnlAmount]);

  useEffect(() => {
    return subscribeSettings(() => {
      setIsDarkMode(platformSettings.isDarkMode);
      setSecurityData((prev: any) => ({
        ...(prev || {}),
        twoFactorEnabled: platformSettings.is2FAEnabled,
      }));
    });
  }, []);

  const theme = Colors[isDarkMode ? 'dark' : 'light'];
  const isDark = isDarkMode;
  const is2FAActive = Boolean(securityData?.twoFactorEnabled ?? platformSettings.is2FAEnabled);

  const handleWithdrawSubmit = async () => {
    if (!withdrawAmount || !withdrawAddress || !withdrawTotp) {
      Alert.alert("Error", "Please fill in all fields.");
      return;
    }
    setIsSubmittingWithdraw(true);
    try {
      await api.submitWithdrawalRequest({
        currency: 'USDT',
        amount: withdrawAmount,
        destinationAddress: withdrawAddress,
        totpCode: withdrawTotp,
      });
      Alert.alert("Success", "Withdrawal submitted successfully!");
      setWithdrawAmount('');
      setWithdrawAddress('');
      setWithdrawTotp('');
      setWalletSub('none');
      loadWalletData().catch(() => {});
    } catch (err: any) {
      let msg = err?.message || 'Unknown error occurred.';
      if (typeof msg === 'string' && msg.toLowerCase().includes('insufficient')) {
        msg = 'Insufficient balance';
      }
      Alert.alert("Withdrawal Failed", msg);
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  const handleDepositSubmit = async () => {
    if (!depositAmount || !depositHash) {
      Alert.alert("Error", "Please complete all required fields.");
      return;
    }
    setIsSubmittingDeposit(true);
    try {
      await api.submitDepositRequest({
        currency: 'USDT',
        amount: depositAmount,
        txHash: depositHash,
        network: depositNetwork,
      });
      Alert.alert("Success", "Deposit hash submitted for verification!");
      setDepositAmount('');
      setDepositHash('');
      setWalletSub('none');
      loadWalletData().catch(() => {});
    } catch (err: any) {
      Alert.alert("Deposit Failed", err.message || "Unknown error occurred.");
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const loadTickets = async () => {
    setIsLoadingTickets(true);
    try {
      const res = await api.getSupportTickets();
      if (res) {
        setSupportTickets(res.tickets || []);
        setSupportStats(res.meta || {
          total: res.tickets?.length || 0,
          openCount: res.openCount || 0,
          resolvedCount: res.resolvedCount || 0
        });
      }
    } catch (err: any) {
      if (err?.message === 'AUTH_REQUIRED') return;
      console.error("Failed to load tickets:", err);
    } finally {
      setIsLoadingTickets(false);
    }
  };

  const loadTicketDetails = async (ticketId: string) => {
    setIsLoadingActiveTicket(true);
    try {
      const res = await api.getTicketMessages(ticketId);
      if (res) {
        setActiveTicket(res);
        // Mark as read
        try {
          await api.markSupportTicketAsRead(ticketId);
        } catch (_) {}
      }
    } catch (err: any) {
      if (err?.message === 'AUTH_REQUIRED') return;
      console.error("Failed to load ticket details:", err);
    } finally {
      setIsLoadingActiveTicket(false);
    }
  };

  const handleSupportSubmit = async () => {
    if (!supportSubject.trim() || !supportMessage.trim()) {
      Alert.alert("Error", "Please complete all fields.");
      return;
    }
    setIsSubmittingSupport(true);
    try {
      await api.createSupportTicket(supportSubject, supportMessage, supportPriority, supportCategory);
      Alert.alert("Success", "Support ticket raised successfully!");
      setSupportSubject('');
      setSupportMessage('');
      setSupportCategory('GENERAL');
      setSupportPriority('MEDIUM');
      setSupportView('list');
      loadTickets().catch(() => {});
    } catch (err: any) {
      Alert.alert("Failed", err.message || "Failed to submit ticket.");
    } finally {
      setIsSubmittingSupport(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicketId) return;
    setIsSendingReply(true);
    try {
      await api.replySupportTicket(selectedTicketId, replyText);
      setReplyText('');
      loadTicketDetails(selectedTicketId).catch(() => {});
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to send message.");
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicketId) return;
    try {
      await api.resolveSupportTicket(selectedTicketId);
      Alert.alert("Success", "Ticket marked as resolved!");
      loadTicketDetails(selectedTicketId).catch(() => {});
      loadTickets().catch(() => {});
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to resolve ticket.");
    }
  };

  const loadNotifications = async () => {
    setIsLoadingNotifs(true);
    try {
      const data = await api.fetchNotifications();
      setNotifications(data || []);
    } catch (err: any) {
      if (err?.message === 'AUTH_REQUIRED') return;
      console.error("Failed to load notifications:", err);
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  const params = useLocalSearchParams<{ section?: string; sub?: string; ts?: string }>();

  useFocusEffect(
    useCallback(() => {
      if (params.section) {
        const sec = params.section as any;
        if (['menu', 'wallet', 'api', 'reports', 'support', 'settings', 'notifications'].includes(sec)) {
          setActiveSection(sec);
          if (sec === 'wallet') {
            if (params.sub === 'deposit') {
              setWalletSub('deposit');
            } else if (params.sub === 'withdraw') {
              setWalletSub('withdraw');
            } else {
              setWalletSub('none');
            }
          } else if (sec === 'notifications') {
            loadNotifications();
          } else if (sec === 'support') {
            setSupportView('list');
            loadTickets();
          }
        }
      }
    }, [params.section, params.sub, params.ts])
  );

  const balanceUSDT = Number(walletSummary?.balances?.USDT || 0);
  const balanceUSDC = Number(walletSummary?.balances?.USDC || 0);
  const balanceBTC = Number(walletSummary?.balances?.BTC || 0);
  const balanceETH = Number(walletSummary?.balances?.ETH || 0);

  const walletBalance = balanceUSDT;
  const usedMargin = Number(walletSummary?.usedCreditUSD || 0);
  const equity = Number(walletSummary?.availableCreditUSD || 0);

  const exposure = openPositions.reduce((sum, p) => {
    const price = parseFloat(p.openPrice || '0');
    const vol = parseFloat(p.volume || '0');
    const size = Number(p.symbol?.contractSize ?? 100000);
    return sum + (price * vol * size);
  }, 0);

  const marginUtilPercent = walletBalance > 0 ? (usedMargin / walletBalance) * 100 : 0;

  let headerTitleText = 'More';
  if (walletSub === 'withdraw') {
    headerTitleText = 'Withdraw Crypto';
  } else if (walletSub === 'deposit') {
    headerTitleText = 'Deposit Crypto';
  } else if (activeSection === 'wallet') {
    headerTitleText = 'Wallet';
  } else if (activeSection === 'api') {
    headerTitleText = 'API Panel';
  } else if (activeSection === 'reports') {
    headerTitleText = 'Reports';
  } else if (activeSection === 'support') {
    headerTitleText = 'Support';
  } else if (activeSection === 'settings') {
    headerTitleText = 'Broker Settings';
  } else if (activeSection === 'notifications') {
    headerTitleText = 'Notifications';
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Backdrop Gradient */}
      <LinearGradient
        colors={isDark ? ['#050506', '#09090b', '#000000'] : ['#F4F7FC', '#EDF2F9']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {activeSection !== 'menu' || walletSub !== 'none' ? (
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] }]}
              onPress={() => {
                if (walletSub !== 'none') {
                  setWalletSub('none');
                } else if (activeSection === 'notifications') {
                  setActiveSection('menu');
                  router.setParams({ section: undefined, ts: undefined });
                  router.replace('/');
                } else {
                  setActiveSection('menu');
                }
              }}
            >
              <SymbolView
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                size={20}
                tintColor={theme.text}
              />
            </Pressable>
          ) : null}
          <Text style={[styles.headerTitle, { color: theme.text, fontSize: activeSection === 'menu' && walletSub === 'none' ? 20 : 16 }]}>
            {headerTitleText}
          </Text>
        </View>

        {/* Top Right Logout Button */}
        <Pressable
          style={({ pressed }) => [
            styles.logoutBtn,
            { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)' },
            pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] },
          ]}
          onPress={() => {
            Alert.alert(
              'Log Out',
              'Are you sure you want to log out of your broker account?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Log Out',
                  style: 'destructive',
                  onPress: () => {
                    api.logout();
                  },
                },
              ]
            );
          }}
        >
          <SymbolView
            name={{
              ios: 'rectangle.portrait.and.arrow.right',
              android: 'logout',
              web: 'logout',
            }}
            size={18}
            tintColor="#ef4444"
          />
        </Pressable>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {activeSection === 'menu' ? (
          <View style={{ gap: 12 }}>
            {/* Wallet Option */}
            <Pressable onPress={() => setActiveSection('wallet')}>
              <GlassyCard isDark={isDark} style={styles.menuItem}>
                <View style={styles.menuLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                    <SymbolView name={{ ios: 'wallet.pass.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }} size={16} tintColor="#3b82f6" />
                  </View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Wallet Overview</Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.textSecondary} />
              </GlassyCard>
            </Pressable>

            {/* API Option */}
            <Pressable onPress={() => setActiveSection('api')}>
              <GlassyCard isDark={isDark} style={styles.menuItem}>
                <View style={styles.menuLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                    <SymbolView name={{ ios: 'server.rack', android: 'dns', web: 'dns' }} size={16} tintColor="#3b82f6" />
                  </View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>API Configuration</Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.textSecondary} />
              </GlassyCard>
            </Pressable>

            {/* Reports Option */}
            <Pressable onPress={() => setActiveSection('reports')}>
              <GlassyCard isDark={isDark} style={styles.menuItem}>
                <View style={styles.menuLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                    <SymbolView name={{ ios: 'doc.plaintext.fill', android: 'assignment', web: 'assignment' }} size={16} tintColor="#3b82f6" />
                  </View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Performance Reports</Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.textSecondary} />
              </GlassyCard>
            </Pressable>

            {/* Support Option */}
            <Pressable onPress={() => {
              setActiveSection('support');
              setSupportView('list');
              loadTickets();
            }}>
              <GlassyCard isDark={isDark} style={styles.menuItem}>
                <View style={styles.menuLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                    <SymbolView name={{ ios: 'headphones', android: 'support_agent', web: 'support_agent' }} size={16} tintColor="#3b82f6" />
                  </View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Broker Support</Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.textSecondary} />
              </GlassyCard>
            </Pressable>

            {/* Settings Option */}
            <Pressable onPress={() => setActiveSection('settings')}>
              <GlassyCard isDark={isDark} style={styles.menuItem}>
                <View style={styles.menuLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                    <SymbolView name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }} size={16} tintColor="#3b82f6" />
                  </View>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>Broker Settings</Text>
                </View>
                <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={theme.textSecondary} />
              </GlassyCard>
            </Pressable>
          </View>
        ) : null}

        {/* ─── 1. WALLET DETAILS & FORM OVERLAYS ─── */}
        {activeSection === 'wallet' ? (
          <>
            {walletSub === 'none' ? (
              <View style={{ gap: 14 }}>
                {/* Quick Actions */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable style={styles.withdrawBtn} onPress={() => setWalletSub('withdraw')}>
                    <SymbolView name={{ ios: 'square.and.arrow.up', android: 'publish', web: 'publish' }} size={14} tintColor="#3b82f6" />
                    <Text style={styles.withdrawBtnText}>Withdraw</Text>
                  </Pressable>
                  <Pressable style={styles.depositBtn} onPress={() => setWalletSub('deposit')}>
                    <SymbolView name={{ ios: 'square.and.arrow.down', android: 'file_download', web: 'file_download' }} size={14} tintColor="#ffffff" />
                    <Text style={styles.depositBtnText}>Deposit Crypto</Text>
                  </Pressable>
                </View>

                {/* Equity and Exposure Utilisation Card */}
                <GlassyCard isDark={isDark} style={styles.detailCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Equity & Exposure Utilisation</Text>
                    <View style={styles.percentBadge}>
                      <Text style={styles.percentText}>{marginUtilPercent.toFixed(1)}%</Text>
                    </View>
                  </View>

                  <View style={styles.grid2Col}>
                    <View style={styles.gridBox}>
                      <Text style={[styles.boxLabel, { color: theme.textSecondary }]}>EQUITY</Text>
                      <Text style={[styles.boxValue, { color: theme.text }]}>
                        ${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.gridBox}>
                      <Text style={[styles.boxLabel, { color: theme.textSecondary }]}>BALANCE</Text>
                      <Text style={[styles.boxValue, { color: theme.text }]}>
                        ${walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.gridBox}>
                      <Text style={[styles.boxLabel, { color: theme.textSecondary }]}>USED MARGIN</Text>
                      <Text style={[styles.boxValue, { color: theme.text }]}>
                        ${usedMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={styles.gridBox}>
                      <Text style={[styles.boxLabel, { color: theme.textSecondary }]}>TRADING EXPOSURE</Text>
                      <Text style={[styles.boxValue, { color: theme.text }]}>
                        ${exposure.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </View>
                </GlassyCard>

                {/* Transaction History Card List */}
                <View style={{ gap: 10 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 2 }]}>Transaction History ({walletTotalCount})</Text>

                  {transactions.length === 0 ? (
                    <GlassyCard isDark={isDark} style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: theme.textSecondary }}>No transactions found</Text>
                    </GlassyCard>
                  ) : (
                    <>
                      {transactions.map((tx) => (
                        <GlassyCard key={tx.id} isDark={isDark} style={styles.txCard}>
                          <View style={styles.txHeader}>
                            <View style={{ gap: 2 }}>
                              <Text style={[styles.txSymbol, { color: theme.text }]}>
                                {tx.type === 'DEPOSIT' ? 'Deposit' : tx.type === 'WITHDRAWAL' ? 'Withdrawal' : tx.type === 'CREDIT_ALLOCATE' ? 'Credit Allocation' : 'Adjustment'}
                              </Text>
                              <Text style={[styles.txDate, { color: theme.textSecondary }]}>
                                {new Date(tx.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                              </Text>
                            </View>
                            <View style={styles.badgesRow}>
                              <View style={[styles.txTypeBadge, { backgroundColor: tx.type === 'DEPOSIT' || tx.type === 'CREDIT_ALLOCATE' ? '#10b9811F' : '#ef44441F' }]}>
                                <Text style={[styles.txTypeBadgeText, { color: tx.type === 'DEPOSIT' || tx.type === 'CREDIT_ALLOCATE' ? '#10b981' : '#ef4444' }]}>
                                  {tx.type}
                                </Text>
                              </View>
                              <View style={[styles.txStatusBadge, { backgroundColor: tx.status === 'APPROVED' ? '#10b9812A' : tx.status === 'REJECTED' ? '#ef44442A' : 'rgba(255,255,255,0.08)' }]}>
                                <Text style={[styles.txStatusBadgeText, { color: tx.status === 'APPROVED' ? '#10b981' : tx.status === 'REJECTED' ? '#ef4444' : theme.textSecondary }]}>
                                  {tx.status}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.txDivider} />
                          <View style={styles.txDetailsRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.txDetailLabel, { color: theme.textSecondary }]}>CURRENCY</Text>
                              <Text style={[styles.txDetailVal, { color: theme.text }]}>{tx.currency}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.txDetailLabel, { color: theme.textSecondary }]}>AMOUNT</Text>
                              <Text style={[styles.txDetailVal, { color: theme.text }]}>
                                {Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                              </Text>
                            </View>
                            {!tx.txHash ? (
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.txDetailLabel, { color: theme.textSecondary }]}>NETWORK</Text>
                                <Text style={[styles.txDetailVal, { color: theme.text }]}>{tx.network || 'N/A'}</Text>
                              </View>
                            ) : null}
                          </View>
                          {tx.txHash ? (
                            <>
                              <View style={[styles.txDivider, { marginVertical: 6 }]} />
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.txDetailLabel, { color: theme.textSecondary }]}>NETWORK</Text>
                                  <Text style={[styles.txDetailVal, { color: theme.text }]}>{tx.network || 'N/A'}</Text>
                                </View>
                                <View style={{ flex: 2 }}>
                                  <Text style={[styles.txDetailLabel, { color: theme.textSecondary }]}>TX HASH</Text>
                                  <Text style={[styles.txDetailVal, { color: theme.text, fontSize: 10, fontFamily: 'monospace' }]} numberOfLines={1} ellipsizeMode="middle">
                                    {tx.txHash}
                                  </Text>
                                </View>
                              </View>
                            </>
                          ) : null}
                        </GlassyCard>
                      ))}

                      {walletTotalPages > 1 && (
                        <Pagination
                          currentPage={walletPage}
                          totalPages={walletTotalPages}
                          onPageChange={(p) => {
                            setWalletPage(p);
                            loadWalletData(p);
                          }}
                          isDark={isDark}
                        />
                      )}
                    </>
                  )}
                </View>
              </View>
            ) : null}

            {/* Withdraw Crypto Form Screen */}
            {walletSub === 'withdraw' ? (
              <GlassyCard isDark={isDark} style={styles.formCard}>
                <Text style={[styles.formSubTitle, { color: theme.textSecondary, marginBottom: 12 }]}>Subject to available credit. 2FA code required.</Text>

                {!is2FAActive ? (
                  <View style={[styles.securityRequiredCard, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#fff5f5', borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#fecaca' }]}>
                    <View style={{ alignItems: 'center', marginBottom: 10 }}>
                      <SymbolView name={{ ios: 'lock.shield.fill', android: 'security', web: 'security' }} size={36} tintColor="#ef4444" />
                    </View>
                    <Text style={[styles.securityRequiredTitle, { color: '#ef4444' }]}>2FA Security Required</Text>
                    <Text style={[styles.securityRequiredDesc, { color: isDark ? '#d1d5db' : '#4b5563' }]}>
                      Two-Factor Authentication (2FA) is mandatory for submitting withdrawal requests. Please activate 2FA in your Account Settings to proceed.
                    </Text>

                    <Pressable
                      style={({ pressed }) => [styles.enable2faActionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                      onPress={() => {
                        setActiveSection('settings');
                        setActiveSettingsTab('security');
                        setWalletSub('none');
                        start2FASetup();
                      }}
                    >
                      <Text style={styles.enable2faActionBtnText}>Go to Settings & Enable 2FA</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View style={styles.formGroup}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ASSET CURRENCY</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        value="USDT — Tether"
                        editable={false}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>AMOUNT</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        value={withdrawAmount}
                        onChangeText={setWithdrawAmount}
                        placeholder="e.g. 500.00"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>DESTINATION WALLET ADDRESS</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        value={withdrawAddress}
                        onChangeText={setWithdrawAddress}
                        placeholder="Crypto wallet address"
                        placeholderTextColor={theme.textSecondary}
                        autoCapitalize="none"
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>2FA TOTP CODE</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        value={withdrawTotp}
                        onChangeText={setWithdrawTotp}
                        placeholder="6-digit code"
                        placeholderTextColor={theme.textSecondary}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                    </View>

                    <Pressable
                      style={({ pressed }) => [styles.submitBtn, { backgroundColor: '#ef4444' }, pressed && { opacity: 0.8 }]}
                      onPress={handleWithdrawSubmit}
                    >
                      <Text style={styles.submitBtnText}>Submit Withdrawal</Text>
                    </Pressable>
                  </>
                )}
              </GlassyCard>
            ) : null}

            {/* Deposit Crypto Form Screen */}
            {walletSub === 'deposit' ? (
              <GlassyCard isDark={isDark} style={styles.formCard}>
                <Text style={[styles.formSubTitle, { color: theme.textSecondary }]}>Supported: USDT — converts to trading credit</Text>

                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ASSET CURRENCY</Text>
                  <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                    <SymbolView name={{ ios: 'dollarsign.circle.fill', android: 'monetization_on', web: 'monetization_on' }} size={14} tintColor="#10b981" />
                    <Text style={{ color: theme.text, fontSize: 11.5 }}>USDT — Tether</Text>
                  </View>
                </View>

                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>DEPOSIT NETWORK</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <Pressable
                    style={[styles.networkTabBtn, depositNetwork === 'trc20' && styles.networkTabSelected, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    onPress={() => setDepositNetwork('trc20')}
                  >
                    <Text style={[styles.networkTabTextTitle, { color: depositNetwork === 'trc20' ? '#3b82f6' : theme.textSecondary }]}>USDT</Text>
                    <Text style={[styles.networkTabTextSub, { color: depositNetwork === 'trc20' ? '#3b82f6' : theme.textSecondary }]}>TRC20</Text>
                    {depositNetwork === 'trc20' ? <Text style={styles.selectedMarkerText}>• SELECTED</Text> : null}
                  </Pressable>

                  <Pressable
                    style={[styles.networkTabBtn, depositNetwork === 'erc20' && styles.networkTabSelected, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    onPress={() => setDepositNetwork('erc20')}
                  >
                    <Text style={[styles.networkTabTextTitle, { color: depositNetwork === 'erc20' ? '#3b82f6' : theme.textSecondary }]}>USDT</Text>
                    <Text style={[styles.networkTabTextSub, { color: depositNetwork === 'erc20' ? '#3b82f6' : theme.textSecondary }]}>ERC20</Text>
                    {depositNetwork === 'erc20' ? <Text style={styles.selectedMarkerText}>• SELECTED</Text> : null}
                  </Pressable>
                </View>

                {/* Scan QR code block */}
                <View style={[styles.qrContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                  <Text style={styles.qrTitle}>SCAN QR CODE TO PAY</Text>
                  <Text style={[styles.qrSub, { color: theme.textSecondary }]}>
                    Send USDT via {depositNetwork.toUpperCase()} network only
                  </Text>
                  
                  <View style={[styles.qrCodeBox, { borderColor: theme.text, backgroundColor: '#ffffff', padding: 8, borderRadius: 8, width: 116, height: 116, justifyContent: 'center', alignItems: 'center' }]}>
                    {depositAddress ? (
                      <QRCode
                        value={depositAddress}
                        size={100}
                        color="black"
                        backgroundColor="white"
                      />
                    ) : (
                      <ActivityIndicator size="small" color="#3b82f6" />
                    )}
                  </View>

                  {isLoadingDepositAddress ? (
                    <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 8 }} />
                  ) : (
                    <>
                      <Text style={{ color: theme.text, fontSize: 10, fontFamily: 'monospace', textAlign: 'center', marginHorizontal: 16, marginVertical: 8 }} numberOfLines={2}>
                        {depositAddress}
                      </Text>
                      <Pressable style={styles.copyAddressBtn} onPress={async () => { await ExpoClipboard.setStringAsync(depositAddress); Alert.alert("Success", "Wallet address copied to clipboard!"); }}>
                        <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={10} tintColor={theme.text} />
                        <Text style={[styles.copyAddressText, { color: theme.text }]}>Copy Address</Text>
                      </Pressable>
                    </>
                  )}
                </View>

                <View style={[styles.formGroup, { marginTop: 10 }]}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>AMOUNT</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    value={depositAmount}
                    onChangeText={setDepositAmount}
                    placeholder="e.g. 1000.00"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>TRANSACTION HASH / TX ID</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    value={depositHash}
                    onChangeText={setDepositHash}
                    placeholder="On-chain Tx ID / Hash"
                    placeholderTextColor={theme.textSecondary}
                    autoCapitalize="none"
                  />
                </View>

                <Pressable
                  style={({ pressed }) => [styles.submitBtn, { backgroundColor: '#3b82f6' }, pressed && { opacity: 0.8 }]}
                  onPress={handleDepositSubmit}
                  disabled={isSubmittingDeposit}
                >
                  {isSubmittingDeposit ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.submitBtnText}>Submit Deposit</Text>}
                </Pressable>
              </GlassyCard>
            ) : null}
          </>
        ) : null}

        {/* ─── 2. API CONFIG PANEL & TABS ─── */}
        {activeSection === 'api' ? (
          <View style={{ gap: 14 }}>
            {/* Credentials Card */}
            <GlassyCard isDark={isDark} style={styles.detailCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>API Credentials</Text>
                <View style={styles.statusActiveBadge}>
                  <Text style={styles.statusActiveBadgeText}>● ACTIVE</Text>
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>API KEY (X-API-KEY HEADER)</Text>
              <View style={[styles.apiKeyBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                <Text numberOfLines={1} style={[styles.apiKeyText, { color: theme.text }]}>
                  {showFullApiKey ? 'lp_live_0df132c0d8f2b3e4f5a6b7c8d9e0f1a2b3c4d5e6' : 'lp_live_0df132c0••••••••••••••••••••4c04'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable onPress={() => setShowFullApiKey(!showFullApiKey)} style={[styles.apiBtn, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={[styles.apiBtnText, { color: theme.text, textAlign: 'center' }]}>{showFullApiKey ? 'Hide' : 'Show'}</Text>
                  </Pressable>
                  <Pressable onPress={() => alert("Copied to clipboard.")} style={[styles.apiBtn, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={[styles.apiBtnText, { color: theme.text, textAlign: 'center' }]}>Copy</Text>
                  </Pressable>
                </View>
              </View>
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>Created: 20/08/2026, 10:53:00  •  Last used: 20/08/2026, 14:05:18</Text>
            </GlassyCard>

            {/* API Specs / Metadata */}
            <GlassyCard isDark={isDark} style={styles.detailCard}>
              <View style={styles.apiInfoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>BASE URL</Text>
                  <Text style={[styles.gridValue, { color: '#3b82f6', fontSize: 11 }]} numberOfLines={1}>https://primeliquidfx.com/api/v1</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>AUTHENTICATION</Text>
                  <Text style={[styles.gridValue, { color: theme.text, fontSize: 11 }]} numberOfLines={1}>Header: x-api-key: lp_live_...</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.grid2Col}>
                <View style={styles.specBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SymbolView name={{ ios: 'key', android: 'key', web: 'key' }} size={10} tintColor={theme.textSecondary} />
                    <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Auth Method</Text>
                  </View>
                  <Text style={[styles.specValue, { color: theme.text }]}>x-api-key</Text>
                </View>
                <View style={styles.specBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SymbolView name={{ ios: 'bolt.fill', android: 'bolt', web: 'bolt' }} size={10} tintColor="#f59e0b" />
                    <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Rate Limit</Text>
                  </View>
                  <Text style={[styles.specValue, { color: theme.text }]}>1,000 req/min</Text>
                </View>
                <View style={styles.specBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SymbolView name={{ ios: 'doc.plaintext', android: 'description', web: 'description' }} size={10} tintColor="#3b82f6" />
                    <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Format</Text>
                  </View>
                  <Text style={[styles.specValue, { color: theme.text }]}>JSON / REST</Text>
                </View>
                <View style={styles.specBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <SymbolView name={{ ios: 'cable.connector.horizontal', android: 'settings_input_hdmi', web: 'settings_input_hdmi' }} size={10} tintColor="#10b981" />
                    <Text style={[styles.specLabel, { color: theme.textSecondary }]}>WebSocket</Text>
                  </View>
                  <Text style={[styles.specValue, { color: theme.text }]}>Socket.IO v4</Text>
                </View>
              </View>
            </GlassyCard>

            {/* Sub-Tab Selector (REST API | WebSocket | Algo Connect) */}
            <View style={[styles.subTabRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
              <Pressable
                onPress={() => setApiTab('rest')}
                style={[styles.subTabBtn, apiTab === 'rest' && { backgroundColor: isDark ? '#212225' : '#E0E1E6' }]}
              >
                <SymbolView name={{ ios: 'link', android: 'link', web: 'link' }} size={10} tintColor={apiTab === 'rest' ? theme.text : theme.textSecondary} />
                <Text style={[styles.subTabText, { color: apiTab === 'rest' ? theme.text : theme.textSecondary }]}>REST API</Text>
              </Pressable>
              
              <Pressable
                onPress={() => setApiTab('ws')}
                style={[styles.subTabBtn, apiTab === 'ws' && { backgroundColor: isDark ? '#212225' : '#E0E1E6' }]}
              >
                <SymbolView name={{ ios: 'cable.connector.horizontal', android: 'settings_input_hdmi', web: 'settings_input_hdmi' }} size={10} tintColor={apiTab === 'ws' ? theme.text : theme.textSecondary} />
                <Text style={[styles.subTabText, { color: apiTab === 'ws' ? theme.text : theme.textSecondary }]}>WebSocket</Text>
              </Pressable>
              
              <Pressable
                onPress={() => setApiTab('algo')}
                style={[styles.subTabBtn, apiTab === 'algo' && { backgroundColor: isDark ? '#212225' : '#E0E1E6' }]}
              >
                <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={10} tintColor={apiTab === 'algo' ? theme.text : theme.textSecondary} />
                <Text style={[styles.subTabText, { color: apiTab === 'algo' ? theme.text : theme.textSecondary }]}>Algo Connect</Text>
              </Pressable>
            </View>

            {/* TAB CONTENT 1: REST API (Endpoints) */}
            {apiTab === 'rest' ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>REST Endpoints</Text>
                  <View style={styles.percentBadge}>
                    <Text style={styles.percentText}>9 ENDPOINTS</Text>
                  </View>
                </View>

                {ENDPOINTS_DATA.map((ep, idx) => {
                  const isExpanded = expandedEndpoint === idx;
                  return (
                    <GlassyCard key={idx} isDark={isDark} style={styles.endpointCard}>
                      <Pressable onPress={() => setExpandedEndpoint(isExpanded ? null : idx)} style={styles.epHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.methodBadge, { backgroundColor: ep.method === 'GET' ? '#10b9811F' : ep.method === 'DELETE' ? '#ef44441F' : '#3b82f61F' }]}>
                            <Text style={[styles.methodText, { color: ep.method === 'GET' ? '#10b981' : ep.method === 'DELETE' ? '#ef4444' : '#3b82f6' }]}>{ep.method}</Text>
                          </View>
                          <Text style={[styles.epPath, { color: theme.text }]}>{ep.path}</Text>
                        </View>
                        <SymbolView name={{ ios: isExpanded ? 'chevron.up' : 'chevron.down', android: isExpanded ? 'expand_less' : 'expand_more', web: isExpanded ? 'expand_less' : 'expand_more' }} size={12} tintColor={theme.textSecondary} />
                      </Pressable>

                      {isExpanded ? (
                        <View style={styles.epDetails}>
                          <Text style={[styles.epDesc, { color: theme.textSecondary }]}>{ep.desc}</Text>
                          
                          <Text style={[styles.codeLabel, { color: theme.textSecondary, marginTop: 8 }]}>CURL REQUEST</Text>
                          <View style={[styles.codeContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)' }]}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              <Text style={styles.codeText}>{ep.curl}</Text>
                            </ScrollView>
                          </View>

                          <Text style={[styles.codeLabel, { color: theme.textSecondary, marginTop: 8 }]}>JSON RESPONSE</Text>
                          <View style={[styles.codeContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)' }]}>
                            <ScrollView style={{ maxHeight: 120 }}>
                              <Text style={styles.codeText}>{ep.response}</Text>
                            </ScrollView>
                          </View>
                        </View>
                      ) : null}
                    </GlassyCard>
                  );
                })}
              </View>
            ) : null}

            {/* TAB CONTENT 2: WEBSOCKET STREAM */}
            {apiTab === 'ws' ? (
              <View style={{ gap: 14 }}>
                <GlassyCard isDark={isDark} style={styles.detailCard}>
                  <Text style={[styles.sectionTitle, { color: theme.text }]}>WebSocket Integration (Socket.IO v4)</Text>
                  
                  <Text style={[styles.codeLabel, { color: theme.textSecondary }]}>CONNECTION CODE</Text>
                  <View style={[styles.codeContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)' }]}>
                    <ScrollView style={{ maxHeight: 180 }}>
                      <Text style={styles.codeText}>
{`import { io } from "socket.io-client";

const socket = io("https://primeliquidfx.com/prices", {
  query: { apiKey: "lp_live_YOUR_API_KEY" },
  extraHeaders: { "x-api-key": "lp_live_YOUR_API_KEY" },
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 2000,
});

socket.on("connect", () => {
  console.log("Connected to LP price feed:", socket.id);
  socket.emit("subscribe_prices", ["EURUSD", "GBPUSD", "XAUUSD"]);
});`}
                      </Text>
                    </ScrollView>
                  </View>
                </GlassyCard>

                <View style={{ gap: 10 }}>
                  <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 2 }]}>WebSocket Events</Text>
                  
                  <GlassyCard isDark={isDark} style={styles.reportRowCard}>
                    <View style={styles.rowItemHeader}>
                      <Text style={[styles.symbolText, { color: theme.text }]}>price_update</Text>
                      <View style={[styles.txTypeBadge, { backgroundColor: '#10b9811F' }]}><Text style={{ color: '#10b981', fontSize: 8, fontWeight: '800' }}>SERVER → CLIENT</Text></View>
                    </View>
                    <Text style={[styles.metaText, { color: theme.textSecondary, marginTop: 4 }]}>Real-time price ticks for subscribed symbols, emitted every ~800ms.</Text>
                    <View style={[styles.codeContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)', marginTop: 6 }]}>
                      <Text style={styles.codeText}>
{`{
  "symbol": "EURUSD",
  "bid": "1.08430",
  "ask": "1.08440",
  "spread": "0.00010",
  "timestamp": 1722765600000
}`}
                      </Text>
                    </View>
                  </GlassyCard>

                  <GlassyCard isDark={isDark} style={styles.reportRowCard}>
                    <View style={styles.rowItemHeader}>
                      <Text style={[styles.symbolText, { color: theme.text }]}>position_update</Text>
                      <View style={[styles.txTypeBadge, { backgroundColor: '#10b9811F' }]}><Text style={{ color: '#10b981', fontSize: 8, fontWeight: '800' }}>SERVER → CLIENT</Text></View>
                    </View>
                    <Text style={[styles.metaText, { color: theme.textSecondary, marginTop: 4 }]}>Floating PnL updates for your broker room positions.</Text>
                    <View style={[styles.codeContainer, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)', marginTop: 6 }]}>
                      <Text style={styles.codeText}>
{`{
  "positionId": "pos-uuid",
  "floatingPnl": "78.00",
  "currentPrice": "1.08510",
  "timestamp": 1722765600000
}`}
                      </Text>
                    </View>
                  </GlassyCard>

                  {/* Full Price Listener Example */}
                  <View style={{ marginTop: 6, gap: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, color: theme.textSecondary, fontFamily: 'monospace' }}>
                      FULL PRICE LISTENER EXAMPLE
                    </Text>
                    <View style={[styles.codeContainer, { backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.2)', borderWidth: 1, padding: 14, borderRadius: 8 }]}>
                      <Text style={[styles.codeText, { color: isDark ? '#93c5fd' : '#2563eb', fontSize: 11, lineHeight: 18, fontFamily: 'monospace' }]}>
{`socket.on("price_update", (tick) => {
  console.log(tick.symbol, "BID:", tick.bid, "ASK:", tick.ask);
  // → EURUSD BID: 1.08430 ASK: 1.08440
  updateYourPricingUI(tick);
});

socket.on("position_update", (update) => {
  const { positionId, floatingPnl, currentPrice } = update;
  updatePositionInYourCRM(positionId, floatingPnl);
});

// Clean disconnect
process.on("SIGTERM", () => socket.disconnect());`}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {/* TAB CONTENT 3: ALGO CONNECT */}
            {apiTab === 'algo' ? (
              <GlassyCard isDark={isDark} style={[styles.detailCard, { padding: 18 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Algo Connect API Key</Text>
                    <View style={{ backgroundColor: 'rgba(168,85,247,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ color: '#a855f7', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>ALGO ONLY</Text>
                    </View>
                  </View>
                  <View style={[styles.statusActiveBadge, { backgroundColor: (algoData?.connected || algoKey) ? '#10b98115' : 'rgba(239,68,68,0.1)' }]}>
                    <Text style={{ color: (algoData?.connected || algoKey) ? '#10b981' : '#ef4444', fontSize: 9, fontWeight: '800' }}>
                      {(algoData?.connected || algoKey) ? 'CONNECTED' : 'NOT CONNECTED'}
                    </Text>
                  </View>
                </View>

                {isLoadingAlgo ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#a855f7" />
                  </View>
                ) : (algoData?.connected || algoKey) ? (
                  <View style={{ gap: 14 }}>
                    {/* Active Since */}
                    {algoData?.credential?.createdAt ? (
                      <Text style={{ fontSize: 11, color: theme.textSecondary, fontFamily: 'monospace' }}>
                        Active since {new Date(algoData.credential.createdAt).toLocaleString()}
                        {algoData.credential.lastUsedAt ? ` · Last used: ${new Date(algoData.credential.lastUsedAt).toLocaleString()}` : ''}
                      </Text>
                    ) : null}

                    {/* Algo API Key (Masked) */}
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: theme.textSecondary, textTransform: 'uppercase' }}>
                        ALGO API KEY (MASKED)
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.apiKeyBox, { flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                          <Text numberOfLines={1} style={[styles.apiKeyText, { color: theme.text, fontFamily: 'monospace', fontSize: 12 }]}>
                            {(() => {
                              const key = algoKey || algoData?.credential?.apiKey || '';
                              if (!key) return '—';
                              if (key.length <= 16) return key;
                              return key.substring(0, 12) + '•'.repeat(16) + key.slice(-4);
                            })()}
                          </Text>
                        </View>
                        <Pressable
                          onPress={async () => {
                            const keyToCopy = algoKey || algoData?.credential?.apiKey || '';
                            if (keyToCopy) {
                              await ExpoClipboard.setStringAsync(keyToCopy);
                              Alert.alert('Copied', 'Algo API Key copied to clipboard.');
                            }
                          }}
                          style={[
                            styles.apiBtn,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                              paddingHorizontal: 14,
                              height: 36,
                              justifyContent: 'center',
                              alignItems: 'center',
                            },
                          ]}
                        >
                          <Text style={[styles.apiBtnText, { color: theme.text, fontWeight: '700', textAlign: 'center', fontSize: 10 }]}>COPY</Text>
                        </Pressable>
                        <Pressable
                          onPress={handleRevokeAlgoConnect}
                          disabled={isRevokingAlgo}
                          style={{
                            height: 36,
                            paddingHorizontal: 12,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: 'rgba(239,68,68,0.3)',
                            backgroundColor: 'rgba(239,68,68,0.1)',
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          {isRevokingAlgo ? (
                            <ActivityIndicator size="small" color="#ef4444" />
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <SymbolView name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }} size={12} tintColor="#ef4444" />
                              <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Delete</Text>
                            </View>
                          )}
                        </Pressable>
                      </View>
                    </View>

                    {/* Algo House Client ID */}
                    <View style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <SymbolView name={{ ios: 'building.columns.fill', android: 'account_balance', web: 'account_balance' }} size={11} tintColor="#10b981" />
                        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: theme.textSecondary, textTransform: 'uppercase' }}>
                          ALGO HOUSE CLIENT ID
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[styles.apiKeyBox, { flex: 1, backgroundColor: isDark ? 'rgba(16,185,129,0.05)' : '#f0fdf4', borderColor: 'rgba(16,185,129,0.3)', borderWidth: 1 }]}>
                          <Text numberOfLines={1} style={[styles.apiKeyText, { color: '#10b981', fontFamily: 'monospace', fontSize: 12, fontWeight: '700' }]}>
                            {algoData?.houseClient?.id || algoData?.credential?.algoClientId || algoData?.houseClient?.externalClientId || '0247f4db-88cb-4a28-a742-dd08f4eef7d1'}
                          </Text>
                        </View>
                        <Pressable
                          onPress={async () => {
                            const clientIdToCopy = algoData?.houseClient?.id || algoData?.credential?.algoClientId || algoData?.houseClient?.externalClientId || '0247f4db-88cb-4a28-a742-dd08f4eef7d1';
                            if (clientIdToCopy) {
                              await ExpoClipboard.setStringAsync(clientIdToCopy);
                              Alert.alert('Copied', 'House Client ID copied to clipboard.');
                            }
                          }}
                          style={[
                            styles.apiBtn,
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                              paddingHorizontal: 14,
                              height: 36,
                              justifyContent: 'center',
                              alignItems: 'center',
                            },
                          ]}
                        >
                          <Text style={[styles.apiBtnText, { color: theme.text, fontWeight: '700', textAlign: 'center', fontSize: 10 }]}>COPY</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    <Text style={[styles.metaText, { color: theme.textSecondary, lineHeight: 16 }]}>
                      No Algo Connect key yet. Click Generate to create a dedicated Algo API Key for the Algo Trading Platform. A house hedging account will be automatically provisioned.
                    </Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.saveBtn,
                        {
                          height: 40,
                          marginTop: 6,
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.18)' : '#e0e7ff',
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#c7d2fe',
                        },
                        pressed && { opacity: 0.8 },
                      ]}
                      onPress={handleGenerateAlgoConnect}
                      disabled={isGeneratingAlgo}
                    >
                      {isGeneratingAlgo ? (
                        <ActivityIndicator size="small" color={isDark ? '#60a5fa' : '#1e1b4b'} />
                      ) : (
                        <Text style={[styles.saveBtnText, { color: isDark ? '#ffffff' : '#0f172a', fontWeight: '700' }]}>
                          + Generate Algo Connect Key
                        </Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </GlassyCard>
            ) : null}
          </View>
        ) : null}

        {/* ─── 3. REPORTS DETAIL ─── */}
        {activeSection === 'reports' ? (
          <View style={{ gap: 14 }}>
            {/* Filter Pills */}
            <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'flex-end' }}>
              {(['7d', '30d', '90d'] as const).map((tab) => (
                <Pressable
                  key={tab}
                  onPress={() => setActiveReportTab(tab)}
                  style={[styles.pillBtn, activeReportTab === tab && { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                >
                  <Text style={[styles.pillBtnText, { color: activeReportTab === tab ? theme.text : theme.textSecondary }]}>
                    {tab.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Metrics cards row */}
            <View style={styles.statsGrid}>
              <GlassyCard isDark={isDark} style={styles.statCard}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>TOTAL</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{isLoadingReports ? '—' : reportOrders.length || 4}</Text>
              </GlassyCard>
              <GlassyCard isDark={isDark} style={styles.statCard}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>FILL RATE</Text>
                <Text style={[styles.statValue, { color: '#10b981' }]}>{fillRateStr}%</Text>
              </GlassyCard>
              <GlassyCard isDark={isDark} style={styles.statCard}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>REJECTIONS</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{reportOrders.filter((o: any) => o.status === 'REJECTED').length}</Text>
              </GlassyCard>
            </View>

            <View style={styles.statsGrid}>
              <GlassyCard isDark={isDark} style={styles.statCard}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>TOTAL VOLUME</Text>
                <Text style={[styles.statValue, { color: theme.text }]}>{totalVolumeLots > 0 ? totalVolumeLots.toFixed(2) : '1.53'} lots</Text>
              </GlassyCard>
              <GlassyCard isDark={isDark} style={[styles.statCard, { flex: 2 }]}>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>CLOSED PNL</Text>
                <Text style={[styles.statValue, { color: closedPnlAmount >= 0 ? '#10b981' : '#ef4444', fontWeight: '800' }]}>
                  {closedPnlAmount >= 0 ? '+' : ''}${Math.abs(closedPnlAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </GlassyCard>
            </View>

            {/* P&L Trend Chart */}
            <PnlTrendReportChart
              pnlSeries={pnlSeriesData}
              period={activeReportTab.toUpperCase()}
              closedPnl={closedPnlAmount}
              isDark={isDark}
            />

            {/* Volume by Symbol Chart */}
            <VolumeBySymbolReportChart
              symbolData={symbolBreakdownData}
              isDark={isDark}
            />

            {/* Symbol Breakdown Cards List */}
            <View style={{ gap: 10 }}>
              <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 2 }]}>Symbol Breakdown</Text>
              
              {symbolBreakdownData.map((row: any) => (
                <GlassyCard key={row.symbol} isDark={isDark} style={styles.reportRowCard}>
                  <View style={styles.rowItemHeader}>
                    <Text style={[styles.symbolText, { color: theme.text }]}>{row.symbol}</Text>
                    <Text style={[styles.volumeValue, { color: theme.text }]}>{row.volume.toFixed(2)} lots</Text>
                  </View>
                  <View style={styles.txDivider} />
                  <View style={styles.rowGrid}>
                    <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>FILLED</Text><Text style={[styles.gridValue, { color: '#10b981' }]}>{row.filled}</Text></View>
                    <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>REJECTED</Text><Text style={[styles.gridValue, { color: row.rejected > 0 ? '#ef4444' : theme.text }]}>{row.rejected}</Text></View>
                  </View>
                </GlassyCard>
              ))}
            </View>

            {/* Client Activity Summary */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 2, marginBottom: 0 }]}>Client Activity</Text>
                <View style={[styles.statusActiveBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: theme.textSecondary }}>
                    {reportClients.length} {reportClients.length === 1 ? 'CLIENT' : 'CLIENTS'}
                  </Text>
                </View>
              </View>
              
              {reportClients.length === 0 ? (
                <GlassyCard isDark={isDark} style={styles.reportRowCard}>
                  <View style={styles.rowItemHeader}>
                    <View>
                      <Text style={[styles.clientIdText, { color: theme.text }]}>ABOOK_MASTER</Text>
                      <Text style={[styles.clientNameText, { color: theme.textSecondary }]}>Master Trading Client</Text>
                    </View>
                    <View style={styles.statusActiveBadge}>
                      <Text style={styles.statusActiveBadgeText}>● ACTIVE</Text>
                    </View>
                  </View>
                  <View style={styles.txDivider} />
                  <View style={styles.rowGrid}>
                    <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>TYPE</Text><Text style={[styles.gridValue, { color: theme.text }]}>STANDARD</Text></View>
                    <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>CURRENCY</Text><Text style={[styles.gridValue, { color: theme.text }]}>USD</Text></View>
                    <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>LEVERAGE</Text><Text style={[styles.gridValue, { color: theme.text }]}>1:100</Text></View>
                  </View>
                </GlassyCard>
              ) : (
                reportClients.map((c: any) => {
                  const clientCode = c.externalClientId || c.clientId || c.clientCode || (c.firstName ? `${c.firstName.toUpperCase()}_MASTER` : 'CLIENT_MASTER');
                  const clientName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Client Account';
                  const isActive = c.isActive !== false;
                  return (
                    <GlassyCard key={c.id || clientCode} isDark={isDark} style={styles.reportRowCard}>
                      <View style={styles.rowItemHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.clientIdText, { color: theme.text }]}>{clientCode}</Text>
                          <Text style={[styles.clientNameText, { color: theme.textSecondary }]}>{clientName}</Text>
                        </View>
                        <View style={[styles.statusActiveBadge, { backgroundColor: isActive ? '#10b98115' : 'rgba(128,128,128,0.1)' }]}>
                          <Text style={[styles.statusActiveBadgeText, { color: isActive ? '#10b981' : theme.textSecondary }]}>
                            ● {isActive ? 'ACTIVE' : 'OFF'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.txDivider} />
                      <View style={styles.rowGrid}>
                        <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>TYPE</Text><Text style={[styles.gridValue, { color: theme.text }]}>{(c.accountType || 'STANDARD').toUpperCase()}</Text></View>
                        <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>CURRENCY</Text><Text style={[styles.gridValue, { color: theme.text }]}>{c.currency || 'USD'}</Text></View>
                        <View style={{ flex: 1 }}><Text style={[styles.gridLabel, { color: theme.textSecondary }]}>LEVERAGE</Text><Text style={[styles.gridValue, { color: theme.text }]}>1:{c.leverage || '100'}</Text></View>
                      </View>
                    </GlassyCard>
                  );
                })
              )}
            </View>

            {/* Commission Summary */}
            <GlassyCard isDark={isDark} style={styles.detailCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>Commission Summary</Text>
                <Text style={[styles.boxValue, { color: theme.text, fontSize: 13 }]}>${totalCommAmount.toFixed(2)} <Text style={{ fontSize: 9, fontWeight: 'normal', color: theme.textSecondary }}>total earned</Text></Text>
              </View>

              <View style={styles.grid2Col}>
                <View style={styles.specBox}>
                  <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Per Trade Avg</Text>
                  <Text style={[styles.specValue, { color: '#3b82f6' }]}>${perTradeAvgStr}</Text>
                </View>
                <View style={styles.specBox}>
                  <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Spread Revenue</Text>
                  <Text style={[styles.specValue, { color: '#e879f9' }]}>${Number(spreadRevAmount).toFixed(2)}</Text>
                </View>
                <View style={styles.specBox}>
                  <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Active Clients</Text>
                  <Text style={[styles.specValue, { color: '#22c55e' }]}>{activeClientsCount}</Text>
                </View>
                <View style={styles.specBox}>
                  <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Fill Rate</Text>
                  <Text style={[styles.specValue, { color: '#fbbf24' }]}>{fillRateStr}%</Text>
                </View>
              </View>
            </GlassyCard>
          </View>
        ) : null}

        {/* ─── 4. BROKER SUPPORT DETAIL ─── */}
        {activeSection === 'support' ? (
          <View style={{ gap: 16, paddingBottom: 40 }}>
            
            {/* ─── A. TICKETS LIST VIEW ─── */}
            {supportView === 'list' ? (
              <GlassyCard isDark={isDark} style={styles.detailCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, fontSize: 18, marginBottom: 2 }]}>Broker Support Desk</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Get direct assistance from Super Admin support team</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setSupportView('create');
                      setSupportSubject('');
                      setSupportMessage('');
                    }}
                    style={({ pressed }) => [
                      {
                        backgroundColor: '#60cdf6',
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 6,
                        opacity: pressed ? 0.8 : 1,
                      }
                    ]}
                  >
                    <Text style={{ color: '#000', fontWeight: '700', fontSize: 12 }}>+ Raise Ticket</Text>
                  </Pressable>
                </View>

                {/* Stats Row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>Your Tickets ({supportStats.total})</Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, fontWeight: '600' }}>{supportStats.openCount} Open / {supportStats.resolvedCount} Resolved</Text>
                </View>

                {/* Tickets Scroll List */}
                {isLoadingTickets ? (
                  <View style={{ padding: 30, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#60cdf6" />
                  </View>
                ) : supportTickets.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
                    <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }} size={36} tintColor={theme.textSecondary} />
                    <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>No support tickets found. Click "+ Raise Ticket" to start.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                    {supportTickets.map((t) => {
                      const isSelected = selectedTicketId === t.id;
                      const statusColor = t.status === 'OPEN' ? '#f59e0b' : t.status === 'IN_PROGRESS' ? '#60cdf6' : '#10b981';
                      const categoryLabels: Record<string, string> = {
                        GENERAL: 'General Enquiry',
                        API_INTEGRATION: 'API & Algo Connect',
                        DEPOSIT_WITHDRAWAL: 'Deposit & Wallet',
                        EXECUTION: 'Order Execution',
                        BILLING: 'Spread & Charges'
                      };
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => {
                            setSelectedTicketId(t.id);
                            setSupportView('chat');
                            loadTicketDetails(t.id);
                          }}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            backgroundColor: 'rgba(255,255,255,0.02)',
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.04)',
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ color: '#60cdf6', fontWeight: '700', fontSize: 11, fontFamily: 'monospace' }}>{t.ticketNumber}</Text>
                              {Boolean(t.hasUnreadAdminReply) ? (
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6' }} />
                              ) : null}
                            </View>
                            <Text style={{ color: statusColor, fontWeight: '700', fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: `${statusColor}1A` }}>
                              {t.status}
                            </Text>
                          </View>
                          <Text style={{ color: theme.text, fontWeight: '600', fontSize: 13, marginBottom: 4 }} numberOfLines={1}>
                            {t.subject}
                          </Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{categoryLabels[t.category] || t.category}</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{new Date(t.lastMessageAt).toLocaleDateString()}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </GlassyCard>
            ) : null}

            {/* ─── B. CHAT / CONVERSATION VIEW ─── */}
            {supportView === 'chat' ? (
              <GlassyCard isDark={isDark} style={styles.detailCard}>
                {/* Back & Resolve Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingBottom: 10, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => {
                      setSupportView('list');
                      setSelectedTicketId(null);
                      setActiveTicket(null);
                      loadTickets().catch(() => {});
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={16} tintColor="#60cdf6" />
                    <Text style={{ color: '#60cdf6', fontWeight: '600', fontSize: 12 }}>Tickets</Text>
                  </Pressable>

                  {activeTicket && activeTicket.status !== 'RESOLVED' && activeTicket.status !== 'CLOSED' ? (
                    <Pressable
                      onPress={handleResolveTicket}
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: 'rgba(16,185,129,0.4)',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={10} tintColor="#10b981" />
                        <Text style={{ color: '#10b981', fontSize: 10, fontWeight: '700' }}>Mark Resolved</Text>
                      </View>
                    </Pressable>
                  ) : null}
                </View>

                {isLoadingActiveTicket ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#60cdf6" />
                  </View>
                ) : !activeTicket ? (
                  <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 12 }}>Failed to load chat thread.</Text>
                ) : (
                  <View style={{ flex: 1 }}>
                    {/* Ticket Context Header */}
                    <View style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 6, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{activeTicket.subject}</Text>
                        <Text style={{ color: '#60cdf6', fontWeight: '700', fontSize: 10, fontFamily: 'monospace' }}>{activeTicket.ticketNumber}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 9, paddingHorizontal: 4, paddingVertical: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                          {activeTicket.priority}
                        </Text>
                      </View>
                      <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4 }}>
                        Category: {activeTicket.category} • Created: {new Date(activeTicket.createdAt).toLocaleDateString()}
                      </Text>
                    </View>

                    {/* Messages Scroll Area */}
                    <ScrollView
                      style={{ maxHeight: 280, minHeight: 180, marginBottom: 12 }}
                      showsVerticalScrollIndicator={true}
                    >
                      {activeTicket.messages?.map((msg: any) => {
                        const isBroker = msg.senderType === 'BROKER';
                        return (
                          <View
                            key={msg.id}
                            style={{
                              alignSelf: isBroker ? 'flex-end' : 'flex-start',
                              maxWidth: '85%',
                              marginBottom: 10,
                            }}
                          >
                            <Text style={{ fontSize: 9, color: theme.textSecondary, marginBottom: 2, textAlign: isBroker ? 'right' : 'left' }}>
                              {msg.senderName} • {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                            <View
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                                borderTopRightRadius: isBroker ? 2 : 10,
                                borderTopLeftRadius: isBroker ? 10 : 2,
                                backgroundColor: isBroker ? '#60cdf6' : 'rgba(255,255,255,0.06)',
                              }}
                            >
                              <Text style={{ color: isBroker ? '#000' : theme.text, fontSize: 12, lineHeight: 16 }}>
                                {msg.content}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>

                    {/* Input Reply Box */}
                    {activeTicket.status !== 'RESOLVED' && activeTicket.status !== 'CLOSED' ? (
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              flex: 1,
                              height: 40,
                              color: theme.text,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                              fontSize: 13,
                              letterSpacing: 0,
                              fontWeight: '400',
                            },
                          ]}
                          value={replyText}
                          onChangeText={setReplyText}
                          placeholder="Type your message reply here..."
                          placeholderTextColor={theme.textSecondary}
                        />
                        <Pressable
                          onPress={handleSendReply}
                          disabled={isSendingReply || !replyText.trim()}
                          style={{
                            backgroundColor: '#3b82f6',
                            paddingHorizontal: 14,
                            height: 40,
                            borderRadius: 8,
                            justifyContent: 'center',
                            alignItems: 'center',
                            opacity: isSendingReply || !replyText.trim() ? 0.6 : 1,
                          }}
                        >
                          {isSendingReply ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>Send</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : (
                      <View style={{ padding: 10, backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 6, alignItems: 'center' }}>
                        <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '600' }}>This ticket has been marked as resolved.</Text>
                      </View>
                    )}
                  </View>
                )}
              </GlassyCard>
            ) : null}

            {/* ─── C. RAISE TICKET FORM VIEW ─── */}
            {supportView === 'create' ? (
              <GlassyCard isDark={isDark} style={styles.detailCard}>
                <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, fontSize: 18, marginBottom: 12 }]}>Raise Support Ticket</Text>

                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Subject / Issue Title *</Text>
                  <TextInput
                    style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    value={supportSubject}
                    onChangeText={setSupportSubject}
                    placeholder="Brief description of your issue"
                    placeholderTextColor={theme.textSecondary}
                  />
                </View>

                {/* Category Custom Selector */}
                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Category</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {[
                      { key: 'GENERAL', label: 'General Enquiry' },
                      { key: 'API_INTEGRATION', label: 'API & Algo Connect' },
                      { key: 'DEPOSIT_WITHDRAWAL', label: 'Deposit & Wallet' },
                      { key: 'EXECUTION', label: 'Order Execution' },
                      { key: 'BILLING', label: 'Spread & Charges' }
                    ].map((c) => {
                      const isActive = supportCategory === c.key;
                      return (
                        <Pressable
                          key={c.key}
                          onPress={() => setSupportCategory(c.key)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: isActive ? '#3b82f6' : 'rgba(255,255,255,0.03)',
                            borderWidth: 1,
                            borderColor: isActive ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                          }}
                        >
                          <Text style={{ color: isActive ? '#fff' : theme.textSecondary, fontSize: 10, fontWeight: '600' }}>
                            {c.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Priority Custom Selector */}
                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Priority</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => {
                      const isActive = supportPriority === p;
                      const displayNames: Record<string, string> = {
                        LOW: 'Low',
                        MEDIUM: 'Medium',
                        HIGH: 'High',
                        URGENT: 'Urgent'
                      };
                      return (
                        <Pressable
                          key={p}
                          onPress={() => setSupportPriority(p)}
                          style={{
                            flex: 1,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: isActive ? '#3b82f6' : 'rgba(255,255,255,0.03)',
                            borderWidth: 1,
                            borderColor: isActive ? '#3b82f6' : 'rgba(255,255,255,0.06)',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: isActive ? '#fff' : theme.textSecondary, fontSize: 10, fontWeight: '700' }}>
                            {displayNames[p]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Detailed Description *</Text>
                  <TextInput
                    style={[styles.input, { height: 80, color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                    value={supportMessage}
                    onChangeText={setSupportMessage}
                    placeholder="Provide full details, timestamps, or steps to reproduce..."
                    placeholderTextColor={theme.textSecondary}
                    multiline
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <Pressable
                    onPress={() => setSupportView('list')}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 6,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: theme.textSecondary, fontWeight: '700', fontSize: 12 }}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      {
                        flex: 2,
                        backgroundColor: '#60cdf6',
                        paddingVertical: 10,
                        borderRadius: 6,
                        opacity: pressed || isSubmittingSupport ? 0.8 : 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }
                    ]}
                    onPress={handleSupportSubmit}
                    disabled={isSubmittingSupport}
                  >
                    {isSubmittingSupport ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={{ color: '#000', fontWeight: '700', fontSize: 12 }}>Submit Support Ticket</Text>
                    )}
                  </Pressable>
                </View>
              </GlassyCard>
            ) : null}

          </View>
        ) : null}


        {/* ─── 5. BROKER SETTINGS ─── */}
        {activeSection === 'settings' ? (
          <View style={{ gap: 24, paddingBottom: 40 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, fontSize: 24, marginBottom: 0 }]}>Broker Settings</Text>
              <View style={[styles.statusActiveBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Text style={[styles.statusActiveBadgeText, { color: '#10b981' }]}>APPROVED</Text>
              </View>
            </View>

            {/* Tab Bar */}
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                <Pressable
                  style={[styles.settingsTab, activeSettingsTab === 'personal' && [styles.settingsTabActive, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff' }]]}
                  onPress={() => setActiveSettingsTab('personal')}
                >
                  <SymbolView name={{ ios: 'building.2', android: 'domain', web: 'domain' }} size={14} tintColor={activeSettingsTab === 'personal' ? '#3b82f6' : theme.textSecondary} />
                  <Text style={[styles.settingsTabText, { color: activeSettingsTab === 'personal' ? (isDark ? '#bfdbfe' : '#1e40af') : theme.textSecondary, fontWeight: activeSettingsTab === 'personal' ? '700' : '600' }]}>Personal & Company</Text>
                </Pressable>

                <Pressable
                  style={[styles.settingsTab, activeSettingsTab === 'security' && [styles.settingsTabActive, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff' }]]}
                  onPress={() => setActiveSettingsTab('security')}
                >
                  <SymbolView name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={14} tintColor={activeSettingsTab === 'security' ? '#3b82f6' : theme.textSecondary} />
                  <Text style={[styles.settingsTabText, { color: activeSettingsTab === 'security' ? (isDark ? '#bfdbfe' : '#1e40af') : theme.textSecondary, fontWeight: activeSettingsTab === 'security' ? '700' : '600' }]}>Security</Text>
                  <View style={{ backgroundColor: is2FAActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4 }}>
                    <Text style={{ fontSize: 9, color: is2FAActive ? '#10b981' : '#ef4444', fontWeight: '800' }}>{is2FAActive ? '2FA ON' : '2FA OFF'}</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[styles.settingsTab, activeSettingsTab === 'kyc' && [styles.settingsTabActive, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff' }]]}
                  onPress={() => setActiveSettingsTab('kyc')}
                >
                  <SymbolView name={{ ios: 'doc.text', android: 'description', web: 'description' }} size={14} tintColor={activeSettingsTab === 'kyc' ? '#3b82f6' : theme.textSecondary} />
                  <Text style={[styles.settingsTabText, { color: activeSettingsTab === 'kyc' ? (isDark ? '#bfdbfe' : '#1e40af') : theme.textSecondary, fontWeight: activeSettingsTab === 'kyc' ? '700' : '600' }]}>KYC</Text>
                  <View style={{ backgroundColor: activeSettingsTab === 'kyc' ? 'rgba(59, 130, 246, 0.2)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 4 }}>
                    <Text style={{ fontSize: 10, color: activeSettingsTab === 'kyc' ? '#3b82f6' : theme.textSecondary, fontWeight: '800' }}>{kycData?.length || 2}</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[styles.settingsTab, activeSettingsTab === 'theme' && [styles.settingsTabActive, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff' }]]}
                  onPress={() => setActiveSettingsTab('theme')}
                >
                  <SymbolView name={{ ios: 'paintbrush', android: 'palette', web: 'palette' }} size={14} tintColor={activeSettingsTab === 'theme' ? '#3b82f6' : theme.textSecondary} />
                  <Text style={[styles.settingsTabText, { color: activeSettingsTab === 'theme' ? (isDark ? '#bfdbfe' : '#1e40af') : theme.textSecondary, fontWeight: activeSettingsTab === 'theme' ? '700' : '600' }]}>Theme & Preferences</Text>
                </Pressable>
              </ScrollView>
            </View>

            {/* Content Area */}
            {activeSettingsTab === 'personal' ? (
              profileData ? (
                <GlassyCard isDark={isDark} style={{ padding: 20, gap: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <SymbolView name={{ ios: 'building.2', android: 'domain', web: 'domain' }} size={16} tintColor="#3b82f6" />
                    <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, marginBottom: 0 }]}>Personal & Company Details</Text>
                  </View>

                <View style={{ gap: 14 }}>
                  {/* COMPANY NAME */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'building.2', android: 'apartment', web: 'apartment' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>COMPANY NAME</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      value={profileData.companyName || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, companyName: val })}
                      placeholder="Company Name"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* EMAIL ADDRESS */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'envelope', android: 'mail', web: 'mail' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>EMAIL ADDRESS</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.textSecondary, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.04)', borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}
                      value={profileData.emailAddress || ''}
                      editable={false}
                    />
                  </View>

                  {/* PRIMARY CONTACT NAME */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'person', android: 'person', web: 'person' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>PRIMARY CONTACT NAME</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      value={profileData.primaryContactName || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, primaryContactName: val })}
                      placeholder="Primary contact name"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* UPDATE MOBILE / PHONE NUMBER */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'phone', android: 'phone', web: 'phone' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>UPDATE MOBILE / PHONE NUMBER</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      value={profileData.updateMobile || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, updateMobile: val })}
                      placeholder="Phone number"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* CIN / CORPORATE TAX ID */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textSecondary }}>#</Text>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CIN / CORPORATE TAX ID</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      value={profileData.cin || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, cin: val })}
                      placeholder="Corporate Tax ID"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* CORPORATE NO. / REG LICENSE */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'rosette', android: 'verified', web: 'verified' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CORPORATE NO. / REG LICENSE</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      value={profileData.corporateNo || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, corporateNo: val })}
                      placeholder="e.g. ASIC-489201 / SEBI-INZ0002"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* ENTITY TYPE */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'building.columns', android: 'account_balance', web: 'account_balance' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>ENTITY TYPE</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      value={profileData.entityType || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, entityType: val })}
                      placeholder="e.g. Private Limited Company"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* REGISTERED COUNTRY */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'globe', android: 'public', web: 'public' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>REGISTERED COUNTRY</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      value={profileData.registeredCountry || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, registeredCountry: val })}
                      placeholder="India"
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* FULL REGISTERED ADDRESS / HEADQUARTERS */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <SymbolView name={{ ios: 'location', android: 'place', web: 'place' }} size={12} tintColor={theme.textSecondary} />
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>FULL REGISTERED ADDRESS / HEADQUARTERS</Text>
                    </View>
                    <TextInput
                      style={[styles.input, { height: 75, textAlignVertical: 'top', color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                      multiline
                      value={profileData.registeredAddress || ''}
                      onChangeText={(val) => setProfileData({ ...profileData, registeredAddress: val })}
                      placeholder="Enter complete physical registered address..."
                      placeholderTextColor={theme.textSecondary}
                    />
                  </View>

                  {/* Footer Action */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Text style={{ fontSize: 9.5, color: theme.textSecondary, fontWeight: '500' }}>Last modified: {profileData.lastModified || 'N/A'}</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.submitBtn,
                        {
                          backgroundColor: '#3b82f6',
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          height: 32,
                          borderRadius: 6,
                          opacity: pressed || isSavingProfile ? 0.8 : 1,
                        },
                      ]}
                      onPress={handleSaveProfile}
                      disabled={isSavingProfile}
                    >
                      {isSavingProfile ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                          <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={11} tintColor="#ffffff" />
                          <Text style={[styles.submitBtnText, { color: '#ffffff', fontSize: 11, fontWeight: '700' }]}>
                            Save Details
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                </View>
              </GlassyCard>
              ) : (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                </View>
              )
            ) : null}

            {activeSettingsTab === 'security' ? (
              securityData ? (
                <View style={{ gap: 20 }}>
                  {/* 2FA Card */}
                  <GlassyCard isDark={isDark} style={{ padding: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} size={18} tintColor="#3b82f6" />
                      <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, marginBottom: 0 }]}>Two-Step Verification</Text>
                    </View>
                    <View style={{ backgroundColor: is2FAActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: is2FAActive ? '#10b981' : '#ef4444', fontWeight: '800' }}>{is2FAActive ? 'ENABLED' : 'DISABLED'}</Text>
                    </View>
                  </View>

                  {!isSetup2FA ? (
                    is2FAActive ? (
                      <View style={{ gap: 14 }}>
                        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 20 }}>
                          Two-Factor Authentication is currently active on your broker account. Enter your 6-digit code from Google Authenticator / Authy to disable 2FA.
                        </Text>
                        
                        <View style={{ gap: 6 }}>
                          <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>ENTER 2FA CODE TO DISABLE</Text>
                          <TextInput
                            style={[
                              styles.input,
                              {
                                textAlign: 'center',
                                fontSize: 20,
                                fontWeight: '700',
                                letterSpacing: 6,
                                color: theme.text,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
                                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                height: 50,
                              },
                            ]}
                            placeholder="0 0 0 0 0 0"
                            placeholderTextColor={theme.textSecondary}
                            keyboardType="numeric"
                            maxLength={6}
                            value={disable2FaCode}
                            onChangeText={setDisable2FaCode}
                          />
                        </View>

                        <Pressable
                          style={[styles.submitBtn, { backgroundColor: '#ef4444', borderWidth: 0, marginTop: 4 }]}
                          onPress={handleDisable2FA}
                          disabled={isDisabling2FA}
                        >
                          {isDisabling2FA ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={[styles.submitBtnText, { color: '#ffffff' }]}>Disable 2FA</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : (
                      <>
                        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 20 }}>
                          Protect your broker profile from unauthorized access. Enabling Two-Factor Authentication requires a unique 6-digit code from an Authenticator app to confirm crypto withdrawals.
                        </Text>
                        <Pressable style={[styles.submitBtn, { backgroundColor: isDark ? '#3b82f6' : '#2563eb' }]} onPress={start2FASetup}>
                          <Text style={[styles.submitBtnText, { color: '#ffffff' }]}>Enable 2FA</Text>
                        </Pressable>
                      </>
                    )
                  ) : (
                    <View style={{ gap: 16, marginTop: 4 }}>
                      {/* Dynamic QR Code */}
                      <View style={{ alignItems: 'center', marginVertical: 8 }}>
                        <View style={{ padding: 14, backgroundColor: '#ffffff', borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}>
                          {isLoading2FASetup ? (
                            <View style={{ width: 150, height: 150, justifyContent: 'center', alignItems: 'center' }}>
                              <ActivityIndicator size="large" color="#3b82f6" />
                            </View>
                          ) : (
                            <QRCode
                              value={twoFaSecretData?.otpauthUrl || 'otpauth://totp/PrimeLiquidFX:broker@primeliquidfx.com?secret=TLCQA4ZMET46LRMJ&issuer=PrimeLiquidFX'}
                              size={150}
                              backgroundColor="#ffffff"
                              color="#000000"
                            />
                          )}
                        </View>
                      </View>

                      {/* Manual Secret Key */}
                      <View style={{ gap: 6 }}>
                        <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>MANUAL SECRET KEY</Text>
                        <Pressable
                          style={({ pressed }) => [
                            {
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                              padding: 14,
                              borderRadius: 8,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderWidth: 1,
                              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                              flexDirection: 'row',
                              gap: 8,
                            },
                            pressed && { opacity: 0.8 },
                          ]}
                          onPress={async () => {
                            const raw = twoFaSecretData?.secret || 'TLCQA4ZMET46LRMJ';
                            await ExpoClipboard.setStringAsync(raw);
                            Alert.alert('Copied', `Secret key ${twoFaSecretData?.formattedSecret || raw} copied to clipboard.`);
                          }}
                        >
                          <Text style={{ color: '#3b82f6', fontSize: 17, fontWeight: '700', letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                            {twoFaSecretData?.formattedSecret || 'TLCQ A4ZM ET46 LRMJ'}
                          </Text>
                          <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={14} tintColor="#3b82f6" />
                        </Pressable>
                      </View>

                      {/* 6-Digit Code Input */}
                      <View style={{ gap: 6, marginTop: 4 }}>
                        <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>ENTER 6-DIGIT CODE</Text>
                        <TextInput
                          style={[
                            styles.input,
                            {
                              textAlign: 'center',
                              fontSize: 22,
                              fontWeight: '700',
                              letterSpacing: 8,
                              color: theme.text,
                              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)',
                              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                              height: 54,
                            },
                          ]}
                          placeholder="0 0 0 0 0 0"
                          placeholderTextColor={theme.textSecondary}
                          keyboardType="numeric"
                          maxLength={6}
                          value={twoFaCode}
                          onChangeText={setTwoFaCode}
                        />
                      </View>

                      {/* Action Buttons */}
                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                        <Pressable
                          style={[styles.submitBtn, { flex: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6' }]}
                          onPress={() => {
                            setIsSetup2FA(false);
                            setTwoFaCode('');
                          }}
                        >
                          <Text style={[styles.submitBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.submitBtn, { flex: 1, backgroundColor: '#3b82f6' }]}
                          onPress={handleVerify2FA}
                          disabled={isUpdating2FA}
                        >
                          {isUpdating2FA ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={[styles.submitBtnText, { color: '#ffffff' }]}>Verify</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )}
                </GlassyCard>

                {/* Password Card */}
                <GlassyCard isDark={isDark} style={{ padding: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <SymbolView name={{ ios: 'key.fill', android: 'vpn_key', web: 'vpn_key' }} size={16} tintColor="#10b981" />
                    <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, marginBottom: 0 }]}>Change Password</Text>
                  </View>

                  <View style={{ gap: 16 }}>
                    <View style={{ gap: 6 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CURRENT PASSWORD</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        placeholder="Enter current password"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                      />
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>NEW PASSWORD</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        placeholder="Min 8 chars"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry
                        value={newPassword}
                        onChangeText={setNewPassword}
                      />
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CONFIRM NEW PASSWORD</Text>
                      <TextInput
                        style={[styles.input, { color: theme.text, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
                        placeholder="Repeat new password"
                        placeholderTextColor={theme.textSecondary}
                        secureTextEntry
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                      />
                    </View>
                    <Pressable style={[styles.submitBtn, { backgroundColor: isDark ? '#10b981' : '#059669', marginTop: 10 }]} onPress={handleUpdatePassword} disabled={isUpdatingPassword}>
                      {isUpdatingPassword ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={[styles.submitBtnText, { color: '#ffffff' }]}>Update Password</Text>}
                    </Pressable>
                  </View>
                </GlassyCard>
              </View>
              ) : (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                </View>
              )
            ) : null}

            {activeSettingsTab === 'kyc' ? (
              kycData ? (
              <View style={{ gap: 20 }}>
                <GlassyCard isDark={isDark} style={{ padding: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <SymbolView name={{ ios: 'doc.text.fill', android: 'description', web: 'description' }} size={18} tintColor="#3b82f6" />
                      <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, marginBottom: 0 }]}>KYC Documents</Text>
                    </View>
                    <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
                      <Text style={{ fontSize: 10, color: '#10b981', fontWeight: '800' }}>VERIFIED</Text>
                    </View>
                  </View>

                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginBottom: 12 }]}>CURRENT FILES ({kycData.length})</Text>
                  
                  <View style={{ gap: 12, marginBottom: 24 }}>
                    {kycData.map(doc => (
                      <View key={doc.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)', padding: 16, borderRadius: 12, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                          <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', padding: 10, borderRadius: 8 }}>
                            <SymbolView name={{ ios: 'doc.fill', android: 'description', web: 'description' }} size={18} tintColor="#3b82f6" />
                          </View>
                          <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{doc.type}</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>{doc.date}</Text>
                          </View>
                        </View>
                        <Pressable
                          style={({ pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#eff6ff',
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 8,
                            opacity: pressed ? 0.7 : 1,
                          })}
                          onPress={() => {
                            setImageLoadFailed(false);
                            setIsDocImageLoading(!!doc.url);
                            setViewingDoc(doc);
                          }}
                        >
                          <SymbolView name={{ ios: 'eye.fill', android: 'visibility', web: 'visibility' }} size={14} tintColor="#3b82f6" />
                          <Text style={{ color: '#3b82f6', fontWeight: '700', fontSize: 12 }}>View</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </GlassyCard>

                <GlassyCard isDark={isDark} style={{ padding: 20 }}>
                  <Text style={[styles.fieldLabel, { color: theme.text, fontSize: 14, marginBottom: 16 }]}>Upload New Document</Text>
                  
                  <View style={{ gap: 16 }}>
                    {/* Document Classification Dropdown */}
                    <View style={{ gap: 6, zIndex: 50 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>DOCUMENT CLASSIFICATION</Text>
                      <Pressable
                        onPress={() => setIsKycDropdownOpen(!isKycDropdownOpen)}
                        style={({ pressed }) => [
                          styles.dropdownTrigger,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                            borderColor: isKycDropdownOpen ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.dropdownSelectedText, { color: theme.text }]}>
                          {kycDocType || 'Select Document Classification'}
                        </Text>
                        <SymbolView
                          name={{ ios: isKycDropdownOpen ? 'chevron.up' : 'chevron.down', android: isKycDropdownOpen ? 'expand_less' : 'expand_more', web: isKycDropdownOpen ? 'expand_less' : 'expand_more' }}
                          size={14}
                          tintColor={theme.textSecondary}
                        />
                      </Pressable>

                      {isKycDropdownOpen ? (
                        <View
                          style={[
                            styles.dropdownMenu,
                            {
                              backgroundColor: isDark ? '#232530' : '#ffffff',
                              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                            },
                          ]}
                        >
                          {KYC_DOCUMENT_OPTIONS.map((opt) => {
                            const isSelected = kycDocType === opt;
                            return (
                              <Pressable
                                key={opt}
                                onPress={() => {
                                  setKycDocType(opt);
                                  setIsKycDropdownOpen(false);
                                }}
                                style={({ pressed }) => [
                                  styles.dropdownOptionItem,
                                  {
                                    backgroundColor: isSelected
                                      ? (isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.08)')
                                      : (pressed ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') : 'transparent'),
                                  },
                                ]}
                              >
                                <View style={{ width: 18, alignItems: 'center' }}>
                                  {isSelected ? (
                                    <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor={isDark ? '#ffffff' : '#3b82f6'} />
                                  ) : null}
                                </View>
                                <Text
                                  style={[
                                    styles.dropdownOptionText,
                                    {
                                      color: isSelected ? (isDark ? '#ffffff' : '#3b82f6') : (isDark ? '#e2e8f0' : '#1e293b'),
                                      fontWeight: isSelected ? '700' : '500',
                                    },
                                  ]}
                                >
                                  {opt}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>

                    {/* Choose / Pick Image File Box */}
                    <View style={{ gap: 6 }}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>CHOOSE DOCUMENT FILE (PDF, PNG, JPG MAX 10MB)</Text>
                      {selectedKycFile ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: isDark ? 'rgba(59, 130, 246, 0.1)' : '#eff6ff', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                          <Image source={{ uri: selectedKycFile.uri }} style={{ width: 44, height: 44, borderRadius: 6 }} resizeMode="cover" />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
                              {selectedKycFile.name || 'Selected Document File'}
                            </Text>
                            <Text style={{ color: '#3b82f6', fontSize: 10, marginTop: 2, fontWeight: '600' }}>
                              {selectedKycFile.fileSize ? `${(selectedKycFile.fileSize / 1024 / 1024).toFixed(2)} MB • Ready to upload` : 'Ready to upload'}
                            </Text>
                          </View>
                          <Pressable onPress={() => setSelectedKycFile(null)} style={{ padding: 6 }}>
                            <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 11 }}>Remove</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          onPress={handlePickKycFile}
                          style={({ pressed }) => ({
                            borderWidth: 1.5,
                            borderStyle: 'dashed',
                            borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                            borderRadius: 12,
                            paddingVertical: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <SymbolView name={{ ios: 'doc.badge.plus', android: 'note_add', web: 'note_add' }} size={24} tintColor="#3b82f6" />
                          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>
                            Choose Document File
                          </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 10 }}>
                            Supports PDF, PNG, JPG (Max 10MB)
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    
                    <Pressable style={[styles.submitBtn, { backgroundColor: '#3b82f6', marginTop: 6 }]} onPress={handleUploadKYC} disabled={isUploadingKYC}>
                      {isUploadingKYC ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={[styles.submitBtnText, { color: '#ffffff' }]}>Upload Document</Text>}
                    </Pressable>
                  </View>
                </GlassyCard>
              </View>
              ) : (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                </View>
              )
            ) : null}

            {activeSettingsTab === 'theme' ? (
              preferencesData ? (
              <View style={{ gap: 20 }}>
                {/* Theme Card */}
                <GlassyCard isDark={isDark} style={{ padding: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <SymbolView name={{ ios: 'paintbrush.fill', android: 'palette', web: 'palette' }} size={16} tintColor="#f59e0b" />
                    <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, marginBottom: 0 }]}>Appearance Mode</Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable
                      style={[{ flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: isDark ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'), backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.6)' }]}
                      onPress={() => updatePlatformSettings({ isDarkMode: true })}
                    >
                      <SymbolView name={{ ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' }} size={24} tintColor={isDark ? '#3b82f6' : theme.textSecondary} />
                      <Text style={{ color: isDark ? '#3b82f6' : theme.text, fontWeight: '700', fontSize: 14, marginTop: 4 }}>Dark</Text>
                    </Pressable>

                    <Pressable
                      style={[{ flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: !isDark ? '#f59e0b' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'), backgroundColor: !isDark ? 'rgba(245, 158, 11, 0.15)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)') }]}
                      onPress={() => updatePlatformSettings({ isDarkMode: false })}
                    >
                      <SymbolView name={{ ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' }} size={24} tintColor={!isDark ? '#f59e0b' : theme.textSecondary} />
                      <Text style={{ color: !isDark ? '#f59e0b' : theme.text, fontWeight: '700', fontSize: 14, marginTop: 4 }}>Light</Text>
                    </Pressable>
                  </View>
                </GlassyCard>

                {/* Notifications Card */}
                <GlassyCard isDark={isDark} style={{ padding: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <SymbolView name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} size={16} tintColor="#3b82f6" />
                    <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, marginBottom: 0 }]}>Notifications</Text>
                  </View>

                  <View style={{ gap: 24 }}>
                    <Pressable style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }} onPress={() => toggleNotification('orderFills')}>
                      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: preferencesData?.notifications?.orderFills ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.05)' : 'transparent'), alignItems: 'center', justifyContent: 'center', borderWidth: preferencesData?.notifications?.orderFills ? 0 : 2, borderColor: theme.textSecondary }}>
                         {preferencesData?.notifications?.orderFills ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor="#ffffff" /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Order Fills & Margin</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>Instant email alerts when trades execute.</Text>
                      </View>
                    </Pressable>

                    <Pressable style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }} onPress={() => toggleNotification('deposits')}>
                      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: preferencesData?.notifications?.deposits ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.05)' : 'transparent'), alignItems: 'center', justifyContent: 'center', borderWidth: preferencesData?.notifications?.deposits ? 0 : 2, borderColor: theme.textSecondary }}>
                         {preferencesData?.notifications?.deposits ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor="#ffffff" /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Deposits & Withdrawals</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>Alerts for wallet balance changes.</Text>
                      </View>
                    </Pressable>

                    <Pressable style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }} onPress={() => toggleNotification('weeklyDigest')}>
                      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: preferencesData?.notifications?.weeklyDigest ? '#3b82f6' : (isDark ? 'rgba(255,255,255,0.05)' : 'transparent'), alignItems: 'center', justifyContent: 'center', borderWidth: preferencesData?.notifications?.weeklyDigest ? 0 : 2, borderColor: theme.textSecondary }}>
                         {preferencesData?.notifications?.weeklyDigest ? <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor="#ffffff" /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Weekly Digest</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>Receive a summary of platform activity.</Text>
                      </View>
                    </Pressable>
                  </View>
                </GlassyCard>
              </View>
              ) : (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#f59e0b" />
                </View>
              )
            ) : null}

          </View>
        ) : null}

        {/* ─── 6. BROKER NOTIFICATIONS ─── */}
        {activeSection === 'notifications' ? (
          <GlassyCard isDark={isDark} style={styles.detailCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <View style={[styles.iconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <SymbolView name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} size={16} tintColor="#3b82f6" />
              </View>
              <Text style={[styles.sectionTitle, { color: theme.text, paddingLeft: 0, marginBottom: 0 }]}>Recent Notifications</Text>
            </View>

            {isLoadingNotifs ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#60cdf6" />
              </View>
            ) : notifications.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
                <SymbolView name={{ ios: 'bell.slash.fill', android: 'notifications_off', web: 'notifications_off' }} size={32} tintColor={theme.textSecondary} />
                <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>No notifications found.</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {notifications.map((notif) => {
                  let notifIcon = 'bell.fill';
                  let notifColor = '#3b82f6';
                  let bgAlpha = 'rgba(59, 130, 246, 0.12)';

                  if (notif.type === 'SUPPORT') {
                    notifIcon = 'headphones';
                    notifColor = '#a855f7';
                    bgAlpha = 'rgba(168, 85, 247, 0.12)';
                  } else if (notif.type === 'DEPOSIT') {
                    notifIcon = 'arrow.down.circle.fill';
                    notifColor = '#10b981';
                    bgAlpha = 'rgba(16, 185, 129, 0.12)';
                  } else if (notif.type === 'WITHDRAWAL') {
                    notifIcon = 'arrow.up.circle.fill';
                    notifColor = '#ef4444';
                    bgAlpha = 'rgba(239, 68, 68, 0.12)';
                  }

                  const formattedDate = new Date(notif.createdAt).toLocaleString(undefined, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });

                  return (
                    <Pressable
                      key={notif.id}
                      onPress={() => {
                        if (notif.type === 'SUPPORT') {
                          const ticketId = notif.id.replace('support_', '');
                          setSelectedTicketId(ticketId);
                          setActiveSection('support');
                          setSupportView('chat');
                          loadTicketDetails(ticketId);
                        } else if (notif.type === 'DEPOSIT' || notif.type === 'WITHDRAWAL') {
                          setActiveSection('wallet');
                          setWalletSub('none');
                        }
                      }}
                      style={({ pressed }) => [
                        {
                          flexDirection: 'row',
                          gap: 12,
                          padding: 12,
                          borderRadius: 8,
                          backgroundColor: 'rgba(255,255,255,0.02)',
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.04)',
                          opacity: pressed ? 0.8 : 1,
                        }
                      ]}
                    >
                      <View style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: bgAlpha,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <SymbolView name={{ ios: notifIcon, android: notif.type === 'SUPPORT' ? 'support_agent' : notif.type === 'DEPOSIT' ? 'arrow_downward' : notif.type === 'WITHDRAWAL' ? 'arrow_upward' : 'notifications', web: notif.type === 'SUPPORT' ? 'support_agent' : notif.type === 'DEPOSIT' ? 'arrow_downward' : notif.type === 'WITHDRAWAL' ? 'arrow_upward' : 'notifications' } as any} size={16} tintColor={notifColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{notif.title}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{notif.message}</Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 10, marginTop: 4 }}>{formattedDate}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </GlassyCard>
        ) : null}      </ScrollView>

      {/* ─── KYC Document Preview Modal ─── */}
      <Modal
        visible={!!viewingDoc}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setViewingDoc(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setViewingDoc(null)} />
          <View
            style={[
              styles.docModalContent,
              {
                backgroundColor: isDark ? '#16161f' : '#ffffff',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
              },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.docModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', padding: 8, borderRadius: 8 }}>
                  <SymbolView name={{ ios: 'doc.text.fill', android: 'description', web: 'description' }} size={18} tintColor="#3b82f6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docModalTitle, { color: theme.text }]} numberOfLines={1}>
                    {viewingDoc?.type || 'KYC Document'}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>
                    Uploaded on {viewingDoc?.date || new Date().toLocaleDateString('en-GB')} • Verified
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setViewingDoc(null)}
                style={styles.docModalCloseBtn}
              >
                <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={14} tintColor={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Document Image Preview */}
            <View style={styles.docImageContainer}>
              {Boolean(viewingDoc?.url || (viewingDoc?.key ? api.getCachedKycImage(viewingDoc.key) : undefined) || (viewingDoc?.type ? api.getCachedKycImage(viewingDoc.type) : undefined)) && !imageLoadFailed ? (
                <>
                  <ExpoImage
                    source={{ uri: (viewingDoc?.url || (viewingDoc?.key ? api.getCachedKycImage(viewingDoc.key) : undefined) || (viewingDoc?.type ? api.getCachedKycImage(viewingDoc.type) : undefined)) as string }}
                    style={styles.docImage}
                    contentFit="contain"
                    priority="high"
                    cachePolicy="memory-disk"
                    transition={150}
                    onLoadStart={() => setIsDocImageLoading(true)}
                    onLoadEnd={() => setIsDocImageLoading(false)}
                    onError={() => {
                      setIsDocImageLoading(false);
                      setImageLoadFailed(true);
                    }}
                  />
                  {isDocImageLoading ? (
                    <View style={[StyleSheet.absoluteFill, styles.docImageLoadingOverlay]}>
                      <ActivityIndicator size="large" color="#3b82f6" />
                      <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '700', marginTop: 10 }}>
                        Loading document image...
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={[styles.docImagePlaceholder, { backgroundColor: isDark ? '#0f0f15' : '#f8fafc', padding: 24 }]}>
                  <View style={{ width: 68, height: 68, borderRadius: 20, backgroundColor: 'rgba(59, 130, 246, 0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                    <SymbolView name={{ ios: 'doc.text.fill', android: 'description', web: 'description' }} size={36} tintColor="#3b82f6" />
                  </View>
                  <Text style={{ color: theme.text, fontWeight: '800', fontSize: 17, textAlign: 'center' }}>
                    {viewingDoc?.type || 'KYC Document'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                    <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} size={12} tintColor="#10b981" />
                    <Text style={{ color: '#10b981', fontSize: 12, fontWeight: '700' }}>
                      Compliance Verification Active
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8, lineHeight: 16, maxWidth: 260 }}>
                    Official KYC document file on record. Upload a new photo below anytime to update.
                  </Text>
                </View>
              )}
              {/* Verified Badge Overlay */}
              {!isDocImageLoading ? (
                <View style={styles.docVerifiedBadgeOverlay}>
                  <SymbolView name={{ ios: 'checkmark.shield.fill', android: 'verified_user', web: 'verified_user' }} size={14} tintColor="#10b981" />
                  <Text style={{ fontSize: 11, color: '#10b981', fontWeight: '800' }}>VERIFIED & APPROVED</Text>
                </View>
              ) : null}
            </View>

            {/* Modal Bottom Actions */}
            <View style={styles.docModalFooter}>
              <Pressable
                style={[styles.docModalDoneBtn, { backgroundColor: '#3b82f6' }]}
                onPress={() => setViewingDoc(null)}
              >
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Close Preview</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  settingsTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  settingsTabActive: {
  },
  settingsTabText: {
    fontSize: 12,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.08)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
  },
  card: {
    borderRadius: 12,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  menuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 0.9,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  withdrawBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  withdrawBtnText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
  },
  depositBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  depositBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  detailCard: {
    padding: 14,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 10,
  },
  percentBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  percentText: {
    color: '#3b82f6',
    fontSize: 9,
    fontWeight: '800',
  },
  grid2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridBox: {
    width: '48%',
    backgroundColor: 'rgba(128, 128, 128, 0.03)',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  boxLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  boxValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  txCard: {
    padding: 12,
    gap: 8,
  },
  txHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  txSymbol: {
    fontSize: 12,
    fontWeight: '700',
  },
  txDate: {
    fontSize: 9.5,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  txTypeBadge: {
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  txTypeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  txStatusBadge: {
    backgroundColor: '#10b9811A',
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  txStatusBadgeText: {
    color: '#10b981',
    fontSize: 8,
    fontWeight: '800',
  },
  txDivider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.06)',
  },
  txDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  txDetailLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  txDetailVal: {
    fontSize: 10.5,
  },
  statusActiveBadge: {
    backgroundColor: '#10b98115',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusActiveBadgeText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
  },
  fieldLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  apiKeyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 6,
  },
  apiKeyText: {
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 0.75,
  },
  apiBtn: {
    backgroundColor: 'rgba(128,128,128,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apiBtnText: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  metaText: {
    fontSize: 8.5,
  },
  apiInfoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  gridLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  gridValue: {
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
    marginVertical: 10,
  },
  specBox: {
    width: '48%',
    gap: 2,
  },
  specLabel: {
    fontSize: 8,
    fontWeight: '700',
  },
  specValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  endpointCard: {
    borderRadius: 8,
  },
  epHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
  },
  methodBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  methodText: {
    fontSize: 8,
    fontWeight: '900',
  },
  epPath: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  epDetails: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.06)',
    paddingTop: 8,
  },
  epDesc: {
    fontSize: 9.5,
    lineHeight: 13,
  },
  codeLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  codeContainer: {
    borderRadius: 6,
    padding: 8,
  },
  codeText: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: '#3b82f6',
  },
  pillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillBtnText: {
    fontSize: 9,
    fontWeight: '800',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  statCard: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  reportRowCard: {
    padding: 12,
    gap: 8,
  },
  rowItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowGrid: {
    flexDirection: 'row',
  },
  clientIdText: {
    fontSize: 12,
    fontWeight: '800',
  },
  clientNameText: {
    fontSize: 9.5,
  },
  formGroup: {
    gap: 4,
    marginBottom: 10,
  },
  input: {
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    letterSpacing: 0,
    fontWeight: '400',
  },
  saveBtn: {
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  formCard: {
    padding: 14,
    gap: 12,
  },
  formSubTitle: {
    fontSize: 9.5,
    lineHeight: 13,
  },
  submitBtn: {
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  networkTabBtn: {
    flex: 1,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    justifyContent: 'center',
  },
  networkTabSelected: {
    borderColor: '#3b82f6',
    borderWidth: 1.5,
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  networkTabTextTitle: {
    fontSize: 11,
    fontWeight: '800',
  },
  networkTabTextSub: {
    fontSize: 8.5,
    fontWeight: '600',
    marginTop: 1,
  },
  selectedMarkerText: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    color: '#10b981',
    fontSize: 6.5,
    fontWeight: '900',
  },
  qrContainer: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  qrTitle: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#3b82f6',
    letterSpacing: 0.5,
  },
  qrSub: {
    fontSize: 9,
    textAlign: 'center',
  },
  qrCodeBox: {
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  copyAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  copyAddressText: {
    fontSize: 9,
    fontWeight: '700',
  },
  subTabRow: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  subTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 28,
    borderRadius: 6,
  },
  subTabText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  symbolText: {
    fontSize: 12,
    fontWeight: '800',
  },
  securityRequiredCard: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  securityRequiredTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  securityRequiredDesc: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  enable2faActionBtn: {
    backgroundColor: '#ef4444',
    height: 44,
    borderRadius: 10,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enable2faActionBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  docModalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  docModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.1)',
  },
  docModalTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  docModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(128, 128, 128, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docImageContainer: {
    width: '100%',
    height: 300,
    position: 'relative',
    backgroundColor: '#0a0a0f',
  },
  docImage: {
    width: '100%',
    height: '100%',
  },
  docImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  docImageLoadingOverlay: {
    backgroundColor: 'rgba(10, 10, 15, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  docVerifiedBadgeOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  docModalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128, 128, 128, 0.1)',
  },
  docModalDoneBtn: {
    width: '100%',
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownTrigger: {
    height: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownSelectedText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dropdownMenu: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  dropdownOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownOptionText: {
    fontSize: 13,
  },
});
