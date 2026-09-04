import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SymbolView } from '@/components/app-icon';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isDark: boolean;
}

export default function Pagination({ currentPage, totalPages, onPageChange, isDark }: PaginationProps) {
  if (totalPages <= 1) return null;

  const textColor = isDark ? '#ffffff' : '#1e293b';
  const textMuted = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
  const btnBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)';
  const btnBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={[styles.container, { borderColor: btnBorder }]}>
      <Pressable
        style={[styles.button, { backgroundColor: btnBg, opacity: currentPage === 1 ? 0.5 : 1 }]}
        disabled={currentPage === 1}
        onPress={() => onPageChange(currentPage - 1)}
      >
        <SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={16} tintColor={currentPage === 1 ? textMuted : textColor} />
        <Text style={[styles.buttonText, { color: currentPage === 1 ? textMuted : textColor }]}>Prev</Text>
      </Pressable>

      <Text style={[styles.pageText, { color: textColor }]}>
        Page <Text style={{ fontWeight: '700' }}>{currentPage}</Text> of {totalPages}
      </Text>

      <Pressable
        style={[styles.button, { backgroundColor: btnBg, opacity: currentPage === totalPages ? 0.5 : 1 }]}
        disabled={currentPage === totalPages}
        onPress={() => onPageChange(currentPage + 1)}
      >
        <Text style={[styles.buttonText, { color: currentPage === totalPages ? textMuted : textColor }]}>Next</Text>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={currentPage === totalPages ? textMuted : textColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    borderTopWidth: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pageText: {
    fontSize: 13,
  }
});
