import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/app-icon';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors } from '@/constants/theme';
import { platformSettings, subscribeSettings } from '@/constants/settings-store';
import Pagination from '@/components/pagination';
import * as api from '@/components/api-client';

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

const formatDateTime = (dateStr: string) => {
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

export default function PositionsScreen() {
  const [isDarkMode, setIsDarkMode] = useState(platformSettings.isDarkMode);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [activeTab, setActiveTab] = useState<'OPEN' | 'CLOSED'>('OPEN');
  const [openPositions, setOpenPositions] = useState<api.Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<api.Position[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPositionsData = async () => {
    if (!platformSettings.isLoggedIn || !platformSettings.authToken) {
      return;
    }
    try {
      const [openData, closedData] = await Promise.all([
        api.fetchPositions('OPEN').catch(() => []),
        api.fetchPositions('CLOSED').catch(() => []),
      ]);
      setOpenPositions(openData);
      setClosedPositions(closedData);
    } catch (error: any) {
      if (error?.message === 'AUTH_REQUIRED') return;
      console.error('Error fetching positions:', error);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadPositionsData().finally(() => setIsLoading(false));

    const pollInterval = setInterval(() => {
      loadPositionsData();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadPositionsData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    return subscribeSettings(() => {
      setIsDarkMode(platformSettings.isDarkMode);
    });
  }, []);

  const theme = Colors[isDarkMode ? 'dark' : 'light'];
  const isDark = isDarkMode;

  const activePositions = activeTab === 'OPEN' ? openPositions : closedPositions;

  // Realised PNL (sum of closed trades closedPnl or floatingPnl)
  const realisedPnl = closedPositions.reduce((acc, pos) => acc + Number(pos.closedPnl || pos.floatingPnl || 0), 0);

  // Unrealised PNL (sum of open trades floatingPnl)
  const unrealisedPnl = openPositions.reduce((acc, pos) => acc + Number(pos.floatingPnl || 0), 0);

  // Total volume (sum of open + closed positions volume, matches web)
  const totalVolume = [...openPositions, ...closedPositions].reduce((acc, pos) => acc + Number(pos.volume || 0), 0);

  // Open volume (sum of open lots volume)
  const openVolume = openPositions.reduce((acc, pos) => acc + Number(pos.volume || 0), 0);

  // Total Trades (count of all positions)
  const totalTrades = openPositions.length + closedPositions.length;

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Positions</Text>
      </View>


      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={isDark ? '#ffffff' : '#000000'} />
        }
      >
        {/* Stats Row 1 */}
        <View style={styles.statsGrid}>
          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>REALISED PNL</Text>
            <Text
              style={[
                styles.statValue,
                { color: realisedPnl >= 0 ? '#10b981' : '#ef4444' }
              ]}
            >
              {realisedPnl >= 0 ? '+' : ''}${realisedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>UNREALISED PNL</Text>
            <Text
              style={[
                styles.statValue,
                { color: unrealisedPnl >= 0 ? '#10b981' : '#ef4444' }
              ]}
            >
              {unrealisedPnl >= 0 ? '+' : ''}${unrealisedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </GlassyCard>
        </View>

        {/* Stats Row 2 */}
        <View style={styles.statsGrid}>
          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>TOTAL VOLUME</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {totalVolume.toFixed(2)} lots
            </Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>LEVERAGE USED</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>1:100</Text>
          </GlassyCard>
        </View>

        {/* Stats Row 3 */}
        <View style={styles.statsGrid}>
          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>TOTAL TRADES</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{totalTrades}</Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>OPEN VOLUME</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {openVolume.toFixed(2)} lots
            </Text>
          </GlassyCard>
        </View>

        {/* Segmented Tabs Control */}
        <View style={[styles.tabsRow, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)', marginTop: 8 }]}>
          <Pressable
            style={[
              styles.tabButton,
              activeTab === 'OPEN' && { backgroundColor: isDark ? '#ffffff' : '#09090b' },
            ]}
            onPress={() => { setActiveTab('OPEN'); setCurrentPage(1); }}
          >
            <Text
              style={[
                styles.tabButtonText,
                { color: activeTab === 'OPEN' ? (isDark ? '#000000' : '#ffffff') : theme.textSecondary },
              ]}
            >
              Open ({openPositions.length})
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tabButton,
              activeTab === 'CLOSED' && { backgroundColor: isDark ? '#ffffff' : '#09090b' },
            ]}
            onPress={() => { setActiveTab('CLOSED'); setCurrentPage(1); }}
          >
            <Text
              style={[
                styles.tabButtonText,
                { color: activeTab === 'CLOSED' ? (isDark ? '#000000' : '#ffffff') : theme.textSecondary },
              ]}
            >
              Closed ({closedPositions.length})
            </Text>
          </Pressable>
        </View>

        {/* Positions Cards */}
        {isLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="small" color={isDark ? '#ffffff' : '#000000'} />
          </View>
        ) : activePositions.length === 0 ? (
          <GlassyCard isDark={isDark} style={styles.tableCard}>
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                <SymbolView
                  name={{ ios: 'chart.xyaxis.line', android: 'show_chart', web: 'show_chart' }}
                  size={22}
                  tintColor={theme.textSecondary}
                />
              </View>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No positions found</Text>
            </View>
          </GlassyCard>
        ) : (() => {
          const totalPages = Math.ceil(activePositions.length / itemsPerPage);
          const paginatedPositions = activePositions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
          return (
            <>
              {paginatedPositions.map((pos) => {
            const pnlVal = Number(activeTab === 'OPEN' ? pos.floatingPnl : pos.closedPnl || pos.floatingPnl || 0);
            return (
              <GlassyCard isDark={isDark} style={styles.positionCard} key={pos.id}>
                <View style={styles.positionCardHeader}>
                  <View style={styles.positionCardSymbolWrap}>
                    <View style={styles.symbolBadgeRow}>
                      <Text style={[styles.positionCardSymbol, { color: theme.text }]}>
                        {pos.symbol?.name || 'EURUSD'}
                      </Text>
                      <View
                        style={[
                          styles.sideBadge,
                          { backgroundColor: pos.side === 'BUY' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)' }
                        ]}
                      >
                        <Text style={[styles.sideBadgeText, { color: pos.side === 'BUY' ? '#10b981' : '#ef4444' }]}>
                          {pos.side}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.positionCardClient, { color: theme.textSecondary }]}>
                      {pos.client ? `${pos.client.firstName} ${pos.client.lastName}`.trim() : 'Master Account'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.positionCardPnl,
                      { color: pnlVal >= 0 ? '#10b981' : '#ef4444' }
                    ]}
                  >
                    {pnlVal >= 0 ? '+' : ''}${pnlVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>

                <View style={styles.positionCardDivider} />

                <View style={styles.positionCardGrid}>
                  <View style={styles.positionCardCol}>
                    <Text style={[styles.colLabel, { color: theme.textSecondary }]}>VOLUME</Text>
                    <Text style={[styles.colValue, { color: theme.text }]}>
                      {Number(pos.volume).toFixed(2)} Lots
                    </Text>
                  </View>
                  <View style={styles.positionCardCol}>
                    <Text style={[styles.colLabel, { color: theme.textSecondary }]}>OPEN PRICE</Text>
                    <Text style={[styles.colValue, { color: theme.text }]}>
                      {Number(pos.openPrice).toFixed(5)}
                    </Text>
                  </View>
                </View>

                <View style={styles.positionCardGrid}>
                  <View style={styles.positionCardCol}>
                    <Text style={[styles.colLabel, { color: theme.textSecondary }]}>
                      {activeTab === 'OPEN' ? 'CURRENT PRICE' : 'EXIT PRICE'}
                    </Text>
                    <Text style={[styles.colValue, { color: theme.text }]}>
                      {Number(pos.currentPrice).toFixed(5)}
                    </Text>
                  </View>
                  <View style={styles.positionCardCol}>
                    <Text style={[styles.colLabel, { color: theme.textSecondary }]}>COMMISSION</Text>
                    <Text style={[styles.colValue, { color: theme.text }]}>
                      ${Number(pos.commission).toFixed(2)}
                    </Text>
                  </View>
                </View>

                <View style={styles.positionCardGrid}>
                  <View style={styles.positionCardCol}>
                    <Text style={[styles.colLabel, { color: theme.textSecondary }]}>SPREAD</Text>
                    <Text style={[styles.colValue, { color: theme.text }]}>
                      {pos.symbol?.rawSpread ? Number(pos.symbol.rawSpread).toFixed(pos.symbol.digits || 3) : '0.000'}
                    </Text>
                  </View>
                  <View style={styles.positionCardCol}>
                    <Text style={[styles.colLabel, { color: theme.textSecondary }]}>OPENED TIME</Text>
                    <Text style={[styles.colValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit>
                      {formatDateTime(pos.openedAt || pos.createdAt)}
                    </Text>
                  </View>
                </View>
              </GlassyCard>
            );
          })}
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} isDark={isDark} />
            </>
          );
        })()}
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
    gap: 12,
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
    fontSize: 13.5,
    fontWeight: '700',
  },
  tableCard: {
    padding: 14,
    minHeight: 180,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  tableTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#3b82f6',
    fontSize: 9,
    fontWeight: '800',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabsRow: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  positionCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 4,
  },
  positionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  positionCardSymbolWrap: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 3,
  },
  symbolBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionCardClient: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  positionCardSymbol: {
    fontSize: 15,
    fontWeight: '800',
  },
  sideBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  sideBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  positionCardPnl: {
    fontSize: 13,
    fontWeight: '700',
  },
  positionCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 12,
  },
  positionCardGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  positionCardCol: {
    flex: 1,
    gap: 3,
  },
  colLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  colValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  loaderContainer: {
    paddingVertical: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
