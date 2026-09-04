import { Tabs, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { SymbolView } from '@/components/app-icon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { platformSettings, subscribeSettings } from '@/constants/settings-store';

export default function AppTabs() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isDarkMode, setIsDarkMode] = useState(platformSettings.isDarkMode);

  useEffect(() => {
    return subscribeSettings(() => {
      setIsDarkMode(platformSettings.isDarkMode);
    });
  }, []);

  const theme = Colors[isDarkMode ? 'dark' : 'light'];
  const isDark = isDarkMode;

  // Compact, responsive bottom tab bar clearance
  const safeBottom = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 14 : 6);
  const tabHeight = (Platform.OS === 'ios' ? 50 : 54) + safeBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: isDark ? 'rgba(255, 255, 255, 0.42)' : 'rgba(0, 0, 0, 0.4)',
        tabBarStyle: {
          backgroundColor: isDark ? '#050506' : theme.background,
          borderTopWidth: 1,
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          height: tabHeight,
          paddingBottom: safeBottom,
          paddingTop: 6,
          paddingHorizontal: Platform.OS === 'ios' ? 20 : 12,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={focused ? 'house.fill' : 'house'}
              size={20}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={focused ? 'person.2.fill' : 'person.2'}
              size={20}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="positions"
        options={{
          title: 'Positions',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={focused ? 'chart.xyaxis.line' : 'chart.xyaxis.line'}
              size={20}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={focused ? 'list.bullet.clipboard.fill' : 'list.bullet.clipboard'}
              size={20}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={focused ? 'ellipsis.circle.fill' : 'ellipsis.circle'}
              size={20}
              tintColor={color}
            />
          ),
        }}
        listeners={{
          tabPress: () => {
            router.push({ pathname: '/more', params: { section: 'menu', ts: Date.now().toString() } });
          },
        }}
      />
      <Tabs.Screen
        name="auth"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />

    </Tabs>
  );
}
