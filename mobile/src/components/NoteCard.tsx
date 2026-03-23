import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import type { NoteSummary } from '../api/types';

type Props = {
  note: NoteSummary;
  isSelected: boolean;
  onPress: () => void;
};

export function NoteCard({ note, isSelected, onPress }: Props) {
  const timeAgo = formatDistanceToNow(new Date(note.editedAt), {
    addSuffix: true,
  });

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.selected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {note.title || 'Untitled'}
        </Text>
        {note.pinnedAt != null && <Text style={styles.pin}>pin</Text>}
      </View>
      {note.preview ? (
        <Text style={styles.preview} numberOfLines={2}>
          {note.preview}
        </Text>
      ) : null}
      <View style={styles.meta}>
        <Text style={styles.time}>{timeAgo}</Text>
        {note.notebook && (
          <Text style={styles.notebook}>{note.notebook.name}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2e',
    backgroundColor: '#1c1c1e',
  },
  selected: {
    backgroundColor: '#2c2c3e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f0f0f0',
    flex: 1,
  },
  pin: {
    fontSize: 11,
    color: '#8e8e93',
    fontWeight: '500',
  },
  preview: {
    fontSize: 14,
    color: '#8e8e93',
    marginTop: 4,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  time: {
    fontSize: 12,
    color: '#636366',
  },
  notebook: {
    fontSize: 12,
    color: '#636366',
  },
});
