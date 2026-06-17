/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as d3 from 'd3';

const EARTH_RADIUS_KM = 6371.0088;
const KM_TO_MILES = 0.621371192;
const KM_TO_NAUTICAL_MILES = 0.539956803;

/**
 * Calculates geodesic (great-circle) distance in radians between two points.
 * Points are [lon, lat] (or [lng, lat]) in degrees.
 */
export function geodesicDistanceRad(p1: [number, number], p2: [number, number]): number {
  if (p1[0] === p2[0] && p1[1] === p2[1]) return 0;
  
  const lon1 = (p1[0] * Math.PI) / 180;
  const lat1 = (p1[1] * Math.PI) / 180;
  const lon2 = (p2[0] * Math.PI) / 180;
  const lat2 = (p2[1] * Math.PI) / 180;

  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  // Clamp is essential to prevent NaN due to rounding issues on antipodal points
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, Math.min(1, a))), Math.sqrt(Math.max(0, Math.min(1, 1 - a))));
  return c;
}

/**
 * Converts radians distance to kilometers.
 */
export function radToKm(rad: number): number {
  return rad * EARTH_RADIUS_KM;
}

/**
 * Direct distance in KM between two [lng, lat] coordinates.
 */
export function distanceKm(p1: [number, number], p2: [number, number]): number {
  return radToKm(geodesicDistanceRad(p1, p2));
}

/**
 * Formats a distance with the specified units.
 */
export function formatDistance(km: number, unit: 'km' | 'mi' | 'nmi' = 'km'): string {
  if (unit === 'mi') {
    return `${(km * KM_TO_MILES).toLocaleString(undefined, { maximumFractionDigits: 1 })} mi`;
  }
  if (unit === 'nmi') {
    return `${(km * KM_TO_NAUTICAL_MILES).toLocaleString(undefined, { maximumFractionDigits: 1 })} nmi`;
  }
  return `${km.toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
}

/**
 * Computes the initial bearing (forward azimuth) from p1 to p2 in degrees (0 to 360).
 */
export function calculateBearing(p1: [number, number], p2: [number, number]): number {
  const lon1 = (p1[0] * Math.PI) / 180;
  const lat1 = (p1[1] * Math.PI) / 180;
  const lon2 = (p2[0] * Math.PI) / 180;
  const lat2 = (p2[1] * Math.PI) / 180;

  const dLon = lon2 - lon1;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Decodes the initial bearing to cardinal directions.
 */
export function formatBearing(degrees: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return `${degrees.toFixed(1)}° (${directions[index]})`;
}

/**
 * Recursively extracts all coordinates [lng, lat] from a GeoJSON geometry.
 */
export function extractGeometryCoordinates(geometry: any): [number, number][] {
  const coords: [number, number][] = [];
  if (!geometry) return coords;

  const recurse = (arr: any) => {
    if (arr.length === 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      coords.push(arr as [number, number]);
      return;
    }
    if (Array.isArray(arr)) {
      for (const item of arr) {
        recurse(item);
      }
    }
  };

  if (geometry.type === 'Point') {
    coords.push(geometry.coordinates);
  } else if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    recurse(geometry.coordinates);
  } else if (geometry.type === 'Polygon' || geometry.type === 'MultiLineString') {
    recurse(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    recurse(geometry.coordinates);
  } else if (geometry.type === 'GeometryCollection') {
    if (Array.isArray(geometry.geometries)) {
      for (const geom of geometry.geometries) {
        coords.push(...extractGeometryCoordinates(geom));
      }
    }
  }

  return coords;
}

/**
 * Downsamples an array of coordinates to at most maxPoints while keeping the structure.
 */
export function downsampleCoordinates(coords: [number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints || maxPoints <= 0) return coords;
  
  const step = coords.length / maxPoints;
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.floor(i * step);
    result.push(coords[idx]);
  }
  // Ensure the polygon loop endpoint is preserved if we downsampled polygon vertices
  if (coords.length > 1 && result.length > 0) {
    const lastOrig = coords[coords.length - 1];
    const lastResult = result[result.length - 1];
    if (lastOrig[0] === coords[0][0] && lastOrig[1] === coords[0][1] && (lastResult[0] !== lastOrig[0] || lastResult[1] !== lastOrig[1])) {
      result.push(lastOrig);
    }
  }
  return result;
}

/**
 * Checks if a point [lng, lat] falls inside any country's polygons.
 * Safe spherical polygon containment check using D3.
 */
export function isPointInsideFeature(point: [number, number], feature: any): boolean {
  try {
    return d3.geoContains(feature, point);
  } catch (e) {
    return false;
  }
}

/**
 * Finds the closest point on a country's boundaries from an origin.
 * Leverages hierarchal search (initial pass downsampled, then full resolution check on top candidates)
 */
export function findClosestPointOnLand(
  origin: [number, number],
  allCoordinates: [number, number][]
): { point: [number, number]; distanceKm: number } {
  if (allCoordinates.length === 0) {
    return { point: origin, distanceKm: 0 };
  }

  // To speed up search loop for regions with thousands of points, do initial pass on downsampled grid
  let targetCoords = allCoordinates;
  if (allCoordinates.length > 500) {
    // 1st pass: Fast search on downsampled coords
    const sampled = downsampleCoordinates(allCoordinates, 120);
    let minSampleDist = Infinity;
    let closestSampleIdx = 0;
    
    for (let i = 0; i < sampled.length; i++) {
      const d = geodesicDistanceRad(origin, sampled[i]);
      if (d < minSampleDist) {
        minSampleDist = d;
        closestSampleIdx = i;
      }
    }

    // Identify corresponding index in the original array and search its continuous neighborhood
    const step = allCoordinates.length / 120;
    const origCenterIdx = Math.floor(closestSampleIdx * step);
    const searchHalfWidth = Math.max(100, Math.floor(step * 1.5));
    
    const startIdx = Math.max(0, origCenterIdx - searchHalfWidth);
    const endIdx = Math.min(allCoordinates.length, origCenterIdx + searchHalfWidth);
    
    let minPreciseDist = Infinity;
    let finalClosestPoint = allCoordinates[origCenterIdx];
    
    for (let i = startIdx; i < endIdx; i++) {
       const d = geodesicDistanceRad(origin, allCoordinates[i]);
       if (d < minPreciseDist) {
         minPreciseDist = d;
         finalClosestPoint = allCoordinates[i];
       }
    }
    
    return {
      point: finalClosestPoint,
      distanceKm: radToKm(minPreciseDist)
    };
  }

  // Fallback: Full scan of small coordinate lists
  let minDistanceRad = Infinity;
  let closestPoint = allCoordinates[0];

  for (let i = 0; i < allCoordinates.length; i++) {
    const distRad = geodesicDistanceRad(origin, allCoordinates[i]);
    if (distRad < minDistanceRad) {
      minDistanceRad = distRad;
      closestPoint = allCoordinates[i];
    }
  }

  return {
    point: closestPoint,
    distanceKm: radToKm(minDistanceRad),
  };
}

/**
 * Centroid calculation for a region
 */
export function getCentroid(feature: any): [number, number] {
  try {
    const ctr = d3.geoCentroid(feature);
    if (ctr && !isNaN(ctr[0]) && !isNaN(ctr[1])) {
      return ctr;
    }
  } catch (e) {
    // If geoCentroid fails (e.g. invalid self-intersecting polygon), fallback to coordinate average
    const coords = extractGeometryCoordinates(feature.geometry);
    if (coords.length > 0) {
      let lons = 0, lats = 0;
      coords.forEach(p => { lons += p[0]; lats += p[1]; });
      return [lons / coords.length, lats / coords.length];
    }
  }
  return [0, 0];
}

/**
 * Calculates the bounding box of a collection of coordinates [minLng, minLat, maxLng, maxLat]
 */
export function calculateBBox(coords: [number, number][]): number[] {
  if (coords.length === 0) return [0, 0, 0, 0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  coords.forEach(([lng, lat]) => {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return [minLng, minLat, maxLng, maxLat];
}
