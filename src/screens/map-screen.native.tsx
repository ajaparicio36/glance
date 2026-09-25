import { Link } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ViolationHistory } from '@/components/violation-history';
import GlanceMap from '@/components/glance-map';
import type { Coordinate as MapCoordinate } from '@/components/glance-map.types';
import {
  placeHerdInside,
  setVisualBuzzer,
  simulateBreach,
  simulateReturn,
  type DemoSnapshot,
  type PositionUpdate,
} from '@/data/demo-store';
import { isPointInPolygon } from '@/domain/geofence';
import { useDemoSnapshot } from '@/hooks/use-demo-snapshot';
import { getErrorMessage } from '@/utils/error-message';

type MapActionName = 'inside' | 'breach' | 'return' | 'buzzer';

type MapActionProps = {
  accessibilityLabel: string;
  disabled: boolean;
  icon: string;
  label: string;
  onPress: () => void;
};

function MapAction({ accessibilityLabel, disabled, icon, label, onPress }: MapActionProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-[62px] flex-1 items-center justify-center gap-1 rounded-2xl border border-[#E4EAE3] bg-white px-1 py-2 ${disabled ? 'opacity-45' : 'active:opacity-75'}`}>
      <Ionicons color={disabled ? '#94A097' : '#35664D'} name={icon} size={19} />
      <Text className="text-center text-[10px] font-semibold leading-3 text-[#314A3C]">{label}</Text>
    </Pressable>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositionUpdate(value: unknown): value is PositionUpdate {
  if (!isRecord(value)) return false;
  const event = value.event;
  const status = value.status;
  const position = value.position;
  return (
    (event === 'inside' ||
      event === 'breached' ||
      event === 'outside_unchanged' ||
      event === 'returned') &&
    (status === 'inside' || status === 'outside' || status === 'returned') &&
    isRecord(position) &&
    typeof position.latitude === 'number' &&
    typeof position.longitude === 'number' &&
    typeof value.detectedAt === 'string' &&
    isRecord(value.device) &&
    typeof value.device.id === 'string'
  );
}

function positionUpdates(result: unknown): PositionUpdate[] {
  const candidates = Array.isArray(result) ? result : [result];
  return candidates.filter(isPositionUpdate);
}

function toMapCoordinate(position: { latitude: number; longitude: number }): MapCoordinate {
  return [position.longitude, position.latitude];
}

function formatPosition(position: { latitude: number; longitude: number }): string {
  return `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`;
}

function samePosition(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): boolean {
  return (
    Math.abs(first.latitude - second.latitude) < 1e-9 &&
    Math.abs(first.longitude - second.longitude) < 1e-9
  );
}

function isEventAlertCurrent(update: PositionUpdate, snapshot: DemoSnapshot): boolean {
  if (update.event === 'breached') {
    return snapshot.violations.some(
      (violation) =>
        violation.deviceId === update.device.id &&
        violation.resolution === null &&
        violation.outsideAt === update.detectedAt &&
        samePosition(violation.outsidePosition, update.position),
    );
  }

  if (update.event === 'returned') {
    return snapshot.violations.some(
      (violation) =>
        violation.deviceId === update.device.id &&
        violation.resolution === 'returned' &&
        violation.resolvedAt === update.detectedAt &&
        violation.returnedPosition !== null &&
        samePosition(violation.returnedPosition, update.position),
    );
  }

  return false;
}

export default function MapScreen() {
  const { snapshot, isLoading, loadError, refresh } = useDemoSnapshot();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<MapActionName | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [eventAlert, setEventAlert] = useState<PositionUpdate | null>(null);

  const polygon = useMemo(
    () => snapshot?.geofence?.vertices.map(toMapCoordinate) ?? [],
    [snapshot?.geofence?.vertices],
  );
  const mapDevices = useMemo(
    () =>
      snapshot?.devices.flatMap((device) =>
        device.position
          ? [{ id: device.id, coordinate: toMapCoordinate(device.position) }]
          : [],
      ) ?? [],
    [snapshot?.devices],
  );
  const selectedDevice =
    snapshot?.devices.find((device) => device.id === selectedDeviceId) ?? snapshot?.devices[0];
  const visibleEventAlert =
    eventAlert && snapshot && isEventAlertCurrent(eventAlert, snapshot) ? eventAlert : null;
  const deviceIsInside = Boolean(
    selectedDevice?.position &&
      snapshot?.geofence &&
      isPointInPolygon(selectedDevice.position, snapshot.geofence.vertices),
  );
  const hasFence = Boolean(snapshot?.geofence);
  const hasDevices = Boolean(snapshot?.devices.length);
  const canPlaceHerdInside = hasFence && hasDevices;
  const canSimulateBreach = Boolean(hasFence && selectedDevice?.position && deviceIsInside);
  const canSimulateReturn = Boolean(hasFence && selectedDevice?.position && !deviceIsInside);

  async function runMutation(
    action: MapActionName,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    if (pendingAction) return;
    setPendingAction(action);
    setActionError(null);

    try {
      let result: unknown;
      try {
        result = await operation();
      } catch (error) {
        setActionError(getErrorMessage(error, 'The action could not be completed. Try again.'));
        return;
      }

      const updates = positionUpdates(result);
      for (const update of updates) {
        if (update.event === 'breached' || update.event === 'returned') {
          setEventAlert(update);
        }
      }

      try {
        await refresh();
      } catch (error) {
        setActionError(`Action saved, but the map could not be refreshed: ${getErrorMessage(error, 'The map could not be refreshed.')}`);
      }
    } finally {
      setPendingAction(null);
    }
  }

  function toggleVisualBuzzer(): void {
    if (!selectedDevice) return;
    void runMutation('buzzer', () =>
      setVisualBuzzer(selectedDevice.id, !selectedDevice.buzzerEnabled),
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#F6F8F4]" edges={['top']}>
      <View className="relative flex-1">
        <View className="absolute inset-0">
          <GlanceMap
            devices={mapDevices}
            onDevicePress={setSelectedDeviceId}
            polygon={polygon}
            selectedDeviceId={selectedDevice?.id ?? null}
          />
        </View>

        <View className="absolute left-3 right-20 top-2 flex-row items-center justify-between rounded-3xl border border-[#E4EAE3] bg-white px-4 py-3">
          <View>
            <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#647368]">
              GLANCE
            </Text>
            <Text accessibilityRole="header" className="text-xl font-semibold text-[#20352A]">
              Map
            </Text>
          </View>
          <Link href="/explore" asChild>
            <Pressable
              accessibilityLabel="Open Setup"
              accessibilityRole="button"
              className="flex-row items-center gap-2 rounded-2xl bg-[#EDF3EE] px-3 py-2 active:opacity-75">
              <Ionicons color="#35664D" name="options-outline" size={18} />
              <Text className="text-sm font-semibold text-[#315A44]">Setup</Text>
            </Pressable>
          </Link>
        </View>

        {visibleEventAlert ? (
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            className="absolute left-3 right-20 top-[76px] rounded-2xl border border-[#F0D6B8] bg-[#FFF9F0] p-3">
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-sm font-bold text-[#793E1C]">
                  {visibleEventAlert.status === 'outside' ? 'Outside' : 'Returned'} · {visibleEventAlert.device.id}
                </Text>
                <Text className="mt-1 text-xs text-[#765A47]">
                  {formatPosition(visibleEventAlert.position)} · {visibleEventAlert.detectedAt}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Dismiss alert"
                accessibilityRole="button"
                onPress={() => setEventAlert(null)}
                className="p-1">
                <Ionicons color="#793E1C" name="close" size={18} />
              </Pressable>
            </View>
          </View>
        ) : null}

        <View className="absolute bottom-10 left-3 right-3 gap-2">
          {isLoading && !snapshot ? (
            <View className="items-center gap-2 rounded-3xl border border-[#E4EAE3] bg-white p-5">
              <ActivityIndicator color="#35664D" />
              <Text className="text-sm text-[#647368]">Loading saved map data…</Text>
            </View>
          ) : null}

          {!isLoading && !snapshot && loadError ? (
            <View className="rounded-3xl border border-[#E4EAE3] bg-white p-5">
              <Text className="text-base font-semibold text-[#20352A]">Map data unavailable</Text>
              <Text className="mt-1 text-sm leading-5 text-[#647368]">{loadError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void refresh().catch((error: unknown) =>
                    setActionError(getErrorMessage(error, 'The map could not be refreshed.')),
                  );
                }}
                className="mt-3 min-h-11 items-center justify-center rounded-2xl bg-[#35664D] px-4 active:opacity-75">
                <Text className="font-semibold text-white">Try again</Text>
              </Pressable>
            </View>
          ) : null}

          {snapshot && !hasFence ? (
            <>
              <View className="rounded-3xl border border-[#E4EAE3] bg-white p-4">
                <Text className="text-base font-semibold text-[#20352A]">No geofence saved</Text>
                <Text className="mt-1 text-sm leading-5 text-[#647368]">
                  Draw a boundary in Setup to see your herd on the map.
                </Text>
                <Link href="/explore" asChild>
                  <Pressable
                    accessibilityRole="button"
                    className="mt-3 min-h-11 items-center justify-center rounded-2xl bg-[#35664D] px-4 active:opacity-75">
                    <Text className="font-semibold text-white">Set up geofence</Text>
                  </Pressable>
                </Link>
              </View>
              {snapshot.violations.length > 0 ? (
                <ViolationHistory violations={snapshot.violations} />
              ) : null}
            </>
          ) : null}

          {snapshot && hasFence && !hasDevices ? (
            <>
              <View className="rounded-3xl border border-[#E4EAE3] bg-white p-4">
                <Text className="text-base font-semibold text-[#20352A]">No demo devices yet</Text>
                <Text className="mt-1 text-sm leading-5 text-[#647368]">
                  Add a device ID in Setup before simulating a location.
                </Text>
                <Link href="/explore" asChild>
                  <Pressable
                    accessibilityRole="button"
                    className="mt-3 min-h-11 items-center justify-center rounded-2xl bg-[#35664D] px-4 active:opacity-75">
                    <Text className="font-semibold text-white">Add a device</Text>
                  </Pressable>
                </Link>
              </View>
              {snapshot.violations.length > 0 ? (
                <ViolationHistory violations={snapshot.violations} />
              ) : null}
            </>
          ) : null}

          {snapshot && hasFence && hasDevices && selectedDevice ? (
            <>
              <View className="rounded-3xl border border-[#E4EAE3] bg-white p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-[#647368]">
                      Selected device
                    </Text>
                    <Text className="mt-1 text-lg font-semibold text-[#20352A]">
                      {selectedDevice.id}
                    </Text>
                    <Text className="mt-1 text-sm text-[#647368]">
                      {selectedDevice.position
                        ? `${deviceIsInside ? 'Inside' : 'Outside'} · ${formatPosition(selectedDevice.position)}`
                        : 'Position not set · place the herd inside to begin'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Visual buzzer ${selectedDevice.buzzerEnabled ? 'on' : 'off'}`}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: selectedDevice.buzzerEnabled }}
                    disabled={pendingAction !== null}
                    onPress={toggleVisualBuzzer}
                    className={`min-h-11 flex-row items-center gap-2 rounded-2xl px-3 ${selectedDevice.buzzerEnabled ? 'bg-[#E5F0E7]' : 'bg-[#F1F3F0]'} ${pendingAction ? 'opacity-60' : 'active:opacity-75'}`}>
                    <Ionicons
                      color={selectedDevice.buzzerEnabled ? '#35664D' : '#78867C'}
                      name={selectedDevice.buzzerEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
                      size={18}
                    />
                    <View>
                      <Text className="text-[10px] font-semibold uppercase text-[#647368]">
                        Visual buzzer
                      </Text>
                      <Text className="text-xs font-semibold text-[#20352A]">
                        {selectedDevice.buzzerEnabled ? 'On' : 'Off'}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              </View>

              <View className="flex-row gap-2">
                <MapAction
                  accessibilityLabel="Place herd inside the saved geofence"
                  disabled={!canPlaceHerdInside || pendingAction !== null}
                  icon="locate-outline"
                  label={pendingAction === 'inside' ? 'Placing…' : 'Place herd inside'}
                  onPress={() => void runMutation('inside', placeHerdInside)}
                />
                <MapAction
                  accessibilityLabel={`Simulate a breach for ${selectedDevice.id}`}
                  disabled={!canSimulateBreach || pendingAction !== null}
                  icon="warning-outline"
                  label={pendingAction === 'breach' ? 'Moving…' : 'Simulate breach'}
                  onPress={() =>
                    void runMutation('breach', () => simulateBreach(selectedDevice.id))
                  }
                />
                <MapAction
                  accessibilityLabel={`Simulate a return for ${selectedDevice.id}`}
                  disabled={!canSimulateReturn || pendingAction !== null}
                  icon="return-up-back-outline"
                  label={pendingAction === 'return' ? 'Returning…' : 'Simulate return'}
                  onPress={() =>
                    void runMutation('return', () => simulateReturn(selectedDevice.id))
                  }
                />
              </View>

              <ViolationHistory violations={snapshot.violations} />
            </>
          ) : null}

          {snapshot && (actionError || loadError) ? (
            <Text
              accessibilityRole="alert"
              className="rounded-2xl bg-[#FFF1E8] px-3 py-2 text-xs text-[#8B3F24]">
              {actionError ?? loadError}
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
