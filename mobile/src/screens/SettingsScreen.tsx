import React, { useState } from 'react';
import {
  View,
  Text,
  Switch,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSyncInfo } from '../hooks/use-sync';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import {
  setSyncEnabled,
  setSyncRelay,
  setBlossomUrl,
  restartSync,
} from '../api/bridge';

export function SettingsScreen() {
  const syncInfo = useSyncInfo();
  const [relayInput, setRelayInput] = useState('');
  const [blossomInput, setBlossomInput] = useState('');

  const data = syncInfo.data;

  const handleToggleSync = async (enabled: boolean) => {
    try {
      await setSyncEnabled(enabled);
      syncInfo.refetch();
    } catch (e: unknown) {
      Alert.alert('Error', String(e));
    }
  };

  const handleSetRelay = () => {
    if (!relayInput.trim()) return;
    try {
      setSyncRelay(relayInput.trim());
      setRelayInput('');
      syncInfo.refetch();
    } catch (e: unknown) {
      Alert.alert('Error', String(e));
    }
  };

  const handleSetBlossom = () => {
    if (!blossomInput.trim()) return;
    try {
      setBlossomUrl(blossomInput.trim());
      setBlossomInput('');
      syncInfo.refetch();
    } catch (e: unknown) {
      Alert.alert('Error', String(e));
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.label}>npub</Text>
          <Text style={styles.value} numberOfLines={1}>
            {data?.npub ?? '...'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sync</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <SyncStatusBadge state={data?.state} />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Enabled</Text>
          <Switch
            value={data?.state.type !== 'disconnected'}
            onValueChange={handleToggleSync}
          />
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Relay</Text>
          <Text style={styles.value} numberOfLines={1}>
            {data?.relayUrl ?? 'None'}
          </Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={relayInput}
            onChangeText={setRelayInput}
            placeholder="wss://relay.example.com"
            placeholderTextColor="#636366"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.btn} onPress={handleSetRelay}>
            <Text style={styles.btnText}>Set</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => {
            restartSync().then(() => syncInfo.refetch());
          }}
        >
          <Text style={styles.linkBtnText}>Restart Sync</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Blossom</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Server</Text>
          <Text style={styles.value} numberOfLines={1}>
            {data?.blossomUrl ?? 'None'}
          </Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={blossomInput}
            onChangeText={setBlossomInput}
            placeholder="https://blossom.example.com"
            placeholderTextColor="#636366"
            autoCapitalize="none"
          />
          <TouchableOpacity style={styles.btn} onPress={handleSetBlossom}>
            <Text style={styles.btnText}>Set</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stats</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Total Notes</Text>
          <Text style={styles.value}>{data?.totalNotes ?? 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Synced Notes</Text>
          <Text style={styles.value}>{data?.syncedNotes ?? 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Pending</Text>
          <Text style={styles.value}>{data?.pendingNotes ?? 0}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Blobs Stored</Text>
          <Text style={styles.value}>{data?.blobsStored ?? 0}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c1c1e',
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2e',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f0f0f0',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  label: {
    fontSize: 15,
    color: '#8e8e93',
  },
  value: {
    fontSize: 15,
    color: '#f0f0f0',
    flex: 1,
    textAlign: 'right',
    marginLeft: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#f0f0f0',
  },
  btn: {
    height: 40,
    paddingHorizontal: 16,
    backgroundColor: '#4a4aff',
    borderRadius: 8,
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  linkBtn: {
    marginTop: 12,
  },
  linkBtnText: {
    fontSize: 14,
    color: '#4a4aff',
    fontWeight: '500',
  },
});
