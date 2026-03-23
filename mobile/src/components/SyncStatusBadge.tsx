import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { SyncState } from '../api/types';

type Props = {
  state: SyncState | undefined;
};

function label(state: SyncState): string {
  switch (state.type) {
    case 'connected':
      return 'Synced';
    case 'syncing':
      return 'Syncing';
    case 'connecting':
      return 'Connecting';
    case 'authenticating':
      return 'Authenticating';
    case 'needsUnlock':
      return 'Locked';
    case 'error':
      return 'Error';
    case 'disconnected':
      return 'Offline';
  }
}

function dotColor(state: SyncState): string {
  switch (state.type) {
    case 'connected':
      return '#34c759';
    case 'syncing':
    case 'connecting':
    case 'authenticating':
      return '#ff9f0a';
    case 'needsUnlock':
      return '#ff9f0a';
    case 'error':
      return '#ff453a';
    case 'disconnected':
      return '#636366';
  }
}

export function SyncStatusBadge({ state }: Props) {
  if (!state) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor(state) }]} />
      <Text style={styles.label}>{label(state)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    color: '#8e8e93',
  },
});
