/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  AnalysisMode, 
  ProjectMode, 
  RegionData, 
  NearestCountryResult, 
  BorderInfluenceResult 
} from '../types';
import { 
  formatDistance, 
  calculateBearing, 
  formatBearing 
} from '../utils/geodesic';
import { 
  Route, 
  Radio, 
  ShieldAlert, 
  MapPin, 
  Compass, 
  Globe, 
  HelpCircle, 
  Trash2, 
  Sliders, 
  Layers, 
  Search,
  ExternalLink
} from 'lucide-react';

interface AnalysisPanelProps {
  countries: RegionData[];
  analysisMode: AnalysisMode;
  projectMode: ProjectMode;
  distanceUnit: 'km' | 'mi' | 'nmi';
  pointA: [number, number] | null;
  pointB: [number, number] | null;
  originPoint: [number, number] | null;
  nearestResults: NearestCountryResult[];
  influenceResults: BorderInfluenceResult[];
  activeInfluenceCountry: RegionData | null;
  bufferRadiusKm: number;
  nearestLimit: number;
  onSelectAnalysisMode: (mode: AnalysisMode) => void;
  onSelectProjectMode: (mode: ProjectMode) => void;
  onSelectDistanceUnit: (unit: 'km' | 'mi' | 'nmi') => void;
  onResetDistancePoints: () => void;
  onSelectInfluenceCountry: (country: RegionData | null) => void;
  onUpdateBufferDistance: (km: number) => void;
  onUpdateNearestLimit: (limit: number) => void;
  onManualPointsSet: (pointA: [number, number] | null, pointB: [number, number] | null) => void;
  onManualOriginSet: (origin: [number, number]) => void;
}

export default function AnalysisPanel({
  countries,
  analysisMode,
  projectMode,
  distanceUnit,
  pointA,
  pointB,
  originPoint,
  nearestResults,
  influenceResults,
  activeInfluenceCountry,
  bufferRadiusKm,
  nearestLimit,
  onSelectAnalysisMode,
  onSelectProjectMode,
  onSelectDistanceUnit,
  onResetDistancePoints,
  onSelectInfluenceCountry,
  onUpdateBufferDistance,
  onUpdateNearestLimit,
  onManualPointsSet,
  onManualOriginSet,
}: AnalysisPanelProps) {
  // Local UI status state
  const [countrySearch, setCountrySearch] = useState('');
  const [manLatA, setManLatA] = useState('');
  const [manLngA, setManLngA] = useState('');
  const [manLatB, setManLatB] = useState('');
  const [manLngB, setManLngB] = useState('');
  const [manLatO, setManLatO] = useState('');
  const [manLngO, setManLngO] = useState('');

  // Sorter count lists
  const sortedCountries = useMemo(() => {
    return [...countries].sort((a, b) => a.name.localeCompare(b.name));
  }, [countries]);

  const filteredCountriesList = useMemo(() => {
    if (!countrySearch.trim()) return sortedCountries.slice(0, 8);
    const query = countrySearch.toLowerCase();
    return sortedCountries.filter(c => c.name.toLowerCase().includes(query)).slice(0, 10);
  }, [sortedCountries, countrySearch]);

  // Point A / B geodesic routing calculations
  const geodesicDistanceCalculated = useMemo(() => {
    if (!pointA || !pointB) return null;
    const lat1 = pointA[1], lng1 = pointA[0];
    const lat2 = pointB[1], lng2 = pointB[0];

    // Compute great-circle distance (using radians distance times Earth Radius)
    const dLon = ((lng2 - lng1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = c * 6371.0088;

    const bearing = calculateBearing(pointA, pointB);
    const reverseBearing = calculateBearing(pointB, pointA);

    return {
      distanceKm: distKm,
      bearing,
      reverseBearing,
      midpoint: [
        (lng1 + lng2) / 2, // simple approximate midpoint for display reference
        (lat1 + lat2) / 2
      ]
    };
  }, [pointA, pointB]);

  // Handle Point A Manual coordinates override
  const handleManualSetA = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manLatA);
    const lng = parseFloat(manLngA);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      onManualPointsSet([lng, lat], pointB);
    }
  };

  // Handle Point B Manual coordinates override
  const handleManualSetB = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manLatB);
    const lng = parseFloat(manLngB);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      onManualPointsSet(pointA, [lng, lat]);
    }
  };

  // Handle Origin Manual coordinates override
  const handleManualOrigin = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(manLatO);
    const lng = parseFloat(manLngO);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      onManualOriginSet([lng, lat]);
    }
  };

  return (
    <div className="w-full lg:w-[420px] shrink-0 flex flex-col bg-brand-panel border-b lg:border-b-0 border-brand-border shadow-2xl overflow-hidden font-sans">
      
      {/* Sleek Tool Branding section */}
      <div className="p-4 bg-slate-950 text-brand-text flex items-center justify-between border-b border-brand-border">
        <div>
          <h1 className="text-base font-bold tracking-tight text-brand-text flex items-center gap-2 font-display">
            <Globe className="w-5 h-5 text-brand-accent animate-[spin_45s_linear_infinite]" />
            Geodesic Map Analyzer
          </h1>
          <p className="text-[10px] text-brand-text-dim mt-0.5">Geopolitical Educational Simulation Tool v1.1</p>
        </div>
        <div className="flex bg-brand-bg rounded-lg p-0.5 border border-brand-border">
          <button
            onClick={() => onSelectDistanceUnit('km')}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${distanceUnit === 'km' ? 'bg-brand-accent text-brand-bg' : 'text-brand-text-dim hover:text-white'}`}
          >
            KM
          </button>
          <button
            onClick={() => onSelectDistanceUnit('mi')}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${distanceUnit === 'mi' ? 'bg-brand-accent text-brand-bg' : 'text-brand-text-dim hover:text-white'}`}
          >
            MI
          </button>
          <button
            onClick={() => onSelectDistanceUnit('nmi')}
            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${distanceUnit === 'nmi' ? 'bg-brand-accent text-brand-bg' : 'text-brand-text-dim hover:text-white'}`}
          >
            NMI
          </button>
        </div>
      </div>

      {/* Map Projection controller strip */}
      <div className="px-4 py-2 bg-brand-bg/50 border-b border-brand-border flex items-center justify-between text-xs">
        <span className="text-brand-text-dim font-medium flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-brand-accent" />
          Map Projection:
        </span>
        <div className="flex gap-1">
          {(['globe', 'mercator', 'equal-earth', 'natural-earth'] as ProjectMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onSelectProjectMode(mode)}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border cursor-pointer transition-all ${
                projectMode === mode
                  ? 'bg-[#182030] border-brand-border text-brand-accent shadow-xs'
                  : 'bg-brand-panel border-brand-border text-brand-text-dim hover:bg-slate-700/60'
              }`}
            >
              {mode === 'equal-earth' ? 'Area-Equal' : mode === 'natural-earth' ? 'Natural' : mode}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Analytics Tab Navigation Switches */}
      <div className="grid grid-cols-3 border-b border-brand-border bg-brand-bg/30">
        <button
          onClick={() => onSelectAnalysisMode('distance')}
          className={`py-3 px-1 text-center border-b-2 font-bold text-xs flex flex-col items-center gap-1 transition-all cursor-pointer ${
            analysisMode === 'distance'
              ? 'border-brand-accent text-brand-accent bg-brand-panel'
              : 'border-transparent text-brand-text-dim hover:text-white hover:bg-slate-800/40'
          }`}
          id="tab-mode-distance"
        >
          <Route className="w-4 h-4 opacity-90" />
          Distance Line
        </button>
        <button
          onClick={() => onSelectAnalysisMode('nearest')}
          className={`py-3 px-1 text-center border-b-2 font-bold text-xs flex flex-col items-center gap-1 transition-all cursor-pointer ${
            analysisMode === 'nearest'
              ? 'border-brand-accent text-brand-accent bg-brand-panel'
              : 'border-transparent text-brand-text-dim hover:text-white hover:bg-slate-800/40'
          }`}
          id="tab-mode-nearest"
        >
          <Radio className="w-4 h-4 opacity-90" />
          Nearest Land
        </button>
        <button
          onClick={() => onSelectAnalysisMode('influence')}
          className={`py-3 px-1 text-center border-b-2 font-bold text-xs flex flex-col items-center gap-1 transition-all cursor-pointer ${
            analysisMode === 'influence'
              ? 'border-brand-accent text-brand-accent bg-brand-panel'
              : 'border-transparent text-brand-text-dim hover:text-white hover:bg-slate-800/40'
          }`}
          id="tab-mode-influence"
        >
          <ShieldAlert className="w-4 h-4 opacity-90" />
          Border Buffer
        </button>
      </div>

      {/* Main Tab Content - Scroll Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ==================== TAB 1: DISTANCE ROUTING ==================== */}
        {analysisMode === 'distance' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-3 bg-brand-bg/60 border border-brand-border rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-brand-accent tracking-wider uppercase flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" />
                How it works
              </span>
              <p className="text-brand-text-dim text-xs leading-relaxed">
                Click two points anywhere on the world map to calculate the exact <strong className="text-brand-accent">Geodesic Great-Circle distance</strong> (the shortest path across the curved spherical surface of the earth).
              </p>
            </div>

            {/* Coordinates Points summaries */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border border-brand-border rounded-xl bg-brand-bg/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-text-dim uppercase tracking-widest flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-brand-accent" /> Point A
                  </span>
                  {pointA && (
                    <button onClick={() => onManualPointsSet(null, pointB)} className="text-brand-text-dim hover:text-red-400 cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {pointA ? (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-xs font-mono font-bold text-brand-text">Lat: {pointA[1].toFixed(5)}°N</p>
                    <p className="text-xs font-mono font-bold text-brand-text">Lng: {pointA[0].toFixed(5)}°E</p>
                  </div>
                ) : (
                  <p className="text-xs text-brand-text-dim/60 mt-2 italic">Select point on map or enter manually below</p>
                )}
              </div>

              <div className="p-3 border border-brand-border rounded-xl bg-brand-bg/30">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-brand-text-dim uppercase tracking-widest flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-brand-accent" /> Point B
                  </span>
                  {pointB && (
                    <button onClick={() => onManualPointsSet(pointA, null)} className="text-brand-text-dim hover:text-red-400 cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {pointB ? (
                  <div className="mt-1.5 space-y-0.5">
                    <p className="text-xs font-mono font-bold text-brand-text">Lat: {pointB[1].toFixed(5)}°N</p>
                    <p className="text-xs font-mono font-bold text-brand-text">Lng: {pointB[0].toFixed(5)}°E</p>
                  </div>
                ) : (
                  <p className="text-xs text-brand-text-dim/60 mt-2 italic">Select point on map or enter manually below</p>
                )}
              </div>
            </div>

            {/* Live Distance calculation display */}
            {geodesicDistanceCalculated ? (
              <div className="p-4 border border-brand-border bg-brand-bg/80 rounded-xl shadow-md space-y-3">
                <div className="text-center pb-2 border-b border-brand-border">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-brand-text-dim">Sphere Geodesic Distance</p>
                  <p className="text-3xl font-extrabold text-brand-accent mt-1 font-display" id="calculated-distance-val">
                    {formatDistance(geodesicDistanceCalculated.distanceKm, distanceUnit)}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-brand-panel border border-brand-border rounded-lg">
                    <p className="text-[9px] uppercase font-bold text-brand-text-dim flex items-center gap-1">
                      <Compass className="w-3 h-3 text-brand-accent" /> Bearing A → B
                    </p>
                    <p className="font-mono font-semibold text-brand-text mt-0.5">
                      {formatBearing(geodesicDistanceCalculated.bearing)}
                    </p>
                  </div>
                  <div className="p-2 bg-brand-panel border border-brand-border rounded-lg">
                    <p className="text-[9px] uppercase font-bold text-brand-text-dim flex items-center gap-1">
                      <Compass className="w-3 h-3 text-brand-accent" /> Reciprocal Bearing
                    </p>
                    <p className="font-mono font-semibold text-brand-text mt-0.5">
                      {formatBearing(geodesicDistanceCalculated.reverseBearing)}
                    </p>
                  </div>
                </div>

                <div className="p-2 bg-brand-panel border border-brand-border rounded-lg text-xs space-y-0.5">
                  <p className="text-[9px] uppercase font-bold text-brand-text-dim">Geodesic Midpoint (Approx)</p>
                  <p className="font-mono text-brand-text">
                    Lat: {geodesicDistanceCalculated.midpoint[1].toFixed(4)}°, Lng: {geodesicDistanceCalculated.midpoint[0].toFixed(4)}°
                  </p>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={onResetDistancePoints}
                    className="flex-1 py-1.5 text-center bg-brand-border hover:bg-slate-700 hover:text-white text-brand-text-dim rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Clear Path Points
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-brand-border rounded-xl">
                <MapPin className="w-8 h-8 text-brand-text-dim/40 mx-auto animate-bounce mb-2" />
                <p className="text-brand-text text-xs font-medium">No active coordinates selected.</p>
                <p className="text-brand-text-dim text-[10px] mt-1 px-4 leading-relaxed">Click twice directly on the globe/map to measure a custom flight trajectory.</p>
              </div>
            )}

            {/* Manual Coordinates Entry Forms */}
            <div className="border border-brand-border rounded-xl overflow-hidden shadow-md">
              <div className="bg-brand-bg/50 px-3 py-2 border-b border-brand-border flex items-center justify-between">
                <span className="text-[10px] font-bold text-brand-text uppercase flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-brand-accent" /> Manual Coordinates inputs
                </span>
              </div>
              
              <div className="p-3 space-y-4 bg-brand-bg/20">
                {/* Form A */}
                <form onSubmit={handleManualSetA} className="space-y-2">
                  <span className="text-[10px] font-bold text-brand-accent block">POINT A OVERRIDE</span>
                  <div className="flex gap-2">
                    <input 
                      type="number" step="any" placeholder="Latitude (-90 to 90)" required
                      value={manLatA} onChange={e => setManLatA(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-brand-border rounded-lg bg-brand-bg text-brand-text font-mono focus:border-brand-accent focus:outline-hidden placeholder:text-brand-text-dim/40"
                    />
                    <input 
                      type="number" step="any" placeholder="Longitude (-180 to 180)" required
                      value={manLngA} onChange={e => setManLngA(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-brand-border rounded-lg bg-brand-bg text-brand-text font-mono focus:border-brand-accent focus:outline-hidden placeholder:text-brand-text-dim/40"
                    />
                    <button type="submit" className="px-3 py-1.5 bg-brand-accent hover:bg-sky-400 text-brand-bg text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm">
                      Set A
                    </button>
                  </div>
                </form>

                {/* Form B */}
                <form onSubmit={handleManualSetB} className="space-y-2 border-t border-brand-border pt-3">
                  <span className="text-[10px] font-bold text-brand-accent block">POINT B OVERRIDE</span>
                  <div className="flex gap-2">
                    <input 
                      type="number" step="any" placeholder="Latitude (-90 to 90)" required
                      value={manLatB} onChange={e => setManLatB(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-brand-border rounded-lg bg-brand-bg text-brand-text font-mono focus:border-brand-accent focus:outline-hidden placeholder:text-brand-text-dim/40"
                    />
                    <input 
                      type="number" step="any" placeholder="Longitude (-180 to 180)" required
                      value={manLngB} onChange={e => setManLngB(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 text-xs border border-brand-border rounded-lg bg-brand-bg text-brand-text font-mono focus:border-brand-accent focus:outline-hidden placeholder:text-brand-text-dim/40"
                    />
                    <button type="submit" className="px-3 py-1.5 bg-brand-accent hover:bg-sky-400 text-brand-bg text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm">
                      Set B
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: NEAREST COUNTRIES ==================== */}
        {analysisMode === 'nearest' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-3 bg-brand-bg/60 border border-brand-border rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-brand-accent tracking-wider uppercase flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-brand-accent" />
                How it works
              </span>
              <p className="text-brand-text-dim text-xs leading-relaxed">
                Click anywhere on the globe (including deep oceans). The system projects geodesic vectors outward to discover the **exact closest land borders** of the nearby nations, sorted by shortest great-circle distance!
              </p>
            </div>

            {/* Display Origin coordinate details */}
            <div className="p-3 border border-brand-border rounded-xl bg-brand-bg/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-brand-text-dim uppercase tracking-widest flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-brand-accent" /> Origin Point
                </span>
                {originPoint && (
                  <span className="text-[9px] font-semibold text-brand-accent bg-brand-accent/15 border border-brand-accent/30 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    Locked
                  </span>
                )}
              </div>
              {originPoint ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs font-mono font-bold text-brand-text">
                    Lat: {originPoint[1].toFixed(5)}°N, Lng: {originPoint[0].toFixed(5)}°E
                  </p>
                </div>
              ) : (
                <p className="text-xs text-brand-text-dim/60 italic">Select point on globe, or use the form below to begin</p>
              )}
            </div>

            {/* Adjust nearest search density limit (K nearest countries) */}
            <div className="p-3 border border-brand-border rounded-xl bg-brand-bg/15 space-y-2">
              <div className="flex justify-between text-xs font-medium text-brand-text">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-brand-text-dim" />
                  Show Nearest Nations Limit:
                </span>
                <span className="font-bold text-brand-accent">{nearestLimit} nations</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={nearestLimit}
                onChange={(e) => onUpdateNearestLimit(parseInt(e.target.value))}
                className="w-full accent-brand-accent cursor-pointer"
              />
            </div>

            {/* Nearest Land Results summary */}
            {nearestResults.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-brand-text-dim uppercase tracking-widest">Closest Land Borders Detected</h3>
                
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {nearestResults.map((result, idx) => (
                    <div 
                      key={result.countryId} 
                      className="p-3 bg-brand-bg/40 border border-brand-border rounded-xl hover:border-brand-accent/50 transition-all shadow-xs flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-brand-border font-bold px-1.5 py-0.5 rounded text-brand-text-dim">
                            #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-brand-text">{result.name}</span>
                        </div>
                        <p className="text-[10px] text-brand-text-dim font-mono">
                          Closest: {result.closestLandPoint[1].toFixed(4)}°N, {result.closestLandPoint[0].toFixed(4)}°E
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-extrabold text-brand-accent">
                          {formatDistance(result.distanceKm, distanceUnit)}
                        </p>
                        <div className="flex gap-2 justify-end mt-1">
                          <button
                            onClick={() => onManualPointsSet(result.originPoint, result.closestLandPoint)}
                            title="Set this geodesic path to Point A-B Tab"
                            className="text-[9px] font-bold text-brand-accent hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            Route <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center border-2 border-dashed border-brand-border rounded-xl">
                <Radio className="w-8 h-8 text-brand-text-dim/40 mx-auto animate-pulse mb-2" />
                <p className="text-brand-text text-xs font-medium">Waiting for Map point selection</p>
                <p className="text-brand-text-dim text-[10px] px-4 leading-relaxed mt-1">Click anywhere inside oceans or foreign landmasses to instantly trigger proximity scans.</p>
              </div>
            )}

            {/* Manual Origin override form */}
            <form onSubmit={handleManualOrigin} className="p-3 border border-brand-border rounded-xl bg-brand-bg/20 space-y-2 shadow-sm">
              <span className="text-[10px] font-bold text-brand-accent block uppercase">Manual Origin Override</span>
              <div className="flex gap-2">
                <input 
                  type="number" step="any" placeholder="Lat (-90 to 90)" required
                  value={manLatO} onChange={e => setManLatO(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-brand-border rounded-lg bg-brand-bg text-brand-text font-mono focus:border-brand-accent focus:outline-hidden placeholder:text-brand-text-dim/40"
                />
                <input 
                  type="number" step="any" placeholder="Lng (-180 to 180)" required
                  value={manLngO} onChange={e => setManLngO(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs border border-brand-border rounded-lg bg-brand-bg text-brand-text font-mono focus:border-brand-accent focus:outline-hidden placeholder:text-brand-text-dim/40"
                />
                <button type="submit" className="px-3 py-1.5 bg-brand-accent hover:bg-sky-400 text-brand-bg text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-sm">
                  Pin Point
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==================== TAB 3: BORDER BUFFER COVERS ==================== */}
        {analysisMode === 'influence' && (
          <div className="space-y-4 animate-fadeIn">
            <div className="p-3 bg-brand-bg/60 border border-brand-border rounded-xl space-y-1">
              <span className="text-[10px] font-bold text-brand-accent tracking-wider uppercase flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" />
                How it works
              </span>
              <p className="text-brand-text-dim text-xs leading-relaxed">
                Choose a country by typing or clicking its borders directly on the map. Adjust the **Influence Buffer Radius**. The system generates a geodesic border-profile halo, indicating which foreign countries contain lands that lie inside this geopolitical coverage profile!
              </p>
            </div>

            {/* Country autocomplete search input selection */}
            <div className="p-3 border border-brand-border rounded-xl bg-brand-bg/30 space-y-3 shadow-xs">
              <div>
                <span className="text-[10px] font-bold text-brand-text-dim uppercase tracking-widest block mb-1.5 font-mono">
                  1. Select Target Country
                </span>
                
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-brand-text-dim" />
                  <input
                    type="text"
                    placeholder="Search countries by name..."
                    value={countrySearch}
                    onChange={(e) => setCountrySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-brand-border rounded-lg bg-brand-bg text-brand-text focus:outline-hidden focus:border-brand-accent placeholder:text-brand-text-dim/40 font-medium"
                    id="country-search-input"
                  />
                </div>
              </div>

              {/* Dynamic suggestion candidates lists */}
              {filteredCountriesList.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[9px] text-brand-text-dim font-bold uppercase tracking-wider font-mono font-medium">SUGGESTIONS</p>
                  <div className="flex flex-wrap gap-1.5 font-medium">
                    {filteredCountriesList.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          onSelectInfluenceCountry(c);
                          setCountrySearch('');
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                          activeInfluenceCountry?.id === c.id
                            ? 'bg-brand-accent border-brand-accent text-brand-bg font-bold'
                            : 'bg-brand-panel hover:bg-slate-700 border-brand-border text-brand-text font-medium'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Active Selected country and geodesic buffer distance selector */}
            {activeInfluenceCountry ? (
              <div className="p-3 border border-brand-border rounded-xl bg-brand-bg/60 space-y-3 shadow-md">
                <div className="flex justify-between items-center pb-2 border-b border-brand-border">
                  <div>
                    <p className="text-[9px] font-bold text-brand-accent uppercase">ACTIVE SUBJECT</p>
                    <p className="text-sm font-bold text-brand-text">{activeInfluenceCountry.name}</p>
                  </div>
                  <button 
                    onClick={() => onSelectInfluenceCountry(null)}
                    className="text-xs font-semibold text-red-400 hover:text-red-300 cursor-pointer"
                  >
                    Deselect
                  </button>
                </div>

                {/* Radius Slider bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-brand-text">
                    <span>Geopolitical Buffer Radius:</span>
                    <span className="font-bold text-brand-accent font-mono">
                      {formatDistance(bufferRadiusKm, 'km')} / {formatDistance(bufferRadiusKm, 'mi')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="4500"
                    step="50"
                    value={bufferRadiusKm}
                    onChange={(e) => onUpdateBufferDistance(parseInt(e.target.value))}
                    className="w-full accent-brand-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-brand-text-dim/50 font-mono">
                    <span>50 km</span>
                    <span>1,500 km</span>
                    <span>3,000 km</span>
                    <span>4,500 km</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center border-2 border-dashed border-brand-border rounded-xl font-medium">
                <p className="text-brand-text-dim text-xs italic">No target country selected yet. Click any territory on the map or search above to load influence profiles.</p>
              </div>
            )}

            {/* Overlap Results indicators lists */}
            {activeInfluenceCountry && (
              <div className="space-y-3">
                <div className="flex justify-between items-center font-medium">
                  <h3 className="text-xs font-bold text-brand-text-dim uppercase tracking-widest font-mono">
                    Geopolitical Contacts ({influenceResults.filter(r => r.isCovered).length})
                  </h3>
                </div>

                {influenceResults.length > 0 ? (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {/* Intersecting Physical neighbors */}
                    {influenceResults.map((result) => {
                      const isIntersect = result.minDistanceKm === 0;

                      return (
                        <div 
                          key={result.countryId}
                          className={`p-3 border rounded-xl flex items-center justify-between transition-all shadow-xs ${
                            isIntersect 
                              ? 'bg-red-950/20 border-red-500/50' 
                              : result.isCovered 
                                ? 'bg-amber-950/15 border-amber-500/40'
                                : 'bg-brand-bg/10 border-brand-border opacity-50'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-brand-text">{result.name}</span>
                              {isIntersect ? (
                                <span className="text-[8px] bg-red-950 text-red-400 border border-red-500/30 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                  Direct Border
                                </span>
                              ) : result.isCovered ? (
                                <span className="text-[8px] bg-amber-950 text-amber-400 border border-amber-500/20 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                  Enveloped
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[9px] text-brand-text-dim font-mono">
                              Min boundary gap: <span className="font-semibold text-brand-accent">{formatDistance(result.minDistanceKm, distanceUnit)}</span>
                            </p>
                          </div>

                          <div className="text-right">
                            {result.minDistanceKm > 0 && result.isCovered && (
                              <button
                                onClick={() => onManualPointsSet(result.closestSourcePoint, result.closestTargetPoint)}
                                className="text-[9px] font-bold text-brand-accent hover:underline flex items-center gap-0.5 justify-end cursor-pointer"
                                title="Route the exact shortest border-to-border geodesic line"
                              >
                                Route Gap <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-brand-text-dim text-center py-4">No neighbors detected in range. Expand the slider to search wider.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Persistent Research Statistics footer */}
      <div className="p-3 bg-slate-950 text-[10px] text-brand-text-dim/60 border-t border-brand-border flex justify-between select-none font-mono">
        <span>Frictionless Ellipsoidal Geodesics</span>
        <span>UTC Clock: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
