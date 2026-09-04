import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/app-icon';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/theme';
import { platformSettings, subscribeSettings } from '@/constants/settings-store';
import Pagination from '@/components/pagination';
import * as api from '@/components/api-client';
import { RefreshControl } from 'react-native';

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

const DEMO_ORDERS = [
  { symbol: 'XAGUSD', side: 'BUY', vol: '0.70', request: 'MKT', fill: '66.65700', time: '20/08/2026, 14:05:18', status: 'FILLED' },
  { symbol: 'XAUUSD', side: 'BUY', vol: '0.03', request: 'MKT', fill: '4492.65000', time: '20/08/2026, 14:05:18', status: 'FILLED' },
  { symbol: 'EURUSD', side: 'BUY', vol: '0.30', request: 'MKT', fill: '1.16907', time: '20/08/2026, 14:05:18', status: 'FILLED' },
  { symbol: 'XAUUSD', side: 'BUY', vol: '0.50', request: 'MKT', fill: '4492.65000', time: '20/08/2026, 14:05:18', status: 'FILLED' },
];

export default function OrdersScreen() {
  const [isDarkMode, setIsDarkMode] = useState(platformSettings.isDarkMode);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [filter, setFilter] = useState('ALL');
  const [orders, setOrders] = useState<api.Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadOrdersData = async () => {
    if (!platformSettings.isLoggedIn || !platformSettings.authToken) {
      return;
    }
    try {
      const data = await api.fetchRecentOrders();
      setOrders(data);
    } catch (error: any) {
      if (error?.message === 'AUTH_REQUIRED') return;
      console.error('Error fetching orders:', error);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadOrdersData().finally(() => setIsLoading(false));

    const pollInterval = setInterval(() => {
      loadOrdersData();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadOrdersData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    return subscribeSettings(() => {
      setIsDarkMode(platformSettings.isDarkMode);
    });
  }, []);

  const theme = Colors[isDarkMode ? 'dark' : 'light'];
  const isDark = isDarkMode;

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
    } catch {
      return dateStr;
    }
  };

  // Dynamic counts
  const allCount = orders.length;
  const filledCount = orders.filter(o => o.status === 'FILLED').length;
  const rejectedCount = orders.filter(o => o.status === 'REJECTED').length;
  const pendingCount = orders.filter(o => o.status === 'PENDING').length;

  const getFilteredOrders = () => {
    if (filter === 'ALL') return orders;
    return orders.filter((o: any) => o.status === filter);
  };

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Orders</Text>
      </View>

      {/* Filters */}
      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          {['ALL', 'FILLED', 'REJECTED', 'PENDING'].map((f) => {
            const isActive = filter === f;
            let count = 0;
            if (f === 'ALL') count = allCount;
            if (f === 'FILLED') count = filledCount;
            if (f === 'REJECTED') count = rejectedCount;
            if (f === 'PENDING') count = pendingCount;
            
            return (
              <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterPill, isActive && { backgroundColor: isDark ? '#ffffff' : '#09090b' }, !isActive && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                <Text style={[styles.filterText, isActive ? { color: isDark ? '#000000' : '#ffffff', fontWeight: '600' } : { color: theme.textSecondary }]}>
                  {f.charAt(0) + f.slice(1).toLowerCase()} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={isDark ? '#ffffff' : '#000000'} />
        }
      >
        {/* Stats Row */}
        <View style={styles.statsGrid}>
          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>TOTAL</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{allCount}</Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>FILLED</Text>
            <Text style={[styles.statValue, { color: '#10b981' }]}>{filledCount}</Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>REJECTED</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{rejectedCount}</Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>PENDING</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{pendingCount}</Text>
          </GlassyCard>
        </View>

        {/* Orders Card List */}
        <View style={styles.listContainer}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Executions ({getFilteredOrders().length})</Text>

          <View style={{ gap: 10 }}>
            {getFilteredOrders().length === 0 ? (
              <View style={{ paddingVertical: 80, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
                  <SymbolView name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }} size={24} tintColor={theme.textSecondary} />
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '500' }}>No orders found</Text>
              </View>
            ) : (() => {
              const filteredOrders = getFilteredOrders();
              const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
              const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
              
              return (
                <>
                  {paginatedOrders.map((o: any, idx: number) => (
              <GlassyCard key={idx} isDark={isDark} style={styles.orderCard}>
                <View style={styles.cardHeader}>
                  <View style={{ gap: 2 }}>
                    <Text style={[styles.symbolText, { color: theme.text }]}>{o.symbol?.name ?? o.symbolName ?? '—'}</Text>
                    <Text style={[styles.timeText, { color: theme.textSecondary }]}>{formatDateTime(o.createdAt)}</Text>
                  </View>
                  <View style={styles.badgesRow}>
                    <View style={[styles.typeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                      <Text style={[styles.typeBadgeText, { color: theme.textSecondary }]}>MARKET</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      o.status === 'FILLED' && { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
                      o.status === 'REJECTED' && { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
                      o.status === 'PENDING' && { backgroundColor: 'rgba(245, 158, 11, 0.15)' }
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        o.status === 'FILLED' && { color: '#10b981' },
                        o.status === 'REJECTED' && { color: '#ef4444' },
                        o.status === 'PENDING' && { color: '#f59e0b' }
                      ]}>
                        {o.status}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardDivider} />

                <View style={styles.cardGrid}>
                  <View style={styles.gridItem}>
                    <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>SIDE</Text>
                    <Text style={[styles.gridValue, { color: o.side === 'BUY' ? '#10b981' : '#3b82f6', fontWeight: '800' }]}>● {o.side}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>VOLUME</Text>
                    <Text style={[styles.gridValue, { color: theme.text }]}>{Number(o.filledVolume ?? o.requestedVolume ?? 0).toFixed(2)} lots</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>REQ PRICE</Text>
                    <Text style={[styles.gridValue, { color: theme.text }]}>{o.requestedPrice ? Number(o.requestedPrice).toFixed(5) : 'MKT'}</Text>
                  </View>
                  <View style={styles.gridItem}>
                    <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>FILL PRICE</Text>
                    <Text style={[styles.gridValue, { color: theme.text, fontWeight: '700' }]}>{o.executionPrice ? Number(o.executionPrice).toFixed(5) : '—'}</Text>
                  </View>
                </View>
              </GlassyCard>
            ))}
                  <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} isDark={isDark} />
                </>
              );
            })()}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128, 128, 128, 0.08)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 14,
  },
  card: {
    borderRadius: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 6,
  },
  statCard: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
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
    fontSize: 13,
    fontWeight: '700',
  },
  listContainer: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    paddingLeft: 2,
  },
  orderCard: {
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  symbolText: {
    fontSize: 13,
    fontWeight: '800',
  },
  timeText: {
    fontSize: 10,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  typeBadge: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: '#10b9811A',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeText: {
    color: '#10b981',
    fontSize: 8.5,
    fontWeight: '800',
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.08)',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    width: '45%',
    gap: 2,
  },
  gridLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  filtersRow: {
    marginBottom: 8,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
  },
  gridValue: {
    fontSize: 11,
    fontWeight: '600',
  },
});
