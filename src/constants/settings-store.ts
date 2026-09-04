export interface PlatformSettings {
  companyName: string;
  emailAddress: string;
  contactName: string;
  phoneNumber: string;
  notifFills: boolean;
  notifDeposits: boolean;
  notifDigest: boolean;
  is2FAEnabled: boolean;
  isDarkMode: boolean;
  isLoggedIn: boolean;
  authToken: string | null;
  algoKey: string | null;
}

export let platformSettings: PlatformSettings = {
  companyName: 'testing',
  emailAddress: 'muskansingh7105@gmail.com',
  contactName: 'Muskan',
  phoneNumber: '+919770626211',
  notifFills: true,
  notifDeposits: true,
  notifDigest: false,
  is2FAEnabled: false,
  isDarkMode: true,
  isLoggedIn: false,
  authToken: null,
  algoKey: null,
};

const listeners = new Set<() => void>();

export function subscribeSettings(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updatePlatformSettings(updates: Partial<PlatformSettings>) {
  platformSettings = { ...platformSettings, ...updates };
  listeners.forEach((l) => l());
}
