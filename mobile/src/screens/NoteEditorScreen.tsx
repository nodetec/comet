import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Text,
} from 'react-native';
import {
  MarkdownTextInput,
  parseExpensiMark,
} from '@expensify/react-native-live-markdown';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNote } from '../hooks/use-note-queries';
import { useSaveNote } from '../hooks/use-note-mutations';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEditor'>;

const AUTOSAVE_DELAY = 1500;

const markdownStyle = {
  syntax: { color: '#636366' },
  bold: { fontWeight: 'bold' as const },
  italic: { fontStyle: 'italic' as const },
  strikethrough: { textDecorationLine: 'line-through' as const },
  h1: { fontSize: 28, fontWeight: 'bold' as const },
  blockquote: {
    borderColor: '#4a4aff',
    borderWidth: 3,
    marginLeft: 6,
    paddingLeft: 6,
  },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#2c2c2e',
    color: '#ff9f0a',
  },
  pre: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#2c2c2e',
    color: '#f0f0f0',
  },
  link: { color: '#4a9eff' },
  mentionHere: { color: '#ff9f0a', backgroundColor: '#2c2c2e' },
  mentionUser: { color: '#4a9eff', backgroundColor: '#2c2c2e' },
};

export function NoteEditorScreen({ route }: Props) {
  const { noteId } = route.params;
  const noteQuery = useNote(noteId);
  const saveNoteMutation = useSaveNote();

  const [markdown, setMarkdown] = useState('');
  const [initialized, setInitialized] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');

  // Load initial content from the note
  useEffect(() => {
    if (noteQuery.data && !initialized) {
      setMarkdown(noteQuery.data.markdown);
      lastSavedRef.current = noteQuery.data.markdown;
      setInitialized(true);
    }
  }, [noteQuery.data, initialized]);

  // Debounced auto-save
  const handleChange = useCallback(
    (text: string) => {
      setMarkdown(text);

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = setTimeout(() => {
        if (text !== lastSavedRef.current) {
          lastSavedRef.current = text;
          saveNoteMutation.mutate({ id: noteId, markdown: text });
        }
      }, AUTOSAVE_DELAY);
    },
    [noteId, saveNoteMutation],
  );

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      const current = lastSavedRef.current;
      // Flush pending save
      if (markdown !== current) {
        saveNoteMutation.mutate({ id: noteId, markdown });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (noteQuery.isLoading || !initialized) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <MarkdownTextInput
        parser={parseExpensiMark}
        style={styles.editor}
        value={markdown}
        onChangeText={handleChange}
        markdownStyle={markdownStyle}
        multiline
        autoFocus
        textAlignVertical="top"
        placeholder="Start writing..."
        placeholderTextColor="#636366"
        scrollEnabled
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1c1c1e',
  },
  editor: {
    flex: 1,
    padding: 16,
    fontSize: 17,
    lineHeight: 26,
    color: '#f0f0f0',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
  },
  loadingText: {
    color: '#8e8e93',
    fontSize: 16,
  },
});
