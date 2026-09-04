import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  ScrollView,
  View,
  Text,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
};

export default function ClientsScreen() {
  const [isDarkMode, setIsDarkMode] = useState(platformSettings.isDarkMode);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [clients, setClients] = useState<api.TradingClient[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadClientsData = async () => {
    if (!platformSettings.isLoggedIn || !platformSettings.authToken) {
      return;
    }
    try {
      const data = await api.fetchClients();
      setClients(data);
    } catch (error: any) {
      if (error?.message === 'AUTH_REQUIRED') return;
      console.error('Error fetching clients:', error);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    loadClientsData().finally(() => setIsLoading(false));

    const pollInterval = setInterval(() => {
      loadClientsData();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadClientsData();
    setIsRefreshing(false);
  };

  useEffect(() => {
    return subscribeSettings(() => {
      setIsDarkMode(platformSettings.isDarkMode);
    });
  }, []);

  const theme = Colors[isDarkMode ? 'dark' : 'light'];
  const isDark = isDarkMode;

  const totalClients = clients.length;
  const activeClients = clients.filter(c => (c.status || 'ACTIVE').toUpperCase() === 'ACTIVE').length;
  const inactiveClients = clients.filter(c => (c.status || '').toUpperCase() === 'INACTIVE').length;

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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Clients</Text>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#3b82f6" />
        }
      >
        {/* Stats Row */}
        <View style={styles.statsGrid}>
          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>TOTAL CLIENTS</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{totalClients}</Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>ACTIVE CLIENTS</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{activeClients}</Text>
          </GlassyCard>

          <GlassyCard isDark={isDark} style={styles.statCard}>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>INACTIVE</Text>
            <Text style={[styles.statValue, { color: theme.text }]}>{inactiveClients}</Text>
          </GlassyCard>
        </View>

        {/* Client Records List */}
        <View style={styles.listContainer}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>All Clients ({totalClients})</Text>

          {isLoading && clients.length === 0 ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading clients...</Text>
            </View>
          ) : clients.length === 0 ? (
            <GlassyCard isDark={isDark} style={styles.emptyCard}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No clients registered yet.</Text>
            </GlassyCard>
          ) : (
            (() => {
              const totalPages = Math.ceil(clients.length / itemsPerPage) || 1;
              const paginatedClients = clients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
              
              return (
                <>
                  {paginatedClients.map((client, idx) => {
                    const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.name || client.email || 'Client';
                    const isInactive = (client.status || '').toUpperCase() === 'INACTIVE';
                    const leverageStr = client.leverage ? (String(client.leverage).includes(':') ? String(client.leverage) : `1:${client.leverage}`) : '1:100';
                    const currencyStr = client.currency || client.ccy || 'USD';
                    const displayClientId =
                      client.clientId ||
                      client.client_id ||
                      client.clientCode ||
                      client.accountNumber ||
                      client.account_number ||
                      (client.login ? String(client.login) : '') ||
                      client.username ||
                      client.customId ||
                      (client.id ? (client.id.length > 12 ? client.id.slice(0, 12) : client.id) : '—');
                    const regDate = formatDate(client.createdAt || client.registered);

                    return (
                      <GlassyCard key={client.id || idx} isDark={isDark} style={styles.clientCard}>
                        <View style={styles.cardHeader}>
                          <View style={{ gap: 2, flex: 1 }}>
                            <Text style={[styles.clientIdText, { color: theme.text }]} numberOfLines={1}>{displayClientId}</Text>
                            <Text style={[styles.clientNameText, { color: theme.textSecondary }]}>{fullName}</Text>
                          </View>
                          <View style={[styles.statusBadge, isInactive && { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                            <Text style={[styles.statusBadgeText, isInactive && { color: '#ef4444' }]}>
                              ● {client.status || 'ACTIVE'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardDivider} />

                        <View style={styles.cardGrid}>
                          <View style={styles.gridItem}>
                            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>TYPE</Text>
                            <Text style={[styles.gridValue, { color: theme.text }]}>{client.type || 'STANDARD'}</Text>
                          </View>
                          <View style={styles.gridItem}>
                            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>LEVERAGE</Text>
                            <Text style={[styles.gridValue, { color: theme.text }]}>{leverageStr}</Text>
                          </View>
                          <View style={styles.gridItem}>
                            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>CURRENCY</Text>
                            <Text style={[styles.gridValue, { color: theme.text }]}>{currencyStr}</Text>
                          </View>
                          <View style={styles.gridItem}>
                            <Text style={[styles.gridLabel, { color: theme.textSecondary }]}>REGISTERED</Text>
                            <Text style={[styles.gridValue, { color: theme.text }]}>{regDate}</Text>
                          </View>
                        </View>
                      </GlassyCard>
                    );
                  })}
                  
                  {totalPages > 1 && (
                    <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} isDark={isDark} />
                  )}
                </>
              );
            })()
          )}
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
    gap: 16,
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
    fontSize: 14,
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
  clientCard: {
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  clientIdText: {
    fontSize: 13,
    fontWeight: '800',
  },
  clientNameText: {
    fontSize: 10.5,
  },
  statusBadge: {
    backgroundColor: '#10b9811A',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#10b981',
    fontSize: 9,
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
  gridValue: {
    fontSize: 11,
    fontWeight: '600',
  },
  loaderWrap: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
