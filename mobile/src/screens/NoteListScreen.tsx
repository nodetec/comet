import React, { useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBootstrap, useNotesQuery } from '../hooks/use-note-queries';
import { useCreateNote } from '../hooks/use-note-mutations';
import { useSyncStatus } from '../hooks/use-sync';
import { useShellStore } from '../store/use-shell-store';
import { NoteCard } from '../components/NoteCard';
import { FilterBar } from '../components/FilterBar';
import { SearchBar } from '../components/SearchBar';
import { SyncStatusBadge } from '../components/SyncStatusBadge';
import type { NoteSummary } from '../api/types';
import type { RootStackParamList } from '../App';

type Nav = NativeStackNavigationProp<RootStackParamList, 'NoteList'>;

export function NoteListScreen() {
  const navigation = useNavigation<Nav>();
  const {
    selectedNoteId,
    noteFilter,
    activeNotebookId,
    activeTags,
    searchQuery,
    sortField,
    sortDirection,
    selectNote,
    setNoteFilter,
    setSearchQuery,
  } = useShellStore();

  const bootstrap = useBootstrap();
  const syncStatus = useSyncStatus();
  const createNoteMutation = useCreateNote();

  const notesQuery = useNotesQuery({
    noteFilter,
    activeNotebookId,
    searchQuery,
    activeTags,
    sortField,
    sortDirection,
  });

  const allNotes = useMemo(
    () => notesQuery.data?.pages.flatMap((p) => p.notes) ?? [],
    [notesQuery.data],
  );

  const handleNotePress = useCallback(
    (note: NoteSummary) => {
      selectNote(note.id);
      navigation.navigate('NoteEditor', { noteId: note.id });
    },
    [navigation, selectNote],
  );

  const handleCreateNote = useCallback(() => {
    createNoteMutation.mutate(
      { notebookId: activeNotebookId },
      {
        onSuccess: (note) => {
          selectNote(note.id);
          navigation.navigate('NoteEditor', { noteId: note.id });
        },
      },
    );
  }, [createNoteMutation, activeNotebookId, selectNote, navigation]);

  const renderItem = useCallback(
    ({ item }: { item: NoteSummary }) => (
      <NoteCard
        note={item}
        isSelected={item.id === selectedNoteId}
        onPress={() => handleNotePress(item)}
      />
    ),
    [selectedNoteId, handleNotePress],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Notes</Text>
          <SyncStatusBadge state={syncStatus.data} />
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => navigation.navigate('Settings')}
          >
            <Text style={styles.settingsBtnText}>Settings</Text>
          </TouchableOpacity>
        </View>
        <SearchBar value={searchQuery} onChangeText={setSearchQuery} />
        <FilterBar
          activeFilter={noteFilter}
          onFilterChange={setNoteFilter}
          archivedCount={bootstrap.data?.archivedCount}
          trashedCount={bootstrap.data?.trashedCount}
        />
      </View>

      {notesQuery.isLoading ? (
        <ActivityIndicator style={styles.loader} color="#8e8e93" />
      ) : allNotes.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No notes yet</Text>
        </View>
      ) : (
        <FlatList
          data={allNotes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (notesQuery.hasNextPage && !notesQuery.isFetchingNextPage) {
              notesQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          onRefresh={() => notesQuery.refetch()}
          refreshing={notesQuery.isRefetching}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleCreateNote}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c1c1e',
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2e',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f0f0f0',
    flex: 1,
  },
  settingsBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settingsBtnText: {
    fontSize: 14,
    color: '#4a4aff',
    fontWeight: '500',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#636366',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4a4aff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: '300',
    marginTop: -2,
  },
});
