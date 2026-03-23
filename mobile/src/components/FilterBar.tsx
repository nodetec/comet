import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import type { NoteFilter } from '../api/types';

type Props = {
  activeFilter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  archivedCount?: number;
  trashedCount?: number;
};

const FILTERS: { key: NoteFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'todo', label: 'Todo' },
  { key: 'archive', label: 'Archive' },
  { key: 'trash', label: 'Trash' },
];

export function FilterBar({
  activeFilter,
  onFilterChange,
  archivedCount,
  trashedCount,
}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {FILTERS.map(({ key, label }) => {
        const isActive = activeFilter === key;
        const count =
          key === 'archive'
            ? archivedCount
            : key === 'trash'
              ? trashedCount
              : undefined;

        return (
          <TouchableOpacity
            key={key}
            style={[styles.chip, isActive && styles.activeChip]}
            onPress={() => onFilterChange(key)}
          >
            <Text style={[styles.chipText, isActive && styles.activeChipText]}>
              {label}
              {count != null && count > 0 ? ` (${count})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#2c2c2e',
  },
  activeChip: {
    backgroundColor: '#4a4aff',
  },
  chipText: {
    fontSize: 14,
    color: '#8e8e93',
    fontWeight: '500',
  },
  activeChipText: {
    color: '#ffffff',
  },
});
