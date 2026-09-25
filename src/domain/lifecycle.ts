export type PositionStatus = 'inside' | 'outside' | 'returned';
export type PositionEvent = 'inside' | 'breached' | 'outside_unchanged' | 'returned';

export type LifecycleDecision = {
  event: PositionEvent;
  status: PositionStatus;
  resolveActiveViolation: boolean;
  createViolation: boolean;
};

export function assertCanSimulate(
  action: 'breach' | 'return',
  hasPlacedInsidePosition: boolean,
  hasActiveViolation: boolean,
): void {
  if (action === 'breach') {
    if (hasActiveViolation) {
      throw new Error('Return this device inside the geofence before simulating another breach.');
    }
    if (!hasPlacedInsidePosition) {
      throw new Error('Place this device inside the geofence before simulating a breach.');
    }
  }
  if (action === 'return' && !hasActiveViolation) {
    throw new Error('This device has no active Outside incident to return.');
  }
}

export function assertCanRemoveDevice(hasActiveViolation: boolean): void {
  if (hasActiveViolation) {
    throw new Error('Return this device inside the geofence before removing it.');
  }
}

export function evaluateLifecycle(
  isInside: boolean,
  hasActiveViolation: boolean,
): LifecycleDecision {
  if (isInside && hasActiveViolation) {
    return {
      event: 'returned',
      status: 'returned',
      resolveActiveViolation: true,
      createViolation: false,
    };
  }

  if (!isInside && hasActiveViolation) {
    return {
      event: 'outside_unchanged',
      status: 'outside',
      resolveActiveViolation: false,
      createViolation: false,
    };
  }

  if (!isInside) {
    return {
      event: 'breached',
      status: 'outside',
      resolveActiveViolation: false,
      createViolation: true,
    };
  }

  return {
    event: 'inside',
    status: 'inside',
    resolveActiveViolation: false,
    createViolation: false,
  };
}
