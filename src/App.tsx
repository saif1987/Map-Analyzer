/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import * as topojson from 'topojson-client';
import { 
  AnalysisMode, 
  ProjectMode, 
  RegionData, 
  NearestCountryResult, 
  BorderInfluenceResult 
} from './types';
import { 
  distanceKm, 
  extractGeometryCoordinates, 
  downsampleCoordinates, 
  isPointInsideFeature, 
  getCentroid, 
  calculateBBox 
} from './utils/geodesic';

import MapContainer from './components/MapContainer';
import AnalysisPanel from './components/AnalysisPanel';
import { Map, Loader2, Sparkles, AlertCircle, Compass } from 'lucide-react';

interface RichRegionData extends RegionData {
  centroid: [number, number];
  bbox: number[];
  boundingRadiusKm: number;
  downsampledCoords: [number, number][];
}

export default function App() {
  // Application Data States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingFactIdx, setLoadingFactIdx] = useState(0);

  const [countries, setCountries] = useState<RichRegionData[]>([]);
  const [landFeature, setLandFeature] = useState<any>(null);

  // Active Research State managers
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('distance');
  const [projectMode, setProjectMode] = useState<ProjectMode>('globe');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi' | 'nmi'>('km');

  // Point A to B Distance Tracking
  const [pointA, setPointA] = useState<[number, number] | null>(null);
  const [pointB, setPointB] = useState<[number, number] | null>(null);

  // Nearest Lands Tracking
  const [originPoint, setOriginPoint] = useState<[number, number] | null>([-74.0060, 40.7128]); // starts at NYC Coordinates for clean visual cue
  const [nearestLimit, setNearestLimit] = useState<number>(5);

  // Border Buffer Influence Tracking
  const [activeInfluenceCountry, setActiveInfluenceCountry] = useState<RichRegionData | null>(null);
  const [bufferRadiusKm, setBufferRadiusKm] = useState<number>(800);

  // Hover states
  const [hoveredCountryName, setHoveredCountryName] = useState<string | null>(null);

  // Informational facts displayed on load
  const loadFacts = [
    "Dividing planetary orbits into geodetic curves...",
    "Reconstructing continental coastlines from TopoJSON vectors...",
    "Implementing great-circle (geodesic) path equations on spherical projections...",
    "Analyzing geopolitical influence envelopes based on coordinate offsets...",
    "Resolving country boundaries with meter-level WGS-84 precision..."
  ];

  // Rotate loading facts
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setLoadingFactIdx(prev => (prev + 1) % loadFacts.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [loading]);

  // Read TopoJSON map layers from CDN on initial mount
  useEffect(() => {
    let active = true;
    const loadMapData = async () => {
      try {
        const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-10m.json');
        if (!response.ok) {
          throw new Error('Failed to retrieve world boundaries data (10m TopoJSON).');
        }
        const topology = await response.json();
        
        if (!active) return;

        // Decode land and countries layers using topojson-client
        const land = topojson.feature(topology, topology.objects.land);
        const countriesFeatureCollection = topojson.feature(topology, topology.objects.countries) as any;
        
        // Enrich country features with precomputed bounding coordinates, centroids and bounding radii to speed up live distance computations
        const rawFeatures = countriesFeatureCollection.features || [];
        const seenIds = new Set<string>();
        const enriched: RichRegionData[] = rawFeatures
          .map((f: any, idx: number) => {
            const rawCoords = extractGeometryCoordinates(f.geometry);
            const centroid = getCentroid(f);
            const bbox = calculateBBox(rawCoords);
            
            // Calculate country's maximum geographical bounding radius from its centroid to bounding corners
            const corners = [
              [bbox[0], bbox[1]],
              [bbox[0], bbox[3]],
              [bbox[2], bbox[1]],
              [bbox[2], bbox[3]]
            ] as [number, number][];
            const boundingRadiusKm = corners.length > 0
              ? Math.max(...corners.map(c => distanceKm(centroid, c)))
              : 0;

            const downsampledCoords = downsampleCoordinates(rawCoords, 80);

            let uniqueId = f.id?.toString() || '';
            if (!uniqueId || seenIds.has(uniqueId)) {
              uniqueId = uniqueId ? `${uniqueId}-${idx}` : `country-${idx}`;
            }
            seenIds.add(uniqueId);

            return {
              id: uniqueId,
              name: f.properties?.name || `Unnamed Territory (${f.id})`,
              properties: f.properties || {},
              geometry: f.geometry,
              type: f.type,
              centroid,
              bbox,
              boundingRadiusKm,
              downsampledCoords
            };
          })
          .filter(c => c.name && c.name.trim() !== '' && c.id !== '010'); // Filter out empty strings or Antarctica coordinate noise, keeps results neat

        setLandFeature(land);
        setCountries(enriched);
        
        // Auto-select a friendly country on start
        const initialFocus = enriched.find(c => c.name === 'United States' || c.name === 'Germany') || enriched[0];
        if (initialFocus) {
          setActiveInfluenceCountry(initialFocus);
        }

        setLoading(false);
      } catch (err: any) {
        if (active) {
          setError(err?.message || 'Unexpected failure loading planetary geography charts.');
          setLoading(false);
        }
      }
    };

    loadMapData();
    return () => {
      active = false;
    };
  }, []);

  // Point A to B Distance Form Controls
  const resetDistancePoints = () => {
    setPointA(null);
    setPointB(null);
  };

  const handleManualPointsSet = (pA: [number, number] | null, pB: [number, number] | null) => {
    setPointA(pA);
    setPointB(pB);
  };

  const handleManualOriginSet = (origin: [number, number]) => {
    setOriginPoint(origin);
  };

  // Click handler triggered from internal Map Viewport
  const handleMapClick = (coordinates: [number, number]) => {
    // Tab dependent trigger actions
    if (analysisMode === 'distance') {
      if (!pointA) {
        setPointA(coordinates);
      } else if (!pointB) {
        setPointB(coordinates);
      } else {
        setPointA(coordinates);
        setPointB(null);
      }
    } 
    else if (analysisMode === 'nearest') {
      setOriginPoint(coordinates);
    } 
    else if (analysisMode === 'influence') {
      // Find land country at click point coordinates
      const clickedCountry = countries.find(c => isPointInsideFeature(coordinates, c));
      if (clickedCountry) {
        setActiveInfluenceCountry(clickedCountry);
      } else {
        // Safe spatial recovery: if clicked in ocean, locate the closest country overall and focus it
        let minOceanCentroidDist = Infinity;
        let fallbackCountry: RichRegionData | null = null;
        
        countries.forEach(c => {
          const d = distanceKm(coordinates, c.centroid);
          if (d < minOceanCentroidDist) {
            minOceanCentroidDist = d;
            fallbackCountry = c;
          }
        });

        if (fallbackCountry) {
          setActiveInfluenceCountry(fallbackCountry);
        }
      }
    }
  };

  // SPECIAL FEATURE 2: Compute Nearest Countries relative to Origin Point
  const nearestResults = useMemo(() => {
    if (analysisMode !== 'nearest' || !originPoint || countries.length === 0) return [];
    
    const results = countries.map(country => {
      // 1. Is point inside this country? Distance is 0!
      const inside = isPointInsideFeature(originPoint, country);
      if (inside) {
        return {
          countryId: country.id,
          name: country.name,
          distanceKm: 0,
          closestLandPoint: originPoint,
          originPoint
        };
      }

      // 2. Otherwise run hierarchal boundary coordinates solver
      const rawCoords = extractGeometryCoordinates(country.geometry);
      // Fallback iscentroid distance check
      let minDistanceKm = distanceKm(originPoint, country.centroid);
      let closestPoint = country.centroid;

      if (rawCoords.length > 0) {
        // 1st pass check: if downsampled centroid distance is extremely far, don't sweat full resolution
        const step = Math.max(1, Math.floor(rawCoords.length / 50));
        let closeSampleDist = Infinity;
        let closestSample = rawCoords[0];
        
        for (let i = 0; i < rawCoords.length; i += step) {
          const d = distanceKm(originPoint, rawCoords[i]);
          if (d < closeSampleDist) {
            closeSampleDist = d;
            closestSample = rawCoords[i];
          }
        }

        // 2nd pass: Refine search around sample coordinates
        const centerIdx = rawCoords.indexOf(closestSample);
        const start = Math.max(0, centerIdx - 50);
        const end = Math.min(rawCoords.length, centerIdx + 50);

        for (let i = start; i < end; i++) {
          const d = distanceKm(originPoint, rawCoords[i]);
          if (d < minDistanceKm) {
            minDistanceKm = d;
            closestPoint = rawCoords[i];
          }
        }
      }

      return {
        countryId: country.id,
        name: country.name,
        distanceKm: minDistanceKm,
        closestLandPoint: closestPoint,
        originPoint
      };
    });

    return results
      .filter(r => r.name && r.name !== 'Antarctica') // Skip Antarctica details
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, nearestLimit);
  }, [analysisMode, originPoint, countries, nearestLimit]);

  // SPECIAL FEATURE 3: Geopolitical Border Buffer overlap calculation
  // Find other countries falling inside a defined physical buffer from Active Country borders
  const influenceResults = useMemo(() => {
    if (analysisMode !== 'influence' || !activeInfluenceCountry || countries.length === 0) return [];

    const activeCentroid = activeInfluenceCountry.centroid;
    const activeRadius = activeInfluenceCountry.boundingRadiusKm;
    const activeCoords = activeInfluenceCountry.downsampledCoords;

    const results = countries
      .filter(c => c.id !== activeInfluenceCountry.id && c.name !== 'Antarctica')
      .map(country => {
        const otherCentroid = country.centroid;
        const otherRadius = country.boundingRadiusKm;

        // 1. Structural Bounding check
        // If distance between centroids minus combined bounding spheres is greater than the search radius, they cannot intersect!
        const centroidDist = distanceKm(activeCentroid, otherCentroid);
        const lowerBoundDist = centroidDist - activeRadius - otherRadius;

        if (lowerBoundDist > bufferRadiusKm + 100) {
          return {
            countryId: country.id,
            name: country.name,
            minDistanceKm: lowerBoundDist, // reliable estimate bound
            isCovered: false,
            closestSourcePoint: activeCentroid,
            closestTargetPoint: otherCentroid
          };
        }

        // 2. Point containment verification
        // Check if either centroid lies within the other to catch land boundaries enveloping cases
        const targetInsideSource = isPointInsideFeature(otherCentroid, activeInfluenceCountry);
        if (targetInsideSource) {
          return {
            countryId: country.id,
            name: country.name,
            minDistanceKm: 0,
            isCovered: true,
            closestSourcePoint: otherCentroid,
            closestTargetPoint: otherCentroid
          };
        }

        // 3. Dense pairwise check of downsampled boundary coords
        const otherCoords = country.downsampledCoords;
        let minPairwiseKm = Infinity;
        let srcPoint = activeCentroid;
        let trgPoint = otherCentroid;

        for (let i = 0; i < activeCoords.length; i++) {
          const p = activeCoords[i];
          for (let j = 0; j < otherCoords.length; j++) {
            const q = otherCoords[j];
            const d = distanceKm(p, q);
            if (d < minPairwiseKm) {
              minPairwiseKm = d;
              srcPoint = p;
              trgPoint = q;
            }
          }
        }

        return {
          countryId: country.id,
          name: country.name,
          minDistanceKm: minPairwiseKm,
          isCovered: minPairwiseKm <= bufferRadiusKm,
          closestSourcePoint: srcPoint,
          closestTargetPoint: trgPoint
        };
      });

    // Sort showing covered countries first, followed by nearest outside neighbors
    return results
      .sort((a, b) => {
        if (a.isCovered && !b.isCovered) return -1;
        if (!a.isCovered && b.isCovered) return 1;
        return a.minDistanceKm - b.minDistanceKm;
      })
      .slice(0, 15); // Show top 15 closest neighborhood profiles
  }, [analysisMode, activeInfluenceCountry, countries, bufferRadiusKm]);

  // Visual Loading screen overlay
  if (loading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-brand-bg text-brand-text font-sans selection:bg-brand-border">
        <div className="absolute inset-0 bg-radial from-slate-900 via-slate-950 to-black opacity-90" />
        <div className="relative flex flex-col items-center max-w-sm px-6 text-center space-y-6 z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-accent/20 rounded-full blur-xl animate-pulse" />
            <Loader2 className="w-12 h-12 text-brand-accent animate-spin" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight text-brand-text flex items-center justify-center gap-2 font-display">
              <Sparkles className="w-4 h-4 text-brand-accent animate-pulse" />
              Geodesic Analyzer Initializing
            </h2>
            <div className="h-1 w-24 bg-brand-border rounded-full mx-auto overflow-hidden">
              <div className="h-full bg-brand-accent rounded-full animate-[loading-bar_1.8s_ease-in-out_infinite]" style={{ width: '60%' }} />
            </div>
          </div>

          <div className="min-h-[40px] flex items-center justify-center">
            <p className="text-brand-text-dim text-xs font-mono leading-relaxed italic animate-pulse">
              {loadFacts[loadingFactIdx]}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Visual error boundary setup
  if (error) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-brand-bg text-brand-text font-sans p-6">
        <div className="p-6 bg-brand-panel border border-red-500/30 rounded-2xl shadow-xl max-w-md text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold text-brand-text font-display">Geographical Dataset Fault</h2>
          <p className="text-brand-text-dim text-xs leading-relaxed font-mono">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-2.5 bg-brand-accent hover:bg-brand-accent/90 text-brand-bg font-bold rounded-xl text-xs transition-colors font-sans"
          >
            Attempt Reload
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col lg:flex-row bg-brand-bg select-none overflow-hidden text-brand-text font-sans">
      
      {/* 1. Left hand Dynamic Map Viewport section */}
      <div className="flex-1 relative min-h-[400px] lg:h-full bg-brand-bg">
        <MapContainer
          countries={countries}
          landFeature={landFeature}
          analysisMode={analysisMode}
          projectMode={projectMode}
          pointA={pointA}
          pointB={pointB}
          originPoint={originPoint}
          nearestResults={nearestResults}
          influenceResults={influenceResults}
          activeInfluenceCountry={activeInfluenceCountry}
          bufferRadiusKm={bufferRadiusKm}
          onMapClick={handleMapClick}
          onHoverCountry={setHoveredCountryName}
        />
      </div>

      {/* 2. Right hand Side Analysis Panel dashboard controls */}
      <AnalysisPanel
        countries={countries}
        analysisMode={analysisMode}
        projectMode={projectMode}
        distanceUnit={distanceUnit}
        pointA={pointA}
        pointB={pointB}
        originPoint={originPoint}
        nearestResults={nearestResults}
        influenceResults={influenceResults}
        activeInfluenceCountry={activeInfluenceCountry}
        bufferRadiusKm={bufferRadiusKm}
        nearestLimit={nearestLimit}
        onSelectAnalysisMode={setAnalysisMode}
        onSelectProjectMode={setProjectMode}
        onSelectDistanceUnit={setDistanceUnit}
        onResetDistancePoints={resetDistancePoints}
        onSelectInfluenceCountry={c => setActiveInfluenceCountry(c as RichRegionData | null)}
        onUpdateBufferDistance={setBufferRadiusKm}
        onUpdateNearestLimit={setNearestLimit}
        onManualPointsSet={handleManualPointsSet}
        onManualOriginSet={handleManualOriginSet}
      />
    </div>
  );
}
