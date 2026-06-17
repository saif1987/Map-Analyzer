/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProjectMode = 'globe' | 'mercator' | 'equal-earth' | 'natural-earth';

export type AnalysisMode = 'none' | 'distance' | 'nearest' | 'influence';

export interface GeoPoint {
  lat: number;
  lng: number;
  name?: string;
  countryName?: string;
}

export interface NearestCountryResult {
  countryId: string;
  name: string;
  distanceKm: number;
  closestLandPoint: [number, number]; // [lng, lat]
  originPoint: [number, number]; // [lng, lat]
}

export interface BorderInfluenceResult {
  countryId: string;
  name: string;
  minDistanceKm: number;
  isCovered: boolean; // whether closer than the user-specified distance limit
  closestSourcePoint: [number, number]; // [lng, lat] coordinate on the active country's border
  closestTargetPoint: [number, number]; // [lng, lat] coordinate on this country's border
}

export interface RegionData {
  id: string;
  name: string;
  properties: {
    name: string;
    [key: string]: any;
  };
  geometry: any; // GeoJSON geometry (Polygon, MultiPolygon, etc.)
  type: string;
  bbox?: number[];
  centroid?: [number, number]; // [lng, lat]
}
