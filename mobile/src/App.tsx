import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NoteListScreen } from './screens/NoteListScreen';
import { NoteEditorScreen } from './screens/NoteEditorScreen';
import { SettingsScreen } from './screens/SettingsScreen';

export type RootStackParamList = {
  NoteList: undefined;
  NoteEditor: { noteId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const darkTheme = {
  dark: true,
  colors: {
    primary: '#4a4aff',
    background: '#1c1c1e',
    card: '#1c1c1e',
    text: '#f0f0f0',
    border: '#2a2a2e',
    notification: '#ff453a',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '800' as const },
  },
};

export function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer theme={darkTheme}>
          <StatusBar barStyle="light-content" />
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: '#1c1c1e' },
              headerTintColor: '#f0f0f0',
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen
              name="NoteList"
              component={NoteListScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="NoteEditor"
              component={NoteEditorScreen}
              options={{
                title: '',
                headerBackTitle: 'Notes',
              }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Settings' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
