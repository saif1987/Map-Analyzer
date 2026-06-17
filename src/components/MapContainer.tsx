/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { 
  ProjectMode, 
  AnalysisMode, 
  RegionData, 
  NearestCountryResult, 
  BorderInfluenceResult 
} from '../types';
import { 
  geodesicDistanceRad, 
  radToKm, 
  extractGeometryCoordinates, 
  downsampleCoordinates 
} from '../utils/geodesic';
import { Compass, Globe, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';

interface MapContainerProps {
  countries: RegionData[];
  landFeature: any;
  analysisMode: AnalysisMode;
  projectMode: ProjectMode;
  pointA: [number, number] | null;
  pointB: [number, number] | null;
  originPoint: [number, number] | null;
  nearestResults: NearestCountryResult[];
  influenceResults: BorderInfluenceResult[];
  activeInfluenceCountry: RegionData | null;
  bufferRadiusKm: number;
  onMapClick: (coordinates: [number, number]) => void;
  onHoverCountry: (countryName: string | null) => void;
}

export default function MapContainer({
  countries,
  landFeature,
  analysisMode,
  projectMode,
  pointA,
  pointB,
  originPoint,
  nearestResults,
  influenceResults,
  activeInfluenceCountry,
  bufferRadiusKm,
  onMapClick,
  onHoverCountry,
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Layout state
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState<number>(1);
  const [translate, setTranslate] = useState<[number, number]>([0, 0]);
  const [rotation, setRotation] = useState<[number, number]>([-10, -20]); // [longitude, latitude] of globe rotation

  // Active hover country name inside Map
  const [localHoverName, setLocalHoverName] = useState<string | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<[number, number] | null>(null);

  // Resize handler
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      const width = containerRef.current?.clientWidth || 800;
      const height = containerRef.current?.clientHeight || 600;
      setDimensions({ width, height: Math.max(450, height) });
    };

    updateDimensions();
    const observer = new ResizeObserver(() => updateDimensions());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Determine standard projection configurations
  const projection = useMemo(() => {
    let proj;
    const { width, height } = dimensions;

    switch (projectMode) {
      case 'globe':
        proj = d3.geoOrthographic()
          .scale(Math.min(width, height) * 0.4 * scale)
          .translate([width / 2 + translate[0], height / 2 + translate[1]])
          .rotate([rotation[0], rotation[1], 0]);
        break;
      case 'mercator':
        proj = d3.geoMercator()
          .scale(Math.min(width, height) * 0.16 * scale)
          .translate([width / 2 + translate[0], height / 2 + translate[1]]);
        break;
      case 'equal-earth':
        proj = d3.geoEqualEarth()
          .scale(Math.min(width, height) * 0.175 * scale)
          .translate([width / 2 + translate[0], height / 2 + translate[1]]);
        break;
      case 'natural-earth':
      default:
        proj = d3.geoNaturalEarth1()
          .scale(Math.min(width, height) * 0.17 * scale)
          .translate([width / 2 + translate[0], height / 2 + translate[1]]);
        break;
    }
    
    // Configure standard clipping to prevent back-of-the-globe rendering issues
    return proj.precision(0.1);
  }, [projectMode, dimensions, scale, translate, rotation]);

  const pathGenerator = useMemo(() => {
    return d3.geoPath().projection(projection);
  }, [projection]);

  // Combined Zoom and Drag configuration using pure D3 event systems
  useEffect(() => {
    if (!svgRef.current) return;
    const svgElement = d3.select(svgRef.current);

    // Dynamic zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 12])
      .on('zoom', (event) => {
        // Only trigger flat pan when not dragging orthographic globe
        if (projectMode !== 'globe') {
          setScale(event.transform.k);
          setTranslate([event.transform.x, event.transform.y]);
        } else {
          // In Globe mode, scroll wheel zooms in place
          setScale(event.transform.k);
        }
      });

    svgElement.call(zoomBehavior);

    // Initial load zoom positioning reset based on map boundaries
    if (projectMode !== 'globe') {
      zoomBehavior.transform(svgElement, d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale));
    }

    // Globe rotation drag actions
    if (projectMode === 'globe') {
      const dragBehavior = d3.drag<SVGSVGElement, unknown>()
        .on('drag', (event) => {
          setRotation((prev) => {
            const currentScale = Math.min(dimensions.width, dimensions.height) * 0.4 * scale;
            const sensitivity = 70 / currentScale; // adjust based on zoom
            const nextLon = prev[0] + event.dx * sensitivity;
            const nextLat = Math.max(-85, Math.min(85, prev[1] - event.dy * sensitivity));
            return [nextLon, nextLat];
          });
        });

      svgElement.call(dragBehavior);
    }

    return () => {
      svgElement.on('.zoom', null);
      svgElement.on('.drag', null);
    };
  }, [projectMode, dimensions, scale]);

  // Click handler returning sphere inversion coordinates
  const handleSvgClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Convert screen coordinates into geographical coordinates [lng, lat]
    const geographicCoords = projection.invert([mouseX, mouseY]);
    if (geographicCoords && !isNaN(geographicCoords[0]) && !isNaN(geographicCoords[1])) {
      onMapClick(geographicCoords as [number, number]);
    }
  };

  // Safe path rendering that filters out non-visible paths (e.g. back of the globe)
  const renderSafePath = (geoJson: any) => {
    try {
      if (projectMode === 'globe') {
        // Orthographic backface exclusion check
        const centroid = d3.geoCentroid(geoJson);
        if (centroid && !isNaN(centroid[0])) {
          // If the angle between globe camera rotation and the polygon's centroid is > 90 deg, it is on the backside
          const distanceRad = geodesicDistanceRad(
            [-rotation[0], -rotation[1]], // camera center coords
            centroid as [number, number]
          );
          if (distanceRad > Math.PI / 1.7) {
            return null; // Don't draw back of globe elements to keep map highly legible
          }
        }
      }
      return pathGenerator(geoJson) || undefined;
    } catch {
      return undefined;
    }
  };

  // Dynamic D3 Graticule lines
  const graticulePath = useMemo(() => {
    try {
      return pathGenerator(d3.geoGraticule()()) || undefined;
    } catch {
      return undefined;
    }
  }, [pathGenerator]);

  // Globe outer circle shadow
  const globeBoundaryPath = useMemo(() => {
    if (projectMode !== 'globe') return null;
    try {
      return pathGenerator({ type: 'Sphere' }) || undefined;
    } catch {
      return undefined;
    }
  }, [pathGenerator, projectMode]);

  // Extracted target country vertices downsampled for beautiful buffer rendering
  const bufferCircles = useMemo(() => {
    if (analysisMode !== 'influence' || !activeInfluenceCountry || bufferRadiusKm <= 0) return [];
    
    // 1. Extract boundary coords
    const rawCoords = extractGeometryCoordinates(activeInfluenceCountry.geometry);
    // 2. Downsample for ultra-smooth rendering performance
    const sampledCoords = downsampleCoordinates(rawCoords, 180);
    
    // 3. Convert Kms buffer to degrees on Earth
    // Radius of Earth is 6371km. Radius in degrees = (kms / 6371) * (180 / PI)
    const radiusDegrees = (bufferRadiusKm / 6371.0088) * (180 / Math.PI);

    // 4. Map to D3 geoCircle path vectors
    return sampledCoords.map((coord, idx) => {
      try {
        const circleFeature = d3.geoCircle().center(coord).radius(radiusDegrees)();
        const d = pathGenerator(circleFeature);
        return d ? <path key={`circle-${idx}`} d={d} fill="rgba(239, 68, 68, 0.04)" stroke="none" /> : null;
      } catch {
        return null;
      }
    });
  }, [analysisMode, activeInfluenceCountry, bufferRadiusKm, pathGenerator]);

  // Influence result map highlighting mapping
  const influenceHighLightMap = useMemo(() => {
    const map = new Map<string, BorderInfluenceResult>();
    if (analysisMode === 'influence') {
      influenceResults.forEach(r => {
        map.set(r.countryId, r);
      });
    }
    return map;
  }, [influenceResults, analysisMode]);

  // Setup handy view controls
  const handleReset = () => {
    setScale(1);
    setTranslate([0, 0]);
    setRotation([-10, -20]);
  };

  const adjustScale = (amount: number) => {
    setScale(prev => Math.max(0.5, Math.min(12, prev + amount)));
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-brand-bg border-r border-brand-border" ref={containerRef}>
      
      {/* Top Map Action Tools Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 pointer-events-auto">
        <button 
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-panel border border-brand-border rounded-lg shadow-md hover:bg-slate-700 text-xs font-semibold text-brand-text transition-colors cursor-pointer"
          title="Reset Map Rotation, Zoom and Panning offsets"
          id="btn-projection-reset"
        >
          <RotateCcw className="w-3.5 h-3.5 text-brand-accent animate-pulse" />
          Reset View
        </button>
        <button 
          onClick={() => adjustScale(0.15)}
          className="p-1.5 bg-brand-panel border border-brand-border rounded-lg shadow-md hover:bg-slate-700 text-brand-text transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4 text-brand-accent" />
        </button>
        <button 
          onClick={() => adjustScale(-0.15)}
          className="p-1.5 bg-brand-panel border border-brand-border rounded-lg shadow-md hover:bg-slate-700 text-brand-text transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4 text-brand-accent" />
        </button>
      </div>

      {/* Projection Indicator Emblem */}
      <div className="absolute top-4 right-4 z-10 hidden sm:flex items-center gap-2 px-3 py-1.5 bg-brand-panel/95 text-brand-text border border-brand-border rounded-lg shadow-md text-xs backdrop-blur-md">
        <Globe className="w-3.5 h-3.5 text-brand-accent animate-[spin_10s_linear_infinite]" />
        <span className="font-semibold tracking-wide font-display">
          {projectMode === 'globe' ? 'Geodesic Sphere Projection (3D)' : 
           projectMode === 'mercator' ? 'Mercator Flat Projection (2D)' :
           projectMode === 'equal-earth' ? 'Equal Earth Projection (Area-Equal)' :
           'Natural Earth Compromise'}
        </span>
      </div>

      {/* Primary SVG Rendering Canvas */}
      <div className="flex-1 w-full bg-slate-950 overflow-hidden relative cursor-crosshair">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          onClick={handleSvgClick}
          className="w-full h-full select-none outline-hidden"
          id="map-canvas-svg"
        >
          {/* 1. Backdrop sphere for 3D globe visualization */}
          {projectMode === 'globe' && globeBoundaryPath && (
            <>
              {/* Outer Space Backdrop */}
              <rect width={dimensions.width} height={dimensions.height} fill="#090d16" />
              {/* Deep Ocean base */}
              <path
                d={globeBoundaryPath}
                className="fill-[#131924] stroke-brand-border stroke-[1.5]"
                filter="drop-shadow(0 0 35px rgba(56, 189, 248, 0.15))"
              />
            </>
          )}

          {/* Flat Map Oceans Base */}
          {projectMode !== 'globe' && (
            <rect width={dimensions.width} height={dimensions.height} fill="#0d111a" />
          )}

          {/* 2. Meridians & Lat/Long Graticule Grid lines */}
          {graticulePath && (
            <path
              d={graticulePath}
              fill="none"
              stroke="rgba(56, 189, 248, 0.08)"
              strokeWidth="0.5"
            />
          )}

          {/* 3. Global Landmass Background Fill */}
          {landFeature && (
            <path
              d={renderSafePath(landFeature) || undefined}
              className="fill-slate-900/30 stroke-none"
            />
          )}

          {/* 4. Individual Interlocking Countries Layer */}
          <g id="g-countries">
            {countries.map((country, idx) => {
              const safeD = renderSafePath(country.geometry);
              if (!safeD) return null;

              // Compute custom themes based on analysis results
              let fillClass = 'fill-slate-800/80 hover:fill-slate-700/90';
              let strokeClass = 'stroke-brand-border';
              let strokeWidth = '0.5';

              // Case A: Geopolitical Influence Buffer colors
              if (analysisMode === 'influence') {
                if (activeInfluenceCountry && activeInfluenceCountry.id === country.id) {
                  // Active center country
                  fillClass = 'fill-brand-accent/25 hover:fill-brand-accent/35';
                  strokeClass = 'stroke-brand-accent';
                  strokeWidth = '1.5';
                } else {
                  const influenceInf = influenceHighLightMap.get(country.id);
                  if (influenceInf) {
                    if (influenceInf.minDistanceKm === 0) {
                      // Direct physical intersection or inside
                      fillClass = 'fill-red-950/70 hover:fill-red-900/80';
                      strokeClass = 'stroke-red-500';
                      strokeWidth = '1';
                    } else if (influenceInf.isCovered) {
                      // Covered inside the expanded border distance
                      fillClass = 'fill-amber-950/50 hover:fill-amber-900/60';
                      strokeClass = 'stroke-amber-500';
                      strokeWidth = '0.75';
                    }
                  }
                }
              }

              // Case B: Simple Country Selection or hover outline highlights
              const isHovered = localHoverName === country.name;
              if (isHovered) {
                strokeClass = 'stroke-brand-accent';
                strokeWidth = '1.2';
              }

              return (
                <path
                  key={`country-path-${country.id}-${idx}`}
                  d={safeD}
                  className={`${fillClass} ${strokeClass} transition-all duration-150 cursor-pointer`}
                  strokeWidth={strokeWidth}
                  onMouseEnter={(e) => {
                    setLocalHoverName(country.name);
                    onHoverCountry(country.name);
                    const centroid = d3.geoCentroid(country.geometry);
                    if (centroid && !isNaN(centroid[0])) {
                      setHoveredCoords(centroid as [number, number]);
                    }
                  }}
                  onMouseLeave={() => {
                    setLocalHoverName(null);
                    onHoverCountry(null);
                    setHoveredCoords(null);
                  }}
                />
              );
            })}
          </g>

          {/* 5. Custom Geopolitical Boundary Circles Halo Group */}
          {analysisMode === 'influence' && activeInfluenceCountry && (
            <g id="g-influence-halo">
              {bufferCircles}
            </g>
          )}

          {/* 6. GeoJSON Overlay lines & Markers (Distance metrics, Radiating nearest path) */}
          <g id="g-analysis-overlays" className="pointer-events-none">
            
            {/* SPECIAL FEATURE 1: Geodesic Line from Point A to Point B */}
            {analysisMode === 'distance' && pointA && pointB && (() => {
              try {
                const lineString = {
                  type: 'LineString',
                  coordinates: [pointA, pointB],
                };
                
                // Ensure visibility (front globe face clipping check)
                const pathD = renderSafePath(lineString);
                if (!pathD) return null;

                // Dynamic animated dash offset for high-tech flow
                return (
                  <>
                    {/* Geodesic Background shadow halo */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.15)"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                    {/* Primary Geodesic glowing arc */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeDasharray="4,4"
                      className="animate-[dash-flow_30s_linear_infinite]"
                      style={{
                        strokeDasharray: '6',
                      }}
                    />
                  </>
                );
              } catch {
                return null;
              }
            })()}

            {/* SPECIAL FEATURE 2: Radiating Geodesic Lines to Nearest Countries */}
            {analysisMode === 'nearest' && originPoint && nearestResults.map((result, idx) => {
              try {
                const lineString = {
                  type: 'LineString',
                  coordinates: [result.originPoint, result.closestLandPoint],
                };

                const pathD = renderSafePath(lineString);
                if (!pathD) return null;

                // Color gradient based on distance rankings - neon cyan spectrum
                const colors = ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#1e3a8a'];
                const strokeColor = colors[Math.min(idx, colors.length - 1)];

                const targetLabelProj = projection(result.closestLandPoint);

                return (
                  <g key={`nearest-link-${result.countryId}-${idx}`}>
                    {/* Connector Geodesic arrow line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={2}
                      strokeOpacity={0.85}
                      strokeLinecap="round"
                    />
                    
                    {/* Destination land anchor dot */}
                    {targetLabelProj && (
                      <circle
                        cx={targetLabelProj[0]}
                        cy={targetLabelProj[1]}
                        r={3.5}
                        fill="#ffffff"
                        stroke={strokeColor}
                        strokeWidth={1.5}
                      />
                    )}
                  </g>
                );
              } catch {
                return null;
              }
            })}

            {/* SPECIAL FEATURE 3: Closest Border Connectors under Geopolitical Influence */}
            {analysisMode === 'influence' && activeInfluenceCountry && influenceResults.length > 0 && 
              influenceResults.filter(r => r.minDistanceKm > 0 && r.isCovered).map((result, idx) => {
                try {
                  const lineString = {
                    type: 'LineString',
                    coordinates: [result.closestSourcePoint, result.closestTargetPoint],
                  };

                  const pathD = renderSafePath(lineString);
                  if (!pathD) return null;

                  return (
                    <g key={`overlap-line-${result.countryId}-${idx}`}>
                      {/* Short distance indicator link */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="2,2"
                        strokeOpacity="0.85"
                      />
                      {/* Source border node */}
                      {(() => {
                        const projPt = projection(result.closestSourcePoint);
                        return projPt ? <circle cx={projPt[0]} cy={projPt[1]} r={2.5} fill="#38bdf8" /> : null;
                      })()}
                      {/* Target border node */}
                      {(() => {
                        const projPt = projection(result.closestTargetPoint);
                        return projPt ? <circle cx={projPt[0]} cy={projPt[1]} r={2.5} fill="#f43f5e" /> : null;
                      })()}
                    </g>
                  );
                } catch {
                  return null;
                }
              })
            }
          </g>

          {/* 7. Foreground Markers (Selected Nodes and pulsing rings) */}
          <g id="g-foreground-markers" className="pointer-events-none">
            {/* Point A Marker */}
            {analysisMode === 'distance' && pointA && (() => {
              const ptProj = projection(pointA);
              if (!ptProj) return null;
              return (
                <g transform={`translate(${ptProj[0]},${ptProj[1]})`}>
                  <circle r="12" fill="rgba(56, 189, 248, 0.25)" className="animate-ping" style={{ animationDuration: '3s' }} />
                  <circle r="7" fill="rgba(56, 189, 248, 0.4)" />
                  <circle r="4.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
                  <text y="-11" textAnchor="middle" className="text-[10px] font-bold fill-brand-accent text-shadow-sm font-sans">
                    A
                  </text>
                </g>
              );
            })()}

            {/* Point B Marker */}
            {analysisMode === 'distance' && pointB && (() => {
              const ptProj = projection(pointB);
              if (!ptProj) return null;
              return (
                <g transform={`translate(${ptProj[0]},${ptProj[1]})`}>
                  <circle r="12" fill="rgba(56, 189, 248, 0.25)" className="animate-ping" style={{ animationDuration: '3s', animationDelay: '1s' }} />
                  <circle r="7" fill="rgba(56, 189, 248, 0.4)" />
                  <circle r="4.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
                  <text y="-11" textAnchor="middle" className="text-[10px] font-bold fill-brand-accent text-shadow-sm font-sans">
                    B
                  </text>
                </g>
              );
            })()}

            {/* Nearest Point click origin node */}
            {analysisMode === 'nearest' && originPoint && (() => {
              const ptProj = projection(originPoint);
              if (!ptProj) return null;
              return (
                <g transform={`translate(${ptProj[0]},${ptProj[1]})`}>
                  <circle r="14" fill="rgba(56, 189, 248, 0.25)" className="animate-pulse" />
                  <circle r="5" fill="#38bdf8" stroke="#ffffff" strokeWidth="1.5" />
                </g>
              );
            })()}
          </g>
        </svg>

        {/* Dynamic Canvas Compass Rose decoration */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 px-2 py-1 bg-brand-panel/90 text-[10px] text-brand-text-dim border border-brand-border rounded shadow-md backdrop-blur-md select-none font-mono">
          <Compass className="w-3 h-3 text-brand-accent rotate-12" />
          <span>WGS 84 Geoid</span>
        </div>

        {/* Dynamic live map cursor coordinate decoder */}
        {localHoverName && hoveredCoords && (
          <div className="absolute bottom-4 right-4 z-10 select-none bg-brand-panel/95 px-3 py-1.5 border border-brand-border rounded-lg shadow-md text-[10px] font-mono text-brand-text-dim flex items-center gap-2 backdrop-blur-md">
            <span className="font-bold text-brand-text">{localHoverName}</span>
            <span className="text-brand-border">|</span>
            <span className="text-brand-accent">Lat: {hoveredCoords[1].toFixed(4)}°N</span>
            <span className="text-brand-accent">Lng: {hoveredCoords[0].toFixed(4)}°E</span>
          </div>
        )}

        {/* Dynamic prompt guide overlay */}
        <div className="absolute top-16 left-4 z-10 p-2.5 max-w-xs bg-brand-panel/95 text-brand-text text-[11px] border border-brand-border rounded-lg shadow-lg backdrop-blur-md flex items-center gap-2">
          <Move className="w-3.5 h-3.5 text-brand-accent animate-bounce" />
          <div>
            <p className="font-semibold text-brand-text font-display">
              {projectMode === 'globe' ? 'Drag with mouse to rotate globe' : 'Drag or scroll with wheel to pan and zoom'}
            </p>
            <p className="text-brand-text-dim text-[10px] mt-0.5">
              {analysisMode === 'distance' ? 'Click on map to select Point A and Point B' :
               analysisMode === 'nearest' ? 'Click anywhere on map to find nearest countries' :
               analysisMode === 'influence' ? 'Click on a country to expand its borders' :
               'Select an analysis tool in the panel to begin.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
