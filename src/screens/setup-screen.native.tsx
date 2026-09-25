import { Link } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import GlanceMap from '@/components/glance-map';
import type { Coordinate as MapCoordinate } from '@/components/glance-map.types';
import {
  addDemoDevice,
  removeDemoDevice,
  saveGeofence,
  type DemoDevice,
} from '@/data/demo-store';
import { isPointInPolygon, validatePolygon } from '@/domain/geofence';
import { useDemoSnapshot } from '@/hooks/use-demo-snapshot';

type SetupAction = 'geofence' | 'device' | `remove:${string}` | null;

const NO_DEVICES: DemoDevice[] = [];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'The change could not be saved. Try again.';
}

function toMapCoordinate(position: { latitude: number; longitude: number }): MapCoordinate {
  return [position.longitude, position.latitude];
}

function formatPosition(position: { latitude: number; longitude: number } | null): string {
  return position
    ? `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`
    : 'No position yet';
}

export default function SetupScreen() {
  const { snapshot, isLoading, loadError, refresh } = useDemoSnapshot();
  const [draftVertices, setDraftVertices] = useState<MapCoordinate[]>([]);
  const [isEditingFence, setIsEditingFence] = useState(false);
  const [isConfirmingReplacement, setIsConfirmingReplacement] = useState(false);
  const [deviceIdInput, setDeviceIdInput] = useState('');
  const [pendingAction, setPendingAction] = useState<SetupAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const savedPolygon = useMemo(
    () => snapshot?.geofence?.vertices.map(toMapCoordinate) ?? [],
    [snapshot?.geofence?.vertices],
  );
  const draftCoordinates = useMemo(
    () => draftVertices.map(([longitude, latitude]) => ({ latitude, longitude })),
    [draftVertices],
  );
  const validation = useMemo(() => validatePolygon(draftCoordinates), [draftCoordinates]);
  const validVertices = validation.valid ? validation.vertices : null;
  const devices = snapshot?.devices ?? NO_DEVICES;
  const mapDevices = useMemo(
    () =>
      devices.flatMap((device) =>
        device.position
          ? [{ id: device.id, coordinate: toMapCoordinate(device.position) }]
          : [],
      ),
    [devices],
  );
  const hasSavedFence = snapshot?.geofence !== null && snapshot?.geofence !== undefined;
  const isBusy = pendingAction !== null;

  function beginFenceEdit(): void {
    setDraftVertices([]);
    setIsEditingFence(true);
    setIsConfirmingReplacement(false);
    setActionError(null);
    setNotice(null);
  }

  function cancelFenceEdit(): void {
    setDraftVertices([]);
    setIsEditingFence(false);
    setIsConfirmingReplacement(false);
    setActionError(null);
    setNotice(null);
  }

  async function persistFence(vertices: typeof validVertices): Promise<void> {
    if (!vertices || isBusy) return;
    setPendingAction('geofence');
    setActionError(null);
    setNotice(null);

    try {
      const result = await saveGeofence(vertices);
      setDraftVertices([]);
      setIsEditingFence(false);
      setIsConfirmingReplacement(false);
      setNotice(
        result.replaced
          ? 'Geofence replaced. Device positions were cleared and history was kept.'
          : 'Geofence saved.',
      );
      try {
        await refresh();
      } catch (error) {
        setActionError(`Geofence saved, but the setup data could not be refreshed: ${getErrorMessage(error)}`);
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  function saveFence(): void {
    if (!validation.valid) {
      setActionError(validation.error);
      return;
    }

    if (hasSavedFence) {
      setActionError(null);
      setIsConfirmingReplacement(true);
      return;
    }

    void persistFence(validation.vertices);
  }

  function addMapVertex(coordinate: MapCoordinate): void {
    setDraftVertices((currentVertices) => [...currentVertices, coordinate]);
    setActionError(null);
  }

  function undoLastVertex(): void {
    setDraftVertices((currentVertices) => currentVertices.slice(0, -1));
    setActionError(null);
  }

  async function handleAddDevice(): Promise<void> {
    const id = deviceIdInput.trim();
    if (!id) {
      setActionError('Enter a device ID.');
      return;
    }
    if (devices.length >= 5) {
      setActionError('A maximum of five devices can be configured.');
      return;
    }
    if (devices.some((device) => device.id.toLowerCase() === id.toLowerCase())) {
      setActionError(`Device ID “${id}” is already configured.`);
      return;
    }

    setPendingAction('device');
    setActionError(null);
    setNotice(null);
    try {
      await addDemoDevice(id);
      setDeviceIdInput('');
      setNotice(`Device “${id}” added.`);
      try {
        await refresh();
      } catch (error) {
        setActionError(`Device added, but the setup list could not be refreshed: ${getErrorMessage(error)}`);
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveDevice(id: string): Promise<void> {
    if (isBusy) return;
    setPendingAction(`remove:${id}`);
    setActionError(null);
    setNotice(null);
    try {
      await removeDemoDevice(id);
      setNotice(`Device “${id}” removed.`);
      try {
        await refresh();
      } catch (error) {
        setActionError(`Device removed, but the setup list could not be refreshed: ${getErrorMessage(error)}`);
      }
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setPendingAction(null);
    }
  }

  const panelError = actionError ?? loadError;
  const mapHeader = (
    <View className="absolute left-3 right-20 top-2 flex-row items-center justify-between rounded-3xl border border-[#E4EAE3] bg-white px-4 py-3">
      <View>
        <Text className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#647368]">
          GLANCE
        </Text>
        <Text accessibilityRole="header" className="text-xl font-semibold text-[#20352A]">
          Setup
        </Text>
      </View>
      <Link href="/" asChild>
        <Pressable
          accessibilityLabel="Return to Map"
          accessibilityRole="button"
          className="flex-row items-center gap-2 rounded-2xl bg-[#EDF3EE] px-3 py-2 active:opacity-75">
          <Ionicons color="#35664D" name="map-outline" size={18} />
          <Text className="text-sm font-semibold text-[#315A44]">Map</Text>
        </Pressable>
      </Link>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-[#F6F8F4]" edges={['top']}>
      <View className="relative flex-1">
        <View className="absolute inset-0">
          <GlanceMap
            devices={mapDevices}
            editMode={isEditingFence}
            onMapPress={isEditingFence ? addMapVertex : undefined}
            polygon={savedPolygon}
            previewVertices={draftVertices}
          />
        </View>
        {mapHeader}
        <View
          pointerEvents="none"
          className="absolute left-3 right-20 top-[76px] z-40">
          <Text className="self-start rounded-lg border border-[#DCE5DC] bg-white px-2 py-1 text-[9px] font-medium leading-3 text-[#415349]">
            © OpenStreetMap contributors · OpenFreeMap
          </Text>
        </View>

        <ScrollView
          className="absolute bottom-0 left-0 right-0 max-h-[58%]"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View className="gap-3 rounded-t-[28px] border border-[#E4EAE3] bg-[#F6F8F4] px-4 pb-6 pt-4">
            {isEditingFence ? (
              <View className="rounded-3xl border border-[#D6E3D8] bg-white p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-[#647368]">
                      {hasSavedFence ? 'Replace geofence' : 'New geofence'}
                    </Text>
                    <Text className="mt-1 text-lg font-semibold text-[#20352A]">
                      Tap the map to add points
                    </Text>
                    <Text className="mt-1 text-sm leading-5 text-[#647368]">
                      Add at least three points in boundary order. The closing point is added for you.
                    </Text>
                  </View>
                  <View className="rounded-2xl bg-[#EDF3EE] px-3 py-2">
                    <Text className="text-sm font-semibold text-[#315A44]">
                      {draftVertices.length} points
                    </Text>
                  </View>
                </View>
                <Text
                  accessibilityRole={validation.valid ? undefined : 'alert'}
                  className={`mt-3 text-xs leading-5 ${validation.valid ? 'text-[#35664D]' : 'text-[#8B3F24]'}`}>
                  {validation.valid
                    ? 'Boundary is ready to save.'
                    : validation.error}
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    accessibilityLabel="Undo the last geofence point"
                    accessibilityRole="button"
                    disabled={draftVertices.length === 0 || isBusy}
                    onPress={undoLastVertex}
                    className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#EDF3EE] px-3 ${draftVertices.length === 0 || isBusy ? 'opacity-45' : 'active:opacity-75'}`}>
                    <Ionicons color="#315A44" name="arrow-undo-outline" size={17} />
                    <Text className="text-sm font-semibold text-[#315A44]">Undo</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={draftVertices.length === 0 || isBusy}
                    onPress={() => {
                      setDraftVertices([]);
                      setActionError(null);
                    }}
                    className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#EDF3EE] px-3 ${draftVertices.length === 0 || isBusy ? 'opacity-45' : 'active:opacity-75'}`}>
                    <Ionicons color="#315A44" name="trash-outline" size={17} />
                    <Text className="text-sm font-semibold text-[#315A44]">Clear</Text>
                  </Pressable>
                </View>
                <View className="mt-2 flex-row gap-2">
                  <Pressable
                    accessibilityRole="button"
                    disabled={isBusy}
                    onPress={cancelFenceEdit}
                    className={`min-h-12 flex-1 items-center justify-center rounded-2xl border border-[#D6E3D8] bg-white px-3 ${isBusy ? 'opacity-45' : 'active:opacity-75'}`}>
                    <Text className="font-semibold text-[#315A44]">Cancel</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={!validation.valid || isBusy}
                    onPress={saveFence}
                    className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#35664D] px-3 ${!validation.valid || isBusy ? 'opacity-45' : 'active:opacity-75'}`}>
                    <Ionicons color="#FFFFFF" name="checkmark-outline" size={18} />
                    <Text className="font-semibold text-white">
                      {pendingAction === 'geofence' ? 'Saving…' : 'Save geofence'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View className="rounded-3xl border border-[#E4EAE3] bg-white p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-[#647368]">
                      Geofence
                    </Text>
                    <Text className="mt-1 text-lg font-semibold text-[#20352A]">
                      {snapshot?.geofence ? 'Boundary saved' : 'No boundary yet'}
                    </Text>
                    <Text className="mt-1 text-sm leading-5 text-[#647368]">
                      {snapshot?.geofence
                        ? `${snapshot.geofence.vertices.length} points · updated ${snapshot.geofence.updatedAt}`
                        : 'Draw a boundary on the map to begin tracking demo positions.'}
                    </Text>
                  </View>
                  <Ionicons
                    color="#35664D"
                    name={snapshot?.geofence ? 'checkmark-circle-outline' : 'map-outline'}
                    size={22}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy || isLoading || !snapshot}
                  onPress={beginFenceEdit}
                  className={`mt-3 min-h-11 flex-row items-center justify-center gap-2 rounded-2xl bg-[#35664D] px-4 ${isBusy || isLoading || !snapshot ? 'opacity-45' : 'active:opacity-75'}`}>
                  <Ionicons color="#FFFFFF" name="pencil-outline" size={17} />
                  <Text className="font-semibold text-white">
                    {snapshot?.geofence ? 'Replace geofence' : 'Draw geofence'}
                  </Text>
                </Pressable>
              </View>
            )}

            <View className="rounded-3xl border border-[#E4EAE3] bg-white p-4">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-[#647368]">
                    Demo devices
                  </Text>
                  <Text className="mt-1 text-lg font-semibold text-[#20352A]">
                    {devices.length} of 5 added
                  </Text>
                </View>
                <Ionicons color="#35664D" name="radio-outline" size={22} />
              </View>
              <View className="mt-3 flex-row gap-2">
                <TextInput
                  accessibilityLabel="Device ID"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isBusy && devices.length < 5}
                  onChangeText={setDeviceIdInput}
                  onSubmitEditing={() => void handleAddDevice()}
                  placeholder="Enter a device ID"
                  placeholderTextColor="#849187"
                  returnKeyType="done"
                  value={deviceIdInput}
                  className="min-h-12 flex-1 rounded-2xl border border-[#DCE5DC] bg-[#FBFCFA] px-4 text-base text-[#20352A]"
                />
                <Pressable
                  accessibilityLabel="Add demo device"
                  accessibilityRole="button"
                  disabled={isBusy || devices.length >= 5 || !snapshot}
                  onPress={() => void handleAddDevice()}
                  className={`min-h-12 flex-row items-center justify-center gap-1 rounded-2xl bg-[#35664D] px-3 ${isBusy || devices.length >= 5 || !snapshot ? 'opacity-45' : 'active:opacity-75'}`}>
                  <Ionicons color="#FFFFFF" name="add" size={19} />
                  <Text className="font-semibold text-white">Add</Text>
                </Pressable>
              </View>

              {devices.length === 0 ? (
                <Text className="mt-3 text-sm leading-5 text-[#647368]">
                  Add one or more IDs to simulate locations on the Map tab.
                </Text>
              ) : (
                <View className="mt-3 gap-2">
                  {devices.map((device) => {
                    const isInside = Boolean(
                      device.position &&
                        snapshot?.geofence &&
                        isPointInPolygon(device.position, snapshot.geofence.vertices),
                    );
                    const hasActiveViolation = Boolean(
                      snapshot?.geofence && device.position && !isInside,
                    );
                    const removalPending = pendingAction === `remove:${device.id}`;
                    return (
                      <View
                        className="flex-row items-center justify-between gap-3 rounded-2xl bg-[#F6F8F4] px-3 py-3"
                        key={device.id}>
                        <View className="flex-1">
                          <Text className="text-sm font-semibold text-[#20352A]">{device.id}</Text>
                          <Text className="mt-1 text-xs text-[#647368]">
                            {device.position
                              ? `${isInside ? 'Inside' : 'Outside'} · ${formatPosition(device.position)}`
                              : 'Position not set'}
                          </Text>
                          {hasActiveViolation ? (
                            <Text className="mt-1 text-xs text-[#8B3F24]">
                              Return inside the geofence before removing.
                            </Text>
                          ) : null}
                        </View>
                        <Pressable
                          accessibilityLabel={`Remove device ${device.id}`}
                          accessibilityRole="button"
                          disabled={isBusy || hasActiveViolation}
                          onPress={() => void handleRemoveDevice(device.id)}
                          className={`min-h-10 flex-row items-center gap-1 rounded-xl px-2 ${isBusy || hasActiveViolation ? 'opacity-45' : 'active:opacity-75'}`}>
                          <Ionicons color="#8B3F24" name="trash-outline" size={17} />
                          <Text className="text-xs font-semibold text-[#8B3F24]">
                            {removalPending ? 'Removing…' : 'Remove'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {notice ? (
              <Text className="rounded-2xl bg-[#E8F1E9] px-3 py-2 text-xs text-[#315A44]">
                {notice}
              </Text>
            ) : null}
            {panelError ? (
              <Text
                accessibilityRole="alert"
                className="rounded-2xl bg-[#FFF1E8] px-3 py-2 text-xs text-[#8B3F24]">
                {panelError}
              </Text>
            ) : null}
            {!snapshot && loadError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setActionError(null);
                  void refresh().catch((error: unknown) => setActionError(getErrorMessage(error)));
                }}
                className="min-h-11 items-center justify-center rounded-2xl bg-[#35664D] px-4 active:opacity-75">
                <Text className="font-semibold text-white">Try again</Text>
              </Pressable>
            ) : null}
            {isLoading && !snapshot ? (
              <Text className="text-center text-sm text-[#647368]">Loading saved setup…</Text>
            ) : null}
          </View>
        </ScrollView>

        {isConfirmingReplacement && validVertices ? (
          <View className="absolute inset-0 z-30 items-center justify-center bg-[#14261E]/55 px-5">
            <View
              accessibilityRole="alert"
              className="w-full max-w-md rounded-3xl bg-white p-5">
              <Text accessibilityRole="header" className="text-lg font-semibold text-[#20352A]">
                Replace saved geofence?
              </Text>
              <Text className="mt-2 text-sm leading-6 text-[#647368]">
                Saving this boundary clears current device positions. Device IDs and violation
                history stay saved. Any active Outside incident will be marked Fence changed with
                its resolution time.
              </Text>
              {actionError ? (
                <Text accessibilityRole="alert" className="mt-3 text-sm text-[#8B3F24]">
                  {actionError}
                </Text>
              ) : null}
              <Pressable
                accessibilityLabel="Confirm replacement and clear simulated positions"
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => void persistFence(validVertices)}
                className={`mt-4 min-h-12 items-center justify-center rounded-2xl bg-[#35664D] px-4 ${isBusy ? 'opacity-45' : 'active:opacity-75'}`}>
                <Text className="font-semibold text-white">
                  {pendingAction === 'geofence' ? 'Saving…' : 'Replace geofence'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isBusy}
                onPress={() => setIsConfirmingReplacement(false)}
                className={`mt-2 min-h-11 items-center justify-center rounded-2xl px-4 ${isBusy ? 'opacity-45' : 'active:opacity-75'}`}>
                <Text className="font-semibold text-[#315A44]">Cancel replacement</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
