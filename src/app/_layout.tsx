import { DarkTheme, DefaultTheme, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useState, useEffect } from 'react';
import { LogBox } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { platformSettings, subscribeSettings } from '@/constants/settings-store';
import { setAuthToken } from '@/components/api-client';

import { SafeAreaProvider } from 'react-native-safe-area-context';

LogBox.ignoreLogs([
  'Text strings must be rendered within a <Text> component',
  'SafeAreaView has been deprecated',
  'Support for defaultProps will be removed',
]);

SplashScreen.preventAutoHideAsync();

function AuthGuard() {
  const segments = useSegments();
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(platformSettings.isLoggedIn);

  useEffect(() => {
    return subscribeSettings(() => {
      setIsLoggedIn(platformSettings.isLoggedIn);
    });
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/auth');
    } else if (isLoggedIn && segments[0] === 'auth') {
      router.replace('/');
    }
  }, [isLoggedIn, segments]);

  return null;
}

export default function TabLayout() {
  const [isDarkMode, setIsDarkMode] = useState(platformSettings.isDarkMode);

  useEffect(() => {
    setAuthToken(platformSettings.authToken);
    return subscribeSettings(() => {
      setIsDarkMode(platformSettings.isDarkMode);
      setAuthToken(platformSettings.authToken);
    });
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={isDarkMode ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AuthGuard />
        <AppTabs />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
