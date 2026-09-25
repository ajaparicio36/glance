import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MapWebScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#F6F8F4]">
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-xs font-semibold uppercase tracking-[0.16em] text-[#647368]">
          GLANCE
        </Text>
        <Text accessibilityRole="header" className="mt-2 text-2xl font-semibold text-[#20352A]">
          Map preview
        </Text>
        <Text className="mt-2 max-w-sm text-center text-sm leading-6 text-[#647368]">
          The livestock map demo is available in the iOS and Android apps.
        </Text>
      </View>
    </SafeAreaView>
  );
}
