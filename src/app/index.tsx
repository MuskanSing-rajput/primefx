import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  StatusBar,
  Animated,
  Easing,
  useColorScheme,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/app-icon';
import Svg, { Circle, G, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Image as ExpoImage } from 'expo-image';
import { Colors, Spacing, BottomTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import * as api from '@/components/api-client';
import { platformSettings, subscribeSettings, updatePlatformSettings } from '@/constants/settings-store';

// ─── PREMIUM GLASSMORPHISM & ANIMATION COMPONENTS ───

function FadeInView({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 350,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, delay]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, style]}>
      {children}
    </Animated.View>
  );
}

function PulsingDot({ color = '#10b981' }: { color?: string }) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 2.2,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          })
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.7,
            duration: 0,
            useNativeDriver: true,
          })
        ])
      ])
    ).start();
  }, [pulseScale, pulseOpacity]);

  return (
    <View style={styles.dotContainer}>
      <Animated.View
        style={[
          styles.pulseDotOutline,
          {
            backgroundColor: color,
            opacity: pulseOpacity,
            transform: [{ scale: pulseScale }],
          },
        ]}
      />
      <View style={[styles.pulseDotCore, { backgroundColor: color }]} />
    </View>
  );
}

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

function Checkbox({ label, sublabel, checked, onChange, isDark }: { label: string; sublabel: string; checked: boolean; onChange: () => void; isDark: boolean }) {
  const theme = Colors[isDark ? 'dark' : 'light'];
  return (
    <Pressable
      style={styles.checkboxRow}
      onPress={onChange}
    >
      <SymbolView
        name={{
          ios: checked ? 'checkmark.square.fill' : 'square',
          android: checked ? 'check_box' : 'check_box_outline_blank',
          web: checked ? 'check_box' : 'check_box_outline_blank',
        }}
        size={18}
        tintColor={checked ? '#8b5cf6' : theme.textSecondary}
      />
      <View style={styles.checkboxTextWrap}>
        <Text style={[styles.checkboxLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.checkboxSublabel, { color: theme.textSecondary }]}>{sublabel}</Text>
      </View>
    </Pressable>
  );
}


// ─── DEMO DATA / FALLBACKS ───
const DEMO_WALLET = {
  totalCreditUSD: '0.00',
  usedCreditUSD: '0.00',
  availableCreditUSD: '0.00',
  balances: {
    USDT: '0.00',
    USDC: '0.00',
    BTC: '0.00',
    ETH: '0.00',
  },
};

const DEMO_POSITIONS: api.Position[] = [];
const DEMO_ORDERS: api.Order[] = [];
const DEMO_LIVE_ACTIVITY: any[] = [];
const DEMO_TOP_ASSETS: { name: string; value: number }[] = [];

// Sparkline dummy data for demo charts
const DEMO_SPARK_CREDIT = [0, 0, 0, 0, 0, 0, 0];
const DEMO_SPARK_POSITIONS = [0, 0, 0, 0, 0, 0, 0];
const DEMO_SPARK_CLIENTS = [0, 0, 0, 0, 0, 0, 0];

// ─── SVG Sparkline Bar Chart (Animated single bar) ───
function SparkBar({ targetHeight, color, delay }: { targetHeight: number; color: string; delay: number }) {
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    heightAnim.setValue(0);
    
    // Staggered initial rise
    Animated.timing(heightAnim, {
      toValue: targetHeight,
      duration: 500,
      delay,
      useNativeDriver: false,
    }).start(() => {
      // Loop up and down smoothly around target height
      const lowVal = Math.max(8, targetHeight - 20);
      const highVal = Math.min(100, targetHeight + 20);
      
      const runOscillation = () => {
        Animated.sequence([
          Animated.timing(heightAnim, {
            toValue: lowVal,
            duration: 1200 + Math.random() * 400,
            useNativeDriver: false,
          }),
          Animated.timing(heightAnim, {
            toValue: highVal,
            duration: 1200 + Math.random() * 400,
            useNativeDriver: false,
          })
        ]).start((result) => {
          if (result.finished) {
            runOscillation();
          }
        });
      };
      
      runOscillation();
    });

    return () => {
      heightAnim.stopAnimation();
    };
  }, [targetHeight]);

  const animatedHeight = heightAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        {
          width: 3,
          borderRadius: 2,
          backgroundColor: color,
          height: animatedHeight
        }
      ]}
    />
  );
}

function SparkLine({ data, color }: { data: number[]; color: string }) {
  // If we only have 1 data point (live api), generate a fake 7-point history to make the equalizer look good
  const chartData = data.length === 1 
    ? (data[0] === 0 ? [0, 0, 0, 0, 0, 0, 0] : [data[0] * 0.4, data[0] * 0.7, data[0] * 0.5, data[0] * 0.9, data[0] * 0.6, data[0] * 0.8, data[0]]) 
    : data;
    
  const max = Math.max(...chartData, 1);
  const min = Math.min(...chartData, 0);
  const range = max - min || 1;

  return (
    <View style={[styles.sparklineContainer, { flexDirection: 'row', alignItems: 'flex-end', gap: 3 }]}>
      {chartData.map((val, idx) => {
        const heightPct = Math.max(15, ((val - min) / range) * 100);
        return (
          <SparkBar
            key={idx}
            targetHeight={heightPct}
            color={color}
            delay={idx * 50}
          />
        );
      })}
    </View>
  );
}

// ─── INTERACTIVE GLOWING & ROTATING MARGIN GAUGE ───
export interface InteractiveMarginCircleRef {
  triggerSpin: () => void;
}

const InteractiveMarginCircle = React.forwardRef<
  InteractiveMarginCircleRef,
  { percentage: number; isDark: boolean; onPress?: () => void }
>(({ percentage, isDark, onPress }, ref) => {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const validPct = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));

  const triggerSpin = () => {
    // Rotation spin for orbit scanner
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 1100,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start();

    // Re-fill progress smoothly
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Gentle tactile bounce
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.04, duration: 180, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  React.useImperativeHandle(ref, () => ({
    triggerSpin,
  }));

  useEffect(() => {
    triggerSpin();
  }, [percentage]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const size = 118;
  const center = size / 2; // 59
  const strokeWidth = 10;
  const radius = 48;
  const circumference = 2 * Math.PI * radius; // ≈ 301.59
  const strokeDashoffset = circumference * (1 - validPct / 100);

  // Calculate coordinates for the glowing tip dot
  const angleDeg = -90 + (validPct / 100) * 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const tipX = center + radius * Math.cos(angleRad);
  const tipY = center + radius * Math.sin(angleRad);

  return (
    <Pressable
      onPress={() => {
        triggerSpin();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          justifyContent: 'center',
          marginVertical: 10,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: scaleAnim }],
        }}
      >
        {/* Orbit Rotating Light Scanner Particle */}
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'flex-start',
            transform: [{ rotate: spin }],
          }}
          pointerEvents="none"
        >
          {/* Glowing scanner particle */}
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: '#3b82f6',
              marginTop: 4,
              shadowColor: '#3b82f6',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 1,
              shadowRadius: 6,
            }}
          />
        </Animated.View>

        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            {/* Vibrant glowing blue gradient for active used margin */}
            <SvgLinearGradient id="gaugeActiveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
              <Stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
              <Stop offset="100%" stopColor="#2563eb" stopOpacity="1" />
            </SvgLinearGradient>

            {/* Rich Emerald Green track for Equity */}
            <SvgLinearGradient id="gaugeTrackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={isDark ? '#059669' : '#10b981'} stopOpacity={isDark ? '0.85' : '0.9'} />
              <Stop offset="100%" stopColor={isDark ? '#047857' : '#059669'} stopOpacity={isDark ? '0.8' : '0.85'} />
            </SvgLinearGradient>

            {/* Glowing inner shadow */}
            <SvgLinearGradient id="innerGlowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#10b981" stopOpacity={isDark ? '0.12' : '0.08'} />
              <Stop offset="100%" stopColor="#3b82f6" stopOpacity={isDark ? '0.04' : '0.02'} />
            </SvgLinearGradient>
          </Defs>

          {/* Inner ambient disc */}
          <Circle cx={center} cy={center} r={radius - 9} fill="url(#innerGlowGrad)" />

          {/* Outer dotted ring */}
          <Circle
            cx={center}
            cy={center}
            r={radius + 8}
            stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}
            strokeWidth="1"
            strokeDasharray="2, 6"
            fill="none"
          />

          <G rotation="-90" origin={`${center}, ${center}`}>
            {/* Base Background Track Ring (Equity in Emerald Green) */}
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke="url(#gaugeTrackGrad)"
              strokeWidth={strokeWidth}
              fill="none"
            />

            {/* Active Glowing Used Margin Ring (Vibrant Blue) */}
            {validPct > 0 && (
              <Circle
                cx={center}
                cy={center}
                r={radius}
                stroke="url(#gaugeActiveGrad)"
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${strokeDashoffset}`}
                strokeLinecap="round"
              />
            )}
          </G>

          {/* Glowing head dot indicator at the active progress tip */}
          {validPct > 2 && (
            <G>
              {/* Outer soft halo */}
              <Circle cx={tipX} cy={tipY} r={7} fill="#3b82f6" opacity={0.4} />
              {/* Mid glow ring */}
              <Circle cx={tipX} cy={tipY} r={4.5} fill="#3b82f6" />
              {/* Bright center core */}
              <Circle cx={tipX} cy={tipY} r={2} fill="#ffffff" />
            </G>
          )}
        </Svg>

        {/* Center Frosted Glass Display */}
        <View
          style={{
            position: 'absolute',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Text
            style={{
              fontSize: 16.5,
              fontWeight: '900',
              color: isDark ? '#ffffff' : '#0f172a',
              letterSpacing: -0.4,
            }}
          >
            {validPct.toFixed(1)}%
          </Text>
          <View
            style={{
              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
              paddingHorizontal: 5,
              paddingVertical: 1,
              borderRadius: 4,
              marginTop: 2,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.2)',
            }}
          >
            <Text
              style={{
                fontSize: 8,
                fontWeight: '800',
                color: '#3b82f6',
                letterSpacing: 0.8,
              }}
            >
              USED
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});

export default function HomeScreen() {
  const [isDarkMode, setIsDarkMode] = useState(platformSettings.isDarkMode);

  useEffect(() => {
    return subscribeSettings(() => {
      setIsDarkMode(platformSettings.isDarkMode);
    });
  }, []);

  const theme = Colors[isDarkMode ? 'dark' : 'light'];
  const isDark = isDarkMode;

  // Settings & Configuration States
  const [config, setConfig] = useState<api.ApiConfig>(api.getApiConfig());


  // Live Data States
  const [wallet, setWallet] = useState<api.WalletSummary | null>(null);
  const [positions, setPositions] = useState<api.Position[]>([]);
  const [orders, setOrders] = useState<api.Order[]>([]);
  const [clientsCount, setClientsCount] = useState<number>(0);
  const [threshold, setThreshold] = useState<api.ThresholdStatus | null>(null);
  const [topAssets, setTopAssets] = useState<{ name: string; value: number }[]>([]);
  const [liveActivity, setLiveActivity] = useState<any[]>([]);

  // App States
  const [showBalance, setShowBalance] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const marginCircleRef = useRef<InteractiveMarginCircleRef>(null);

  // Load configuration and fetch data
  useEffect(() => {
    loadDashboard();

    let pollInterval: any = null;
    if (config.useLiveApi) {
      pollInterval = setInterval(() => {
        fetchLiveData().catch(() => {});
      }, 3000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [config.useLiveApi]);

  const loadDashboard = async () => {
    if (!config.useLiveApi) {
      // Load Demo Data
      setErrorMsg(null);
      setWallet(DEMO_WALLET as any);
      setPositions(DEMO_POSITIONS);
      setOrders(DEMO_ORDERS);
      setClientsCount(0);
      setThreshold(null);
      setTopAssets([]);
      setLiveActivity([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      await fetchLiveData();
    } catch (err: any) {
      console.warn("DASHBOARD LOAD ERROR:", err);
      if (err?.message === 'AUTH_REQUIRED') return;
      // API request failed. Set clean fallback zeros.
      setWallet(DEMO_WALLET as any);
      setPositions(DEMO_POSITIONS);
      setOrders(DEMO_ORDERS);
      setClientsCount(0);
      setThreshold(null);
      setTopAssets([]);
      setLiveActivity([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLiveData = async () => {
    if (!platformSettings.isLoggedIn || !platformSettings.authToken) {
      return;
    }
    // Fetch core stats fast in parallel
    const [walletData, positionsData, ordersData, clientsData] = await Promise.all([
      api.fetchWallet(),
      api.fetchPositions().catch(() => []),
      api.fetchRecentOrders().catch(() => []),
      api.fetchClients().catch(() => []),
    ]);

    setWallet(walletData);
    setPositions(positionsData);
    setOrders(ordersData.slice(0, 5));
    setClientsCount(clientsData.length);

    // Compute live feed from orders
    if (ordersData && ordersData.length > 0) {
      const feed = ordersData.slice(0, 5).map((o: any) => {
        const initials = ((o.client?.firstName ?? 'C').slice(0, 1) + (o.client?.lastName ?? 'T').slice(0, 1)).toUpperCase();
        return {
          id: o.id,
          initials,
          text: `${o.client?.firstName ?? 'Client'} ${o.side} ${Number(o.filledVolume ?? o.requestedVolume ?? 0).toFixed(2)} ${o.symbol?.name ?? o.symbolName ?? ''}`,
          time: new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          color: o.side === 'BUY' ? '#10b981' : '#3b82f6',
        };
      });
      setLiveActivity(feed);
    } else {
      setLiveActivity([]);
    }

    // Asynchronously fetch secondary trade report / threshold metrics without blocking core UI
    Promise.all([
      api.fetchTrades().catch(() => []),
      api.fetchThresholdStatus().catch(() => null),
    ]).then(([tradesData, thresholdData]) => {
      if (thresholdData) setThreshold(thresholdData);
      if (tradesData && tradesData.length > 0) {
        const volumeMap: Record<string, number> = {};
        tradesData.forEach((t: any) => {
          if (!t || !t.symbol) return;
          const name = t.symbol.displayName || t.symbol.name;
          const vol = Number(t.filledVolume || 0);
          volumeMap[name] = (volumeMap[name] || 0) + vol;
        });

        const sortedAssets = Object.entries(volumeMap)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);
        
        setTopAssets(sortedAssets);
      }
    }).catch(() => {});
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (config.useLiveApi) {
        await fetchLiveData();
      } else {
        // Mimic small timeout for demo refresh
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  };


  // Math derivations with clean 0.00 fallbacks
  const openPos = config.useLiveApi ? positions.length : 0;
  const floatPnl = positions.reduce((a, p) => a + Number(p.floatingPnl || 0), 0);
  const totalCredit = wallet ? parseFloat(wallet.totalCreditUSD || '0') || 0 : 0.00;
  const usedCredit = wallet ? parseFloat(wallet.usedCreditUSD || '0') || 0 : 0.00;
  
  // Available balance
  const availableBalance = wallet ? parseFloat(wallet.availableCreditUSD || '0') || 0 : 0.00;
  
  // Balances
  const usdt = wallet ? parseFloat(wallet.balances?.USDT ?? '0') || 0 : 0.00;
  
  // Utilisation percentage
  const creditPct = usdt !== 0 ? Math.max(0, Math.min(100, (usedCredit / Math.abs(usdt)) * 100)) : 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      
      {/* Screen-wide backdrop gradient for clean high-contrast surface */}
      <LinearGradient
        colors={isDark ? ['#050506', '#09090b', '#000000'] : ['#F4F7FC', '#EDF2F9']}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Decorative Background Glow Blobs */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LinearGradient
          colors={isDark ? ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'] : ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']}
          style={[styles.blob, { top: -60, right: -40, width: 280, height: 280, borderRadius: 140 }]}
        />
        <LinearGradient
          colors={isDark ? ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'] : ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']}
          style={[styles.blob, { top: 320, left: -60, width: 240, height: 240, borderRadius: 120 }]}
        />
        <LinearGradient
          colors={isDark ? ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'] : ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']}
          style={[styles.blob, { bottom: 120, right: -50, width: 260, height: 260, borderRadius: 130 }]}
        />
      </View>
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <View style={[styles.logoBadge, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)', borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' }]}>
            <ExpoImage
              source={require('@/assets/images/logo_prime.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>
          <Text style={[styles.headerTitle, { color: theme.text, fontWeight: '700' }]}>
            Dashboard
          </Text>
        </View>

        <View style={styles.headerActions}>
          {/* Theme Mode Toggle */}
          <Pressable
            style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] }]}
            onPress={() => updatePlatformSettings({ isDarkMode: !isDarkMode })}
          >
            <SymbolView
              name={{
                ios: isDarkMode ? 'sun.max.fill' : 'moon.fill',
                android: isDarkMode ? 'light_mode' : 'dark_mode',
                web: isDarkMode ? 'light_mode' : 'dark_mode',
              }}
              size={18}
              tintColor={theme.text}
            />
          </Pressable>

          {/* Notification Bell */}
          <Pressable
            style={({ pressed }) => [styles.settingsBtn, { position: 'relative' }, pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] }]}
            onPress={() => {
              router.push({ pathname: '/more', params: { section: 'notifications', ts: Date.now().toString() } });
            }}
          >
            <SymbolView
              name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
              size={18}
              tintColor={theme.text}
            />
            <View style={styles.notificationDot} />
          </Pressable>

          {/* Settings */}
          <Pressable
            style={({ pressed }) => [styles.settingsBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.94 }] }]}
            onPress={() => {
              router.push({ pathname: '/more', params: { section: 'settings', ts: Date.now().toString() } });
            }}
          >
            <SymbolView
              name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
              size={18}
              tintColor={theme.text}
            />
          </Pressable>
        </View>
      </View>

      {errorMsg && !errorMsg.includes('401') ? (
        <View style={styles.errorBanner}>
          <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} size={16} tintColor="#ef4444" />
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            Connecting and syncing metrics...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
          }
        >
          {/* AVAILABLE BALANCE CARD */}
          <FadeInView delay={50}>
            <GlassyCard isDark={isDark}>
              <View style={styles.balanceHeader}>
                <View style={styles.balanceLabelWrap}>
                  <SymbolView
                    name={{ ios: 'wallet.pass.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }}
                    size={14}
                    tintColor="#3b82f6"
                  />
                  <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>
                    Available Balance (USD)
                  </Text>
                </View>
                
                <Pressable
                  onPress={() => setShowBalance(!showBalance)}
                  style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] }]}
                >
                  <SymbolView
                    name={{
                      ios: showBalance ? 'eye.fill' : 'eye.slash.fill',
                      android: showBalance ? 'visibility' : 'visibility_off',
                      web: showBalance ? 'visibility' : 'visibility_off',
                    }}
                    size={16}
                    tintColor={theme.textSecondary}
                  />
                </Pressable>
              </View>

              <Text style={[styles.balanceValue, { color: theme.text }]}>
                {showBalance
                  ? `$${availableBalance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : '$ •••••••'}
              </Text>

              <View style={styles.limitBadge}>
                <SymbolView
                  name={{ ios: 'exclamationmark.circle.fill', android: 'info', web: 'info' }}
                  size={10}
                  tintColor={theme.textSecondary}
                />
                <Text style={[styles.limitText, { color: theme.textSecondary }]}>
                  Total Balance: ${usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • ${usedCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Used
                </Text>
              </View>

              <View style={styles.quickActionsDivider} />

              <View style={styles.quickActionsSection}>
                <Text style={[styles.quickActionsTitle, { color: theme.textSecondary }]}>QUICK ACTIONS</Text>
                <View style={styles.actionsRow}>
                  <View style={styles.actionItem}>
                    <Pressable 
                      style={({ pressed }) => [styles.actionCircle, pressed && { opacity: 0.8, transform: [{ scale: 0.94 }] }]}
                      onPress={() => router.push({ pathname: '/more', params: { section: 'wallet', sub: 'deposit', ts: Date.now().toString() } })}
                    >
                      <SymbolView
                        name={{ ios: 'plus', android: 'add', web: 'add' }}
                        size={16}
                        tintColor="#3b82f6"
                      />
                    </Pressable>
                    <Text style={[styles.actionLabel, { color: theme.text }]}>Add Funds</Text>
                  </View>

                  <View style={styles.actionItem}>
                    <Pressable 
                      style={({ pressed }) => [styles.actionCircle, pressed && { opacity: 0.8, transform: [{ scale: 0.94 }] }]}
                      onPress={() => router.push({ pathname: '/more', params: { section: 'wallet', sub: 'withdraw', ts: Date.now().toString() } })}
                    >
                      <SymbolView
                        name={{ ios: 'arrow.up.right', android: 'arrow_upward', web: 'arrow_upward' }}
                        size={16}
                        tintColor="#3b82f6"
                      />
                    </Pressable>
                    <Text style={[styles.actionLabel, { color: theme.text }]}>Withdraw</Text>
                  </View>

                  <View style={styles.actionItem}>
                    <Pressable 
                      style={({ pressed }) => [styles.actionCircle, pressed && { opacity: 0.8, transform: [{ scale: 0.94 }] }]}
                      onPress={() => router.push({ pathname: '/more', params: { section: 'wallet', sub: 'none', ts: Date.now().toString() } })}
                    >
                      <SymbolView
                        name={{ ios: 'clock.fill', android: 'history', web: 'history' }}
                        size={16}
                        tintColor="#3b82f6"
                      />
                    </Pressable>
                    <Text style={[styles.actionLabel, { color: theme.text }]}>Transactions</Text>
                  </View>
                </View>
              </View>
            </GlassyCard>
          </FadeInView>

          {/* METRICS ROW 1 (Total Credit & Open Positions) */}
          <FadeInView delay={100}>
            <View style={styles.metricsGrid}>
              <GlassyCard isDark={isDark} style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Total Credit</Text>
                <View style={styles.metricValueWrap}>
                  <Text style={[styles.metricValue, { color: theme.text }]}>
                    ${totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <SparkLine data={config.useLiveApi ? [totalCredit] : DEMO_SPARK_CREDIT} color="#3b82f6" />
                </View>
              </GlassyCard>

              <GlassyCard isDark={isDark} style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Open Positions</Text>
                <View style={styles.metricValueWrap}>
                  <Text style={[styles.metricValue, { color: theme.text }]}>
                    {openPos}
                  </Text>
                  <SparkLine data={config.useLiveApi ? [openPos] : DEMO_SPARK_POSITIONS} color="#d946ef" />
                </View>
              </GlassyCard>
            </View>
          </FadeInView>

          {/* METRICS ROW 2 (Total Clients & Floating PnL) */}
          <FadeInView delay={150}>
            <View style={styles.metricsGrid}>
              <GlassyCard isDark={isDark} style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Total Clients</Text>
                <View style={styles.metricValueWrap}>
                  <Text style={[styles.metricValue, { color: theme.text }]}>
                    {clientsCount}
                  </Text>
                  <SparkLine data={config.useLiveApi ? [clientsCount] : DEMO_SPARK_CLIENTS} color="#10b981" />
                </View>
              </GlassyCard>

              <GlassyCard isDark={isDark} style={styles.metricCard}>
                <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Floating PnL</Text>
                <View style={styles.metricValueWrap}>
                  <Text style={[styles.metricValue, { color: floatPnl >= 0 ? '#10b981' : '#ef4444' }]}>
                    {floatPnl >= 0 ? '+' : ''}${floatPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </GlassyCard>
            </View>
          </FadeInView>



          {/* MARGIN UTILISATION & ASSETS */}
          <FadeInView delay={200}>
            <View style={styles.metricsGrid}>
              {/* Margin Utilisation Card with Interactive Rotating Glowing Circle */}
              <Pressable
                style={{ flex: 1.15 }}
                onPress={() => marginCircleRef.current?.triggerSpin()}
              >
                <GlassyCard isDark={isDark} style={[styles.metricCard, { width: '100%' }]}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>Margin Utilisation</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6' }} />
                      <Text style={[styles.marginPct, { color: '#3b82f6', fontWeight: '800' }]}>{creditPct.toFixed(1)}%</Text>
                    </View>
                  </View>

                  <InteractiveMarginCircle
                    ref={marginCircleRef}
                    percentage={creditPct}
                    isDark={isDark}
                  />

                  <View style={styles.marginRow}>
                    <View style={styles.marginLegend}>
                      <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
                      <Text style={[styles.legendText, { color: theme.textSecondary }]}>Used Margin</Text>
                    </View>
                    <Text style={[styles.marginVal, { color: theme.text }]}>
                      ${usedCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  <View style={styles.marginRow}>
                    <View style={styles.marginLegend}>
                      <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
                      <Text style={[styles.legendText, { color: theme.textSecondary }]}>Equity</Text>
                    </View>
                    <Text style={[styles.marginVal, { color: theme.text }]}>
                      ${Math.max(0, Math.abs(usdt) - usedCredit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </GlassyCard>
              </Pressable>

              {/* Top Assets */}
              <GlassyCard isDark={isDark} style={[styles.metricCard, { flex: 0.85 }]}>
                <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, fontWeight: '800' }]}>TOP ASSETS</Text>
                
                {topAssets.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.textSecondary, marginTop: 12 }]}>No active assets</Text>
                ) : (
                  <View style={{ gap: 14, marginTop: 8 }}>
                    {topAssets.map((asset, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{asset.name}</Text>
                        <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '600' }}>
                          {asset.value.toFixed(2)} Lots
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </GlassyCard>
            </View>
          </FadeInView>

          {/* RECENT ORDERS */}
          <FadeInView delay={250}>
            <GlassyCard isDark={isDark}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Recent Orders</Text>
                <View style={styles.ordersBadge}>
                  <Text style={styles.ordersBadgeText}>{orders.length} Orders</Text>
                </View>
              </View>

              <View style={styles.listContainer}>
                {orders.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No recent orders</Text>
                ) : (
                  orders.map((o) => (
                    <View key={o.id} style={styles.listItem}>
                      <View style={styles.listItemLeft}>
                        <View style={[styles.avatar, { backgroundColor: o.side === 'BUY' ? '#10b9811A' : '#3b82f61A' }]}>
                          <Text style={[styles.avatarText, { color: o.side === 'BUY' ? '#10b981' : '#3b82f6' }]}>
                            {o.symbol?.name?.slice(0, 2) ?? 'FX'}
                          </Text>
                        </View>
                        <View style={styles.listItemDetails}>
                          <Text style={[styles.symbolName, { color: theme.text, fontWeight: '600' }]}>
                            {o.symbol?.name ?? 'EURUSD'}
                          </Text>
                          <Text style={[styles.orderSub, { color: theme.textSecondary }]}>
                            {o.side} • {Number(o.requestedVolume).toFixed(2)} Lots
                          </Text>
                        </View>
                      </View>

                      <View style={styles.listItemRight}>
                        <Text style={[styles.statusText, { color: o.status === 'FILLED' ? '#10b981' : '#f59e0b' }]}>
                          {o.status}
                        </Text>
                        <Text style={[styles.timestamp, { color: theme.textSecondary }]}>
                          {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </GlassyCard>
          </FadeInView>

          {/* LIVE ACTIVITY */}
          <FadeInView delay={300}>
            <GlassyCard isDark={isDark}>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>Recent Activity</Text>
                <PulsingDot color="#10b981" />
              </View>

              <View style={styles.listContainer}>
                {liveActivity.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No recent activity</Text>
                ) : (
                  liveActivity.map((activity, idx) => (
                    <View key={activity.id || idx} style={styles.activityItem}>
                      <View style={[styles.activityInitialsCircle, { backgroundColor: '#10b98112', borderColor: '#10b98125' }]}>
                        <Text style={styles.activityInitialsText}>{activity.initials}</Text>
                      </View>
                      <View style={styles.activityContent}>
                        <Text style={[styles.activityText, { color: theme.text }]}>
                          {activity.text}
                        </Text>
                        <Text style={[styles.activityTime, { color: theme.textSecondary }]}>
                          {activity.time}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </GlassyCard>
          </FadeInView>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
    paddingBottom: 8,
    gap: Spacing.three,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  loadingText: {
    textAlign: 'center',
    opacity: 0.8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#2E313515',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 18,
    height: 18,
  },
  headerTitle: {
    fontSize: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
  },
  settingsBtn: {
    padding: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  errorBanner: {
    backgroundColor: '#ef444412',
    padding: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.one,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef444425',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
  },
  card: {
    padding: 14,
    borderRadius: 12,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: Spacing.one,
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: '800',
    marginVertical: 6,
    letterSpacing: -0.5,
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  limitText: {
    fontSize: 9.5,
    fontWeight: '500',
  },
  quickActionsDivider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.15)',
    marginVertical: 12,
  },
  quickActionsSection: {
    gap: Spacing.two,
  },
  quickActionsTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionItem: {
    alignItems: 'center',
    gap: 4,
  },
  actionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f612',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metricCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  metricValueWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  livePnlBadge: {
    fontSize: 8,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: '#2E31352A',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  sparklineContainer: {
    flexDirection: 'row',
    height: 18,
    alignItems: 'flex-end',
    gap: 2,
  },
  sparklineBar: {
    width: 3,
    borderRadius: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  ordersBadge: {
    backgroundColor: '#3b82f615',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ordersBadgeText: {
    color: '#3b82f6',
    fontSize: 9,
    fontWeight: '700',
  },
  listContainer: {
    gap: Spacing.one,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.08)',
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 9,
    fontWeight: '800',
  },
  listItemDetails: {
    gap: 1,
  },
  symbolName: {
    fontSize: 11.5,
  },
  orderSub: {
    fontSize: 9,
    fontWeight: '500',
  },
  listItemRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 9,
  },
  pulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pulseText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '700',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.08)',
  },
  activityInitialsCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInitialsText: {
    color: '#10b981',
    fontSize: 8,
    fontWeight: '800',
  },
  activityContent: {
    flex: 1,
    gap: 1,
  },
  activityText: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
  },
  activityTime: {
    fontSize: 8.5,
    fontWeight: '600',
  },
  commissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commissionMonth: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    backgroundColor: '#8b5cf61A',
    color: '#8b5cf6',
  },
  commissionSub: {
    fontSize: 10,
    marginVertical: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#2E31351A',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
    marginTop: 2,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 2,
  },
  commissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  marginPct: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  marginBarTrack: {
    height: 3,
    backgroundColor: '#2E31351A',
    borderRadius: 1.5,
    overflow: 'hidden',
    marginVertical: 6,
  },
  marginBarFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  marginRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  marginLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  marginVal: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  assetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  assetName: {
    fontSize: 10,
    fontWeight: '600',
  },
  assetVal: {
    fontSize: 10,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.four,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  modalTitle: {
    fontSize: 16,
  },
  closeModalBtn: {
    padding: Spacing.one,
  },
  modalScroll: {
    gap: Spacing.two,
  },
  modalCard: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 10,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  formCol: {
    flex: 1,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalInput: {
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 11.5,
  },
  saveProfileBtn: {
    backgroundColor: '#8b5cf6',
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
  },
  saveProfileText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  enabledBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  enabledBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  twoFactorHint: {
    fontSize: 9.5,
    lineHeight: 14,
    marginBottom: 6,
  },
  disable2faBtn: {
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#ef444410',
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  disable2faText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  enable2faBtn: {
    backgroundColor: '#10b981',
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  enable2faText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  themeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  themeButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeButtonActive: {
    backgroundColor: '#8b5cf615',
  },
  themeButtonInactive: {
    backgroundColor: 'transparent',
  },
  themeBtnTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  themeBtnSub: {
    fontSize: 8.5,
    textAlign: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  checkboxTextWrap: {
    flex: 1,
    gap: 1,
  },
  checkboxLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  checkboxSublabel: {
    fontSize: 9.5,
    lineHeight: 13,
  },
  totpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 4,
  },
  totpBox: {
    width: 32,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  totpText: {
    fontSize: 14,
    fontWeight: '700',
  },
  blob: {
    position: 'absolute',
  },
  dotContainer: {
    width: 8,
    height: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pulseDotOutline: {
    width: 14,
    height: 14,
    borderRadius: 7,
    position: 'absolute',
  },
  pulseDotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notificationDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  emptyText: {
    fontSize: 11.5,
    color: '#71717a',
    textAlign: 'center',
    paddingVertical: 14,
  },
});

