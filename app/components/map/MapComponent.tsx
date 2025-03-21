'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, LoadScript, Marker, Circle, DrawingManager, Polygon } from '@react-google-maps/api';
import Navbar from './Navbar';
import MapControls from './MapControls';
import CreateMenu from './CreateMenu';
import ZoomControls from './ZoomControls';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLocationDot } from '@fortawesome/free-solid-svg-icons';
import SearchBox from './SearchBox';

type MapType = 'hybrid' | 'satellite' | 'roadmap' | 'terrain';

const libraries: ("places" | "drawing" | "geometry")[] = ["places", "drawing", "geometry"];

const polygonColor = '#00C853'; // Bright green color
const polygonFillOpacity = 0.3;
const strokeColor = '#00C853';
const strokeWeight = 2;

const LOCATION_MARKER_PATH = "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z";

const mapStyles = {
  container: {
    width: '100%',
    height: 'calc(100vh - 48px)',
    position: 'relative' as const
  },
  map: {
    width: '100%',
    height: '100%'
  }
};

const defaultCenter = {
  lat: 27.342860470286933, 
  lng: 75.79046143662488,
};

const MARKER_ROTATION = 180; // Rotation in degrees

interface MapComponentProps {
  onAreaUpdate?: (newArea: number) => void;
}

const MapComponent: React.FC<MapComponentProps> = ({ onAreaUpdate }) => {
  const [isClient, setIsClient] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [mapType, setMapType] = useState<MapType>('hybrid');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [userLocation, setUserLocation] = useState<google.maps.LatLng | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  
  // Add new state variables for drawing
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [fieldPolygons, setFieldPolygons] = useState<google.maps.Polygon[]>([]);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  
  // Add a ref to track the currently active drag marker
  const activeVertexMarkerRef = useRef<google.maps.Marker | null>(null);

  // Create a ref to store the DistanceOverlay class
  const DistanceOverlayRef = useRef<any>(null);

  // Add a counter for field creation triggers instead of using drawing mode directly
  const [fieldCreationTrigger, setFieldCreationTrigger] = useState(0);
  
  // New refs for drawing state
  const tempPolylineRef = useRef<google.maps.Polyline | null>(null);
  const verticesRef = useRef<google.maps.LatLng[]>([]);
  const vertexMarkersRef = useRef<google.maps.Marker[]>([]);
  const edgeMarkersRef = useRef<(google.maps.Marker | google.maps.OverlayView)[]>([]);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const mapDblClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  // Map event handlers
  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);

    // Create the DistanceOverlay class after Google Maps is loaded
    class DistanceOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private content: string;
      private div: HTMLDivElement | null;
      private angle: number;
      private onDistanceChange: (newDistance: number) => void;

      constructor(
        position: google.maps.LatLng, 
        content: string, 
        angle: number,
        onDistanceChange: (newDistance: number) => void
      ) {
        super();
        this.position = position;
        this.content = content;
        this.div = null;
        this.angle = angle;
        this.onDistanceChange = onDistanceChange;
      }

      onAdd() {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        
        // Extract the numeric value from content
        const numericValue = parseFloat(this.content.replace(/[^0-9.]/g, ''));
        const unit = this.content.includes('km') ? 'km' : 'm';
        
        // Add red color for kilometer values
        const textColor = unit === 'km' ? 'red' : 'white';
        
        div.innerHTML = `
          <div style="
            background: rgba(0, 0, 0, 0.7);
            color: ${textColor};
            padding: 6px 10px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            text-align: center;
            min-width: 60px;
            transform: translate(-50%, -150%);
            box-shadow: 0 3px 6px rgba(0,0,0,0.3);
            white-space: nowrap;
            cursor: pointer;
            border: 1px solid rgba(255, 255, 255, 0.3);
          ">
            <input
              type="number"
              value="${numericValue}"
              step="${unit === 'km' ? '0.01' : '1'}"
              min="0"
              style="
                width: 50px;
                background: transparent;
                border: none;
                color: ${textColor};
                font-size: 14px;
                text-align: right;
                outline: none;
                padding: 0;
                font-weight: 600;
              "
            />${unit}
          </div>
        `;

        // Add input event listener
        const input = div.querySelector('input');
        if (input) {
          input.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const newValue = parseFloat(target.value);
            if (!isNaN(newValue)) {
              // Convert to meters if in km
              const meters = unit === 'km' ? newValue * 1000 : newValue;
              this.onDistanceChange(meters);
            }
          });

          // Prevent propagation of click events to avoid map clicks
          input.addEventListener('click', (e) => {
            e.stopPropagation();
          });
        }

        this.div = div;
        const panes = this.getPanes();
        panes?.overlayLayer.appendChild(div);
      }

      draw() {
        if (!this.div) return;
        const overlayProjection = this.getProjection();
        const point = overlayProjection.fromLatLngToDivPixel(this.position);
        if (point) {
          this.div.style.left = point.x + 'px';
          this.div.style.top = point.y + 'px';
        }
      }

      onRemove() {
        if (this.div) {
          this.div.parentNode?.removeChild(this.div);
          this.div = null;
        }
      }
    }

    // Store the class in the ref
    DistanceOverlayRef.current = DistanceOverlay;
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Map controls handlers
  const handleToggleMapType = useCallback(() => {
    setMapType(prev => {
      switch (prev) {
        case 'hybrid': return 'satellite';
        case 'satellite': return 'roadmap';
        case 'roadmap': return 'terrain';
        case 'terrain': return 'hybrid';
        default: return 'hybrid';
      }
    });
  }, []);

  const handleLocationClick = useCallback(() => {
    setIsLocating(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = new google.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          );
          setUserLocation(newLocation);
          if (map) {
            map.panTo(newLocation);
            map.setZoom(18);
          }
          setIsLocating(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          setIsLocating(false);
          alert('Unable to get your location. Please check your location permissions.');
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      alert('Geolocation is not supported by your browser');
      setIsLocating(false);
    }
  }, [map]);

  const handleToggleFullscreen = useCallback(() => {
    const elem = document.documentElement;
    if (!isFullscreen) {
      elem.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const handleZoomIn = useCallback(() => {
    if (map) {
      map.setZoom((map.getZoom() || 15) + 1);
    }
  }, [map]);

  const handleZoomOut = useCallback(() => {
    if (map) {
      map.setZoom((map.getZoom() || 15) - 1);
    }
  }, [map]);

  // Function to clear all drawing resources
  const clearDrawingResources = useCallback(() => {
    if (tempPolylineRef.current) {
      tempPolylineRef.current.setMap(null);
      tempPolylineRef.current = null;
    }
    
    if (vertexMarkersRef.current.length > 0) {
      vertexMarkersRef.current.forEach(marker => marker.setMap(null));
      vertexMarkersRef.current = [];
    }
    
    if (edgeMarkersRef.current.length > 0) {
      edgeMarkersRef.current.forEach(marker => {
        if (marker instanceof google.maps.Marker) {
          marker.setMap(null);
        } else {
          marker.setMap(null);
        }
      });
      edgeMarkersRef.current = [];
    }
    
    if (mapClickListenerRef.current) {
      google.maps.event.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }
    
    if (mapDblClickListenerRef.current) {
      google.maps.event.removeListener(mapDblClickListenerRef.current);
      mapDblClickListenerRef.current = null;
    }

    verticesRef.current = [];
  }, []);

  // Function to update edge markers
  const updateEdgeMarkers = useCallback(() => {
    if (!map || !DistanceOverlayRef.current) return;
    
    // Remove existing edge markers
    edgeMarkersRef.current.forEach(marker => {
      if (marker instanceof google.maps.Marker) {
        marker.setMap(null);
      } else {
        marker.setMap(null);
      }
    });
    edgeMarkersRef.current = [];

    // Add new edge markers if we have at least 2 vertices
    if (verticesRef.current.length >= 2) {
      for (let i = 0; i < verticesRef.current.length; i++) {
        const p1 = verticesRef.current[i];
        const p2 = verticesRef.current[(i + 1) % verticesRef.current.length];

        // Calculate midpoint
        const midLat = (p1.lat() + p2.lat()) / 2;
        const midLng = (p1.lng() + p2.lng()) / 2;
        const midpoint = new google.maps.LatLng(midLat, midLng);

        // Calculate initial distance
        const distance = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
        const distanceText = distance < 1000 
          ? `${Math.round(distance)}m`
          : `${(distance / 1000).toFixed(2)}km`;

        // Calculate angle between points
        let angle = Math.atan2(
          p2.lng() - p1.lng(),
          p2.lat() - p1.lat()
        ) * (180 / Math.PI);

        // We're removing the angle rotation to keep labels straight
        angle = 0; // Always keep text straight

        // Handler for distance changes
        const handleDistanceChange = (newDistance: number) => {
          // Calculate the ratio of new distance to current distance
          const currentDistance = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
          const ratio = newDistance / currentDistance;

          // Calculate new position for p2 by extending the line
          const lat = p1.lat() + (p2.lat() - p1.lat()) * ratio;
          const lng = p1.lng() + (p2.lng() - p1.lng()) * ratio;
          const newPosition = new google.maps.LatLng(lat, lng);

          // Update vertex position
          verticesRef.current[(i + 1) % verticesRef.current.length] = newPosition;
          vertexMarkersRef.current[(i + 1) % verticesRef.current.length].setPosition(newPosition);

          // Update polyline
          if (tempPolylineRef.current) {
            const path = verticesRef.current.slice();
            if (verticesRef.current.length >= 3) {
              path.push(verticesRef.current[0]);
            }
            tempPolylineRef.current.setPath(path);
          }

          // Update all edge markers
          updateEdgeMarkers();
        };

        // Create overlay with distance change handler
        const overlay = new DistanceOverlayRef.current(
          midpoint, 
          distanceText, 
          angle,
          handleDistanceChange
        );
        overlay.setMap(map);
        edgeMarkersRef.current.push(overlay as google.maps.Marker | google.maps.OverlayView);

        // Create marker at midpoint (implement as needed)
        // ... (rest of edge marker creation code)
      }
    }
  }, [map]);

  // Start drawing function
  const startDrawing = useCallback(() => {
    if (!map) return;
    
    console.log('Starting new field drawing');
    
    // Clean up any existing drawing resources first
    clearDrawingResources();
    
    // Create a polyline to track vertices
    tempPolylineRef.current = new google.maps.Polyline({
      map: map,
      path: [],
      strokeColor: strokeColor,
      strokeWeight: strokeWeight
    });
    
    // Add click listener to map
    mapClickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng || !tempPolylineRef.current) return;
      
      verticesRef.current.push(e.latLng);
      
      // Create a marker for this vertex
      const marker = new google.maps.Marker({
        position: e.latLng,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#FFFFFF',
          fillOpacity: 0.5,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
        },
        draggable: true,
        zIndex: 2
      });
      
      // Add drag listeners for the marker
      marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const index = vertexMarkersRef.current.indexOf(marker);
        if (index !== -1) {
          verticesRef.current[index] = e.latLng;
          
          // Update polyline path
          if (tempPolylineRef.current) {
            const path = verticesRef.current.slice();
            if (verticesRef.current.length >= 3) {
              path.push(verticesRef.current[0]); // Close the polygon
            }
            tempPolylineRef.current.setPath(path);
          }
          
          // Update edge markers
          updateEdgeMarkers();
        }
      });
      
      vertexMarkersRef.current.push(marker);
      
      // Update polyline path
      const path = verticesRef.current.slice();
      if (verticesRef.current.length >= 3) {
        path.push(verticesRef.current[0]); // Close the polygon
      }
      tempPolylineRef.current.setPath(path);
      
      // Update edge markers
      updateEdgeMarkers();
    });
    
    // Add double-click listener to complete the polygon
    mapDblClickListenerRef.current = map.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
      if (verticesRef.current.length >= 3) {
        // Create final polygon
        const polygon = new google.maps.Polygon({
          map: map,
          paths: verticesRef.current,
          strokeColor: strokeColor,
          strokeWeight: strokeWeight,
          fillColor: polygonColor,
          fillOpacity: polygonFillOpacity,
          editable: true,
          draggable: true
        });
        
        // Add the new polygon to our state
        setFieldPolygons(prevPolygons => [...prevPolygons, polygon]);
        
        console.log('Field completed via double-click, total fields:', fieldPolygons.length + 1);
        
        // Clean up drawing resources
        clearDrawingResources();
        
        // Disable drawing mode
        setIsDrawingMode(false);
      }
    });
  }, [map, clearDrawingResources, updateEdgeMarkers, fieldPolygons.length]);

  // Create menu handlers
  const handleCreateOption = useCallback((option: 'import' | 'field' | 'distance' | 'marker') => {
    setShowCreateMenu(false);
    
    // If we're already in drawing mode and it's a field option, complete the current field first
    if (isDrawingMode && option === 'field' && verticesRef.current.length >= 3) {
      // Create final polygon with vertices
      const polygon = new google.maps.Polygon({
        map: map,
        paths: verticesRef.current,
        strokeColor: strokeColor,
        strokeWeight: strokeWeight,
        fillColor: polygonColor,
        fillOpacity: polygonFillOpacity,
        editable: true,
        draggable: true
      });
      
      // Add the new polygon to our state but preserve existing ones
      setFieldPolygons(prevPolygons => [...prevPolygons, polygon]);
      
      // Clean up drawing resources
      clearDrawingResources();
    }
    
    // Handle different creation options here
    switch (option) {
      case 'import':
        // Handle import
        break;
      case 'field':
        console.log('Field option selected, starting new field drawing');
        // Always start a new drawing mode
        setIsDrawingMode(true);
        // Force a re-render to ensure everything is displayed properly
        setFieldCreationTrigger(prev => prev + 1);
        break;
      case 'distance':
        // Handle distance measurement
        break;
      case 'marker':
        // Handle marker placement
        break;
    }
  }, [map, isDrawingMode, clearDrawingResources]);

  // Handle place selection from search
  const handlePlaceSelect = useCallback((location: google.maps.LatLng) => {
    if (map) {
      map.panTo(location);
      map.setZoom(18);
    }
  }, [map]);

  // Map options
  const mapOptions = useMemo(() => ({
    mapTypeId: mapType,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: false,
    scaleControl: true,
    rotateControl: false,
    panControl: false,
    scrollwheel: true,
    clickableIcons: false,
    disableDefaultUI: true,
    tilt: 0,
    gestureHandling: 'cooperative',
    draggableCursor: 'grab',
    draggingCursor: 'move',
  }), [mapType]);

  // Effect to start/stop drawing mode
  useEffect(() => {
    if (isDrawingMode) {
      startDrawing();
    } else {
      clearDrawingResources();
    }
    
    return () => {
      clearDrawingResources();
    };
  }, [isDrawingMode, startDrawing, clearDrawingResources, fieldCreationTrigger]);

  // Call onAreaUpdate whenever the area changes
  useEffect(() => {
    if (onAreaUpdate && fieldPolygons.length > 0) {
      // Calculate total area of all polygons
      const totalArea = fieldPolygons.reduce((sum, polygon) => {
        const area = google.maps.geometry.spherical.computeArea(polygon.getPath());
        return sum + (area / 10000); // Convert square meters to hectares
      }, 0);
      
      onAreaUpdate(totalArea);
    }
  }, [fieldPolygons, onAreaUpdate]);

  // Client-side effect
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div>Loading map...</div>
      </div>
    );
  }

  return (
    <LoadScript
      googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
      libraries={libraries}
    >
      <div className="flex flex-col h-screen w-full">
        <Navbar onPlaceSelect={handlePlaceSelect} />
        <div style={mapStyles.container}>
          <GoogleMap
            mapContainerStyle={mapStyles.map}
            center={defaultCenter}
            zoom={15}
            onLoad={onLoad}
            onUnmount={onUnmount}
            options={mapOptions}
          >
            {/* User location marker */}
            {userLocation && (
              <>
                <Marker
                  position={userLocation}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: '#4285F4',
                    fillOpacity: 1,
                    strokeColor: '#FFFFFF',
                    strokeWeight: 2,
                  }}
                  zIndex={1000}
                />
                <Circle
                  center={userLocation}
                  radius={20}
                  options={{
                    fillColor: '#4285F4',
                    fillOpacity: 0.2,
                    strokeColor: '#4285F4',
                    strokeOpacity: 0.5,
                    strokeWeight: 1,
                  }}
                />
              </>
            )}
            
            {/* Display existing field polygons */}
            {fieldPolygons.map((polygon, index) => (
              <Polygon
                key={`field-${index}-${fieldCreationTrigger}`}
                paths={polygon.getPath().getArray()}
                options={{
                  fillColor: polygonColor,
                  fillOpacity: polygonFillOpacity,
                  strokeColor: strokeColor,
                  strokeWeight: strokeWeight,
                  clickable: true,
                  editable: true,
                  draggable: true,
                  zIndex: 1,
                }}
                onClick={(e: google.maps.PolyMouseEvent) => {
                  // Check if the click is on an edge (not on a vertex)
                  if (e.edge !== undefined && e.vertex === undefined && e.latLng) {
                    // Get the path of the polygon
                    const path = polygon.getPath();
                    
                    // Insert a new vertex at the clicked edge
                    path.insertAt(e.edge + 1, e.latLng);
                  }
                }}
              />
            ))}
          </GoogleMap>
        </div>

        <MapControls
          currentMapType={mapType}
          onMapTypeChange={setMapType}
          onLocationClick={handleLocationClick}
          onToggleFullscreen={handleToggleFullscreen}
          isLocating={isLocating}
        />

        <CreateMenu
          showMenu={showCreateMenu}
          onToggleMenu={() => setShowCreateMenu(!showCreateMenu)}
          onOptionSelect={handleCreateOption}
        />

        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      </div>
    </LoadScript>
  );
};

export default MapComponent;