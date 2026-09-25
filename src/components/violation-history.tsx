import { ScrollView, Text, View } from 'react-native';

import type { Violation } from '@/data/demo-store';

type ViolationHistoryProps = {
  violations: readonly Violation[];
};

function formatCoordinate(position: Violation['outsidePosition']): string {
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

function getStatus(violation: Violation): 'Outside' | 'Returned' | 'Fence changed' {
  if (violation.resolution === 'returned') return 'Returned';
  if (violation.resolution === 'fence_changed') return 'Fence changed';
  return 'Outside';
}

export function ViolationHistory({ violations }: ViolationHistoryProps) {
  const newestFirst = [...violations]
    .sort((first, second) => second.outsideAt.localeCompare(first.outsideAt))
    .slice(0, 10);

  return (
    <View className="rounded-3xl border border-[#E4EAE3] bg-white p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-base font-semibold text-[#20352A]">Recent activity</Text>
        <Text className="text-xs text-[#647368]">{newestFirst.length} of 10</Text>
      </View>

      {newestFirst.length === 0 ? (
        <Text className="text-sm leading-5 text-[#647368]">No geofence events yet.</Text>
      ) : (
        <ScrollView className="max-h-36" showsVerticalScrollIndicator={false}>
          <View className="gap-2 pb-1">
            {newestFirst.map((violation) => {
              const status = getStatus(violation);
              return (
                <View
                  className="rounded-2xl bg-[#F6F8F4] px-3 py-2"
                  key={violation.id}
                  accessibilityLabel={`${status} for ${violation.deviceId}`}>
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-semibold text-[#20352A]">
                      {violation.deviceId}
                    </Text>
                    <Text
                      className={`text-xs font-semibold ${status === 'Outside' ? 'text-[#A34728]' : 'text-[#647368]'}`}>
                      {status}
                    </Text>
                  </View>
                  <Text className="mt-1 text-xs text-[#647368]">
                    Outside · {formatCoordinate(violation.outsidePosition)} · {violation.outsideAt}
                  </Text>
                  {violation.resolution === 'returned' && violation.resolvedAt ? (
                    <Text className="mt-1 text-xs text-[#647368]">
                      Returned ·{' '}
                      {violation.returnedPosition
                        ? `${formatCoordinate(violation.returnedPosition)} · `
                        : ''}
                      {violation.resolvedAt}
                    </Text>
                  ) : null}
                  {violation.resolution === 'fence_changed' && violation.resolvedAt ? (
                    <Text className="mt-1 text-xs text-[#647368]">
                      Fence changed · {violation.resolvedAt}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
