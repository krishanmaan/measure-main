'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { GoogleMap, LoadScript, Marker, Circle, Polygon } from '@react-google-maps/api';
import Navbar from './Navbar';
import MapControls from './MapControls';
import CreateMenu from './CreateMenu';
import ZoomControls from './ZoomControls';
import SearchBox from './SearchBox';
import { libraries, mapStyles, defaultCenter } from './constants';
import usePolygonDrawing from './hooks/usePolygonDrawing';
import useUserLocation from './hooks/useUserLocation';
import useMapControls from './hooks/useMapControls';
import useCreateMenu from './hooks/useCreateMenu';

// Local utility function for className merging
function cn(...classNames: (string | undefined)[]) {
  return classNames.filter(Boolean).join(' ');
}

interface MapComponentProps {
  onAreaUpdate?: (newArea: number) => void;
  className?: string;
}

const MapComponent: React.FC<MapComponentProps> = ({ onAreaUpdate, className }) => {
  const [isClient, setIsClient] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
  
  // Use our custom hooks only after Google Maps is loaded
  const mapControls = useMapControls(isGoogleMapsLoaded ? map : null);
  const userLocation = useUserLocation(isGoogleMapsLoaded ? map : null);
  const polygonDrawing = usePolygonDrawing(isGoogleMapsLoaded ? map : null);
  
  // Destructure the hooks to maintain the same interface
  const { 
    mapType, 
    handleToggleMapType, 
    isFullscreen, 
    handleToggleFullscreen,
    handleZoomIn,
    handleZoomOut
  } = mapControls;
  
  const {
    userLocation: currentUserLocation,
    isLocating,
    handleLocationClick
  } = userLocation;
  
  const {
    isDrawingMode,
    setIsDrawingMode,
    fieldPolygons,
    activeVertexMarkerRef,
    onPolygonComplete
  } = polygonDrawing;
  
  // Create menu hook depends on the polygon drawing hook
  const createMenu = useCreateMenu(
    setIsDrawingMode, 
    isGoogleMapsLoaded ? fieldPolygons : [], 
    onPolygonComplete, 
    activeVertexMarkerRef, 
    isGoogleMapsLoaded ? map : null
  );
  
  const {
    showCreateMenu,
    setShowCreateMenu,
    handleCreateOption
  } = createMenu;

  // Map event handlers
  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
    setIsGoogleMapsLoaded(true);
    console.log("Google Maps API loaded successfully");
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
    setIsGoogleMapsLoaded(false);
  }, []);

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

  // Call onAreaUpdate whenever the area changes
  useEffect(() => {
    if (onAreaUpdate && fieldPolygons.length > 0 && isGoogleMapsLoaded) {
      // Calculate total area of all polygons
      const totalArea = fieldPolygons.reduce((sum, polygon) => {
        const area = google.maps.geometry.spherical.computeArea(polygon.getPath());
        return sum + (area / 10000); // Convert square meters to hectares
      }, 0);
      
      onAreaUpdate(totalArea);
    }
  }, [fieldPolygons, onAreaUpdate, isGoogleMapsLoaded]);

  // Client-side effect
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return <div className={cn("h-full w-full", className)} />;
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
            {currentUserLocation && (
              <>
                <Marker
                  position={currentUserLocation}
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
                  center={currentUserLocation}
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
            {isGoogleMapsLoaded && fieldPolygons.map((polygon, index) => (
              <Polygon
                key={index}
                paths={polygon.getPath().getArray()}
                options={{
                  fillColor: '#00C853',
                  fillOpacity: 0.3,
                  strokeColor: '#00C853',
                  strokeWeight: 2,
                  clickable: true,
                  editable: false,
                  draggable: false,
                  zIndex: 1,
                }}
                onClick={(e) => {
                  // Only if we're in drawing mode, prevent default and let the click pass through to the map
                  if (isDrawingMode) {
                    e.stop();
                    
                    // Manually forward the click to the map to add a vertex
                    if (e.latLng && map) {
                      google.maps.event.trigger(map, 'click', { 
                        latLng: e.latLng,
                        stop: () => {} // Dummy function to match event interface
                      });
                    }
                  }
                }}
              />
            ))}
          </GoogleMap>
        </div>

        <MapControls
          currentMapType={mapType}
          onMapTypeChange={handleToggleMapType}
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

// Add TypeScript declarations for the window object to avoid errors
declare global {
  interface Window {
    tempPolylineRef: google.maps.Polyline | null;
    tempVerticesRef: google.maps.LatLng[] | null;
    tempMarkersRef: google.maps.Marker[] | null;
    tempEdgeMarkersRef: (google.maps.Marker | google.maps.OverlayView)[] | null;
  }
}

// Initialize global variables
if (typeof window !== 'undefined') {
  window.tempPolylineRef = null;
  window.tempVerticesRef = null;
  window.tempMarkersRef = null;
  window.tempEdgeMarkersRef = null;
}

export default MapComponent;