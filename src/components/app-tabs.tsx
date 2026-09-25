import { Tabs } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#35664D',
        tabBarInactiveTintColor: '#78867C',
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E4EAE3',
          borderTopWidth: 1,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarAccessibilityLabel: 'Map tab',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Setup',
          tabBarAccessibilityLabel: 'Setup tab',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'options' : 'options-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
