export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type PolygonValidation =
  | { valid: true; vertices: Coordinate[] }
  | { valid: false; error: string };

export const isValidCoordinate = (value: unknown): value is Coordinate => {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.latitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    candidate.latitude >= -90 &&
    candidate.latitude <= 90 &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.longitude) &&
    candidate.longitude >= -180 &&
    candidate.longitude <= 180
  );
};

const samePoint = (left: Coordinate, right: Coordinate): boolean =>
  left.latitude === right.latitude && left.longitude === right.longitude;

const cross = (a: Coordinate, b: Coordinate, c: Coordinate): number =>
  (b.longitude - a.longitude) * (c.latitude - a.latitude) -
  (b.latitude - a.latitude) * (c.longitude - a.longitude);

const onSegment = (a: Coordinate, b: Coordinate, point: Coordinate): boolean =>
  cross(a, b, point) === 0 &&
  point.longitude >= Math.min(a.longitude, b.longitude) &&
  point.longitude <= Math.max(a.longitude, b.longitude) &&
  point.latitude >= Math.min(a.latitude, b.latitude) &&
  point.latitude <= Math.max(a.latitude, b.latitude);

const segmentsIntersect = (
  a: Coordinate,
  b: Coordinate,
  c: Coordinate,
  d: Coordinate,
): boolean => {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);

  if (
    ((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) &&
    ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))
  ) {
    return true;
  }

  return (
    (abC === 0 && onSegment(a, b, c)) ||
    (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) ||
    (cdB === 0 && onSegment(c, d, b))
  );
};

const signedDoubleArea = (vertices: readonly Coordinate[]): number => {
  let area = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    area += current.longitude * next.latitude - next.longitude * current.latitude;
  }
  return area;
};

export function validatePolygon(value: unknown): PolygonValidation {
  if (!Array.isArray(value)) {
    return { valid: false, error: 'Add at least three map vertices.' };
  }

  const vertices: Coordinate[] = [];
  for (const candidate of value) {
    if (!isValidCoordinate(candidate)) {
      return {
        valid: false,
        error: 'Every vertex must use a valid latitude and longitude.',
      };
    }
    vertices.push({
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    });
  }

  if (vertices.length > 1 && samePoint(vertices[0], vertices[vertices.length - 1])) {
    vertices.pop();
  }

  if (vertices.length < 3) {
    return { valid: false, error: 'Add at least three distinct map vertices.' };
  }

  const uniquePoints = new Set(vertices.map(({ latitude, longitude }) => `${latitude},${longitude}`));
  if (uniquePoints.size !== vertices.length) {
    return {
      valid: false,
      error: 'A vertex can only appear once; the closing point is added automatically.',
    };
  }

  for (let left = 0; left < vertices.length; left += 1) {
    const leftNext = (left + 1) % vertices.length;
    for (let right = left + 1; right < vertices.length; right += 1) {
      const rightNext = (right + 1) % vertices.length;
      if (leftNext === right || rightNext === left) continue;
      if (segmentsIntersect(vertices[left], vertices[leftNext], vertices[right], vertices[rightNext])) {
        return {
          valid: false,
          error: 'The fence edges cannot cross or touch each other.',
        };
      }
    }
  }

  for (let index = 0; index < vertices.length; index += 1) {
    const previous = vertices[(index + vertices.length - 1) % vertices.length];
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    if (
      cross(previous, current, next) === 0 &&
      (previous.longitude - current.longitude) * (next.longitude - current.longitude) +
        (previous.latitude - current.latitude) * (next.latitude - current.latitude) >
        0
    ) {
      return {
        valid: false,
        error: 'Two neighboring fence edges cannot overlap.',
      };
    }
  }

  if (signedDoubleArea(vertices) === 0) {
    return { valid: false, error: 'The fence must enclose an area.' };
  }

  return { valid: true, vertices };
}

export function getValidatedPolygon(vertices: readonly Coordinate[]): Coordinate[] {
  const result = validatePolygon(vertices);
  if (!result.valid) throw new Error(result.error);
  return result.vertices;
}

export function closePolygonRing(vertices: readonly Coordinate[]): Coordinate[] {
  const polygon = getValidatedPolygon(vertices);
  return [...polygon, { ...polygon[0] }];
}

const pointInValidatedPolygon = (
  point: Coordinate,
  polygon: readonly Coordinate[],
): boolean => {
  let inside = false;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];

    if (onSegment(current, next, point)) return true;

    const crossesLatitude =
      (current.latitude > point.latitude) !== (next.latitude > point.latitude);
    if (!crossesLatitude) continue;

    const crossingLongitude =
      current.longitude +
      ((point.latitude - current.latitude) * (next.longitude - current.longitude)) /
        (next.latitude - current.latitude);
    if (point.longitude < crossingLongitude) inside = !inside;
  }

  return inside;
};

export function isPointInPolygon(point: Coordinate, vertices: readonly Coordinate[]): boolean {
  if (!isValidCoordinate(point)) return false;
  return pointInValidatedPolygon(point, getValidatedPolygon(vertices));
}

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export function getDeterministicInsidePoint(
  vertices: readonly Coordinate[],
  seed = 'glance',
): Coordinate {
  const polygon = getValidatedPolygon(vertices);
  const levels = [...new Set(polygon.map(({ latitude }) => latitude))].sort((a, b) => a - b);
  const candidates: Coordinate[] = [];

  for (let level = 0; level < levels.length - 1; level += 1) {
    const latitude = (levels[level] + levels[level + 1]) / 2;
    const crossings: number[] = [];

    for (let edge = 0; edge < polygon.length; edge += 1) {
      const current = polygon[edge];
      const next = polygon[(edge + 1) % polygon.length];
      if ((current.latitude > latitude) === (next.latitude > latitude)) continue;
      crossings.push(
        current.longitude +
          ((latitude - current.latitude) * (next.longitude - current.longitude)) /
            (next.latitude - current.latitude),
      );
    }

    crossings.sort((a, b) => a - b);
    for (let crossing = 0; crossing + 1 < crossings.length; crossing += 2) {
      const left = crossings[crossing];
      const right = crossings[crossing + 1];
      if (right <= left) continue;
      for (const fraction of [0.5, 0.25, 0.75]) {
        const candidate = {
          latitude,
          longitude: left + (right - left) * fraction,
        };
        if (pointInValidatedPolygon(candidate, polygon)) candidates.push(candidate);
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('Could not find an inside point for this fence.');
  }

  return candidates[stableHash(seed) % candidates.length];
}

export function getDeterministicOutsidePoint(
  vertices: readonly Coordinate[],
  seed = 'glance',
): Coordinate {
  const polygon = getValidatedPolygon(vertices);
  const winding = Math.sign(signedDoubleArea(polygon));
  const start = stableHash(seed) % polygon.length;

  for (let offset = 0; offset < polygon.length; offset += 1) {
    const index = (start + offset) % polygon.length;
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const dx = next.longitude - current.longitude;
    const dy = next.latitude - current.latitude;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;

    const direction = winding > 0 ? 1 : -1;
    const outwardLongitude = (dy / length) * direction;
    const outwardLatitude = (-dx / length) * direction;
    const midpoint = {
      longitude: (current.longitude + next.longitude) / 2,
      latitude: (current.latitude + next.latitude) / 2,
    };
    const maximumStep = length * 0.125;
    let step = Math.min(maximumStep, Math.max(length * 1e-9, 1e-10));

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = {
        longitude: midpoint.longitude + outwardLongitude * step,
        latitude: midpoint.latitude + outwardLatitude * step,
      };
      if (isValidCoordinate(candidate) && !pointInValidatedPolygon(candidate, polygon)) {
        return candidate;
      }
      if (step >= maximumStep) break;
      step = Math.min(maximumStep, step * 2);
    }
  }

  throw new Error('Could not find a valid outside point within latitude and longitude bounds.');
}
