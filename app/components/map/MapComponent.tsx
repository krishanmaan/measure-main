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
  
  // Add state to show the "Create New Field" button after completing a field
  const [showNewFieldButton, setShowNewFieldButton] = useState(false);

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

  // Create menu handlers
  const handleCreateOption = useCallback((option: 'import' | 'field' | 'distance' | 'marker') => {
    setShowCreateMenu(false);
    // Handle different creation options here
    switch (option) {
      case 'import':
        // Handle import
        break;
      case 'field':
        // Enable our custom drawing mode instead of using DrawingManager
        setIsDrawingMode(true);
        break;
      case 'distance':
        // Handle distance measurement
        break;
      case 'marker':
        // Handle marker placement
        break;
    }
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

  // Add drawing manager load handler
  const onDrawingManagerLoad = useCallback((drawingManager: google.maps.drawing.DrawingManager) => {
    drawingManagerRef.current = drawingManager;
  }, []);

  // Add polygon complete handler
  const onPolygonComplete = useCallback((polygon: google.maps.Polygon) => {
    // Add the new polygon to our state
    setFieldPolygons(prev => [...prev, polygon]);
    
    // Disable drawing mode after polygon is complete
    setIsDrawingMode(false);
    
    // Show the create new field button
    setShowNewFieldButton(true);
    
    // Create draggable vertex markers for the completed polygon
    const path = polygon.getPath();
    const vertexMarkers: google.maps.Marker[] = [];
    
    // Function to add/update edge markers for the polygon
    const addEdgeMarkers = () => {
      // Remove existing edge markers
      const oldMarkers = polygon.get('edgeMarkers') || [];
      oldMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
        marker.setMap(null);
      });

      // Create new edge markers
      const newEdgeMarkers: (google.maps.Marker | google.maps.OverlayView)[] = [];
      const path = polygon.getPath();
      
      for (let i = 0; i < path.getLength(); i++) {
        const p1 = path.getAt(i);
        const p2 = path.getAt((i + 1) % path.getLength());
        
        // Add edge marker logic here...
        // (Keep your existing edge marker creation code)
      }
      
      polygon.set('edgeMarkers', newEdgeMarkers);
    };
    
    for (let i = 0; i < path.getLength(); i++) {
      const vertex = path.getAt(i);
      const marker = new google.maps.Marker({
        position: vertex,
        map: map,
        icon: {
          path: LOCATION_MARKER_PATH,
          fillColor: '#FF0000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 1,
          scale: 4.5,
          anchor: new google.maps.Point(12, 23),
        },
        draggable: true,
        zIndex: 2
      });

      // Add drag listeners to update the polygon shape while dragging
      marker.addListener('dragstart', () => {
        // If there's an existing active vertex marker, remove the red styling
        if (activeVertexMarkerRef.current && activeVertexMarkerRef.current !== marker) {
          activeVertexMarkerRef.current.setIcon({
            path: LOCATION_MARKER_PATH,
            fillColor: '#FF0000',
            fillOpacity: 1,
            strokeColor: '#FFFFFF',
            strokeWeight: 1,
            scale: 4.5,
            anchor: new google.maps.Point(12, 23),
          });
        }
        
        // Set this marker as the active one
        activeVertexMarkerRef.current = marker;
        
        // Make the dragged marker more prominent
        marker.setIcon({
          path: LOCATION_MARKER_PATH,
          fillColor: '#FF0000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2,
          scale: 5,
          anchor: new google.maps.Point(12, 23),
        });
      });

      marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        path.setAt(i, e.latLng);
        addEdgeMarkers();
      });

      vertexMarkers.push(marker);
    }

    // Store vertex markers with the polygon for cleanup
    polygon.set('vertexMarkers', vertexMarkers);

    // Add listener to update vertex markers when polygon is modified
    google.maps.event.addListener(polygon.getPath(), 'insert_at', (index: number) => {
      const vertex = path.getAt(index);
      if (!vertex) return;
      
      const marker = new google.maps.Marker({
        position: vertex,
        map: map,
        icon: {
          path: LOCATION_MARKER_PATH,
          fillColor: '#FF0000',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 1,
          scale: 4.5,
          anchor: new google.maps.Point(12, 23),
        },
        draggable: true,
        zIndex: 2
      });

      marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        path.setAt(index, e.latLng);
        addEdgeMarkers();
      });

      const markers = polygon.get('vertexMarkers') || [];
      markers.splice(index, 0, marker);
      polygon.set('vertexMarkers', markers);
    });

    // Add edge markers initially
    addEdgeMarkers();
    
    // Rest of your polygon click listener code...
  }, [map]);

  // Add function to start a new field
  const handleStartNewField = useCallback(() => {
    setShowNewFieldButton(false);
    setIsDrawingMode(true);
  }, []);

  // Add a new function to handle auto-closing polygon
  const setupAutoClosePolygon = useCallback(() => {
    if (!map) return;
    
    // Create a temporary polyline to track vertices
    let tempPolyline: google.maps.Polyline | null = null;
    let vertices: google.maps.LatLng[] = [];
    let vertexMarkers: google.maps.Marker[] = [];
    let edgeMarkers: (google.maps.Marker | google.maps.OverlayView)[] = [];
    let mapClickListener: google.maps.MapsEventListener | null = null;
    let mapDblClickListener: google.maps.MapsEventListener | null = null;

    // Update the color scheme for vertices, edges, and polygons
    const polygonColor = '#00C853'; // Bright green color
    const polygonFillOpacity = 0.3;
    const strokeColor = '#00C853';
    const strokeWeight = 2;

    // Function to update edge markers
    const updateEdgeMarkers = () => {
      // Remove existing edge markers
      edgeMarkers.forEach(marker => {
        if (marker instanceof google.maps.Marker) {
          marker.setMap(null);
        } else {
          marker.setMap(null);
        }
      });
      edgeMarkers = [];

      // Add new edge markers if we have at least 2 vertices
      if (vertices.length >= 2) {
        for (let i = 0; i < vertices.length; i++) {
          const p1 = vertices[i];
          const p2 = vertices[(i + 1) % vertices.length];

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
            vertices[(i + 1) % vertices.length] = newPosition;
            vertexMarkers[(i + 1) % vertices.length].setPosition(newPosition);

            // Update polyline
            if (tempPolyline) {
              const path = vertices.slice();
              if (vertices.length >= 3) {
                path.push(vertices[0]);
              }
              tempPolyline.setPath(path);
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
          edgeMarkers.push(overlay as google.maps.Marker | google.maps.OverlayView);

          // Create marker at midpoint
          const marker = new google.maps.Marker({
            position: midpoint,
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 5,
              fillColor: '#FFFFFF',
              fillOpacity: 0.5,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
            draggable: true,
            zIndex: 2
          });

          let dragMarker: google.maps.Marker | null = null;

          const showRedMarker = (marker: google.maps.Marker) => {
            // If there's an existing active vertex marker, remove its drag marker
            if (activeVertexMarkerRef.current && activeVertexMarkerRef.current !== marker) {
              // Reset the previous active marker if it's not this one
              activeVertexMarkerRef.current.setOpacity(1);
              
              // Find and remove the previous drag marker if it exists
              const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
              if (prevDragMarker) {
                prevDragMarker.setMap(null);
                activeVertexMarkerRef.current.set('dragMarker', null);
              }
            }
            
            const position = marker.getPosition();
            if (!position) return;
            
            // Create the red location marker
            dragMarker = new google.maps.Marker({
              position: position,
              map: map,
              icon: {
                path: LOCATION_MARKER_PATH,
                fillColor: '#FF0000',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 1,
                scale: 4.5,
                anchor: new google.maps.Point(12, 23),
                rotation: MARKER_ROTATION
              },
              draggable: true,
              zIndex: 3
            });
            
            // Store the drag marker reference in the vertex marker
            marker.set('dragMarker', dragMarker);
            
            // Set this as the active vertex marker
            activeVertexMarkerRef.current = marker;
            
            // Hide the original circle marker
            marker.setOpacity(0);
            
            // Store the original position and vertices
            marker.set('originalPosition', position);
            marker.set('originalVertices', [...vertices]);
            
            // For edge markers, we need to store which vertices this edge connects
            const edgeIndex = marker.get('edgeIndex');
            if (typeof edgeIndex === 'number') {
              // This is an edge marker
              dragMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
                if (!e.latLng || !tempPolyline) return;
                
                // Calculate new vertex position
                const p1 = vertices[edgeIndex];
                const p2 = vertices[(edgeIndex + 1) % vertices.length];
                
                // Insert new vertex at the drag position
                if (!marker.get('vertexInserted')) {
                  vertices.splice(edgeIndex + 1, 0, e.latLng);
                  marker.set('vertexInserted', true);
                  marker.set('insertedIndex', edgeIndex + 1);
                } else {
                  const insertedIndex = marker.get('insertedIndex');
                  if (typeof insertedIndex === 'number') {
                    vertices[insertedIndex] = e.latLng;
                  }
                }
                
                // Update the path
                const path = vertices.slice();
                if (vertices.length >= 3) {
                  path.push(vertices[0]);
                }
                tempPolyline.setPath(path);
                updateEdgeMarkers();
              });

              dragMarker.addListener('dragend', () => {
                // Create a new permanent vertex at the final position
                const insertedIndex = marker.get('insertedIndex');
                if (typeof insertedIndex === 'number' && dragMarker) {
                  const position = dragMarker.getPosition();
                  if (position) {
                    // Create a new vertex marker
                    const newVertexMarker = new google.maps.Marker({
                      position: position,
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
                    
                    // Add the same listeners to the new vertex
                    newVertexMarker.addListener('click', () => showRedMarker(newVertexMarker));
                    newVertexMarker.addListener('dragstart', () => showRedMarker(newVertexMarker));
                    
                    // Add drag listener for direct dragging of white circle
                    newVertexMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
                      if (!e.latLng) return;
                      const idx = vertexMarkers.indexOf(newVertexMarker);
                      if (idx !== -1) {
                        vertices[idx] = e.latLng;
                      } else {
                        vertices[insertedIndex] = e.latLng;
                      }
                      
                      // Update the drag marker position if it exists
                      const newDragMarker = newVertexMarker.get('dragMarker');
                      if (newDragMarker) {
                        newDragMarker.setPosition(e.latLng);
                      }
                      
                      if (tempPolyline) {
                        const path = vertices.slice();
                        if (vertices.length >= 3) {
                          path.push(vertices[0]);
                        }
                        tempPolyline.setPath(path);
                      }
                      updateEdgeMarkers();
                    });

                    // Insert the new marker into vertexMarkers array
                    vertexMarkers.splice(insertedIndex, 0, newVertexMarker);
                  }
                }

                // Clean up the temporary drag marker
                if (dragMarker) {
                  dragMarker.setMap(null);
                }
                marker.set('dragMarker', null);
                marker.setOpacity(1);
                activeVertexMarkerRef.current = null;
                
                // Reset the edge marker state
                marker.set('vertexInserted', false);
                marker.set('insertedIndex', null);
              });
            } else {
              // This is a vertex marker
              // Store vertex index for later use
              const vertexIndex = vertexMarkers.indexOf(marker);
              if (vertexIndex !== -1) {
                marker.set('vertexIndex', vertexIndex);
              }
              
              dragMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
                if (!e.latLng) return;
                const index = marker.get('vertexIndex');
                if (typeof index === 'number') {
                  vertices[index] = e.latLng;
                  
                  if (tempPolyline) {
                    const path = vertices.slice();
                    if (vertices.length >= 3) {
                      path.push(vertices[0]);
                    }
                    tempPolyline.setPath(path);
                  }
                  updateEdgeMarkers();
                }
              });

              dragMarker.addListener('dragend', () => {
                // Update the position of the original white marker to match the final position of the red marker
                const finalPosition = dragMarker?.getPosition();
                if (finalPosition) {
                  marker.setPosition(finalPosition);
                }

                // Clean up the temporary drag marker
                if (dragMarker) {
                  dragMarker.setMap(null);
                }
                marker.set('dragMarker', null);
                marker.setOpacity(1);
                activeVertexMarkerRef.current = null;
              });
            }
          };

          // Add click listener to show red marker
          marker.addListener('click', () => {
            marker.set('edgeIndex', i);
            showRedMarker(marker);
          });

          // Also show red marker on dragstart
          marker.addListener('dragstart', () => {
            marker.set('edgeIndex', i);
            showRedMarker(marker);
          });

          marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            
            // Use the stored vertex index
            const index = marker.get('vertexIndex');
            if (typeof index === 'number') {
              vertices[index] = e.latLng;
              
              // Update the drag marker position if it exists
              const dragMarker = marker.get('dragMarker');
              if (dragMarker) {
                dragMarker.setPosition(e.latLng);
              }
              
              if (tempPolyline) {
                const path = vertices.slice();
                if (vertices.length >= 3) {
                  path.push(vertices[0]);
                }
                tempPolyline.setPath(path);
              }
              updateEdgeMarkers();
            }
          });

          // Add dragend listener to clean up
          marker.addListener('dragend', () => {
            const dragMarker = marker.get('dragMarker');
            if (dragMarker) {
              // Update the white marker position to match the red marker's final position
              const finalPosition = dragMarker.getPosition();
              if (finalPosition) {
                marker.setPosition(finalPosition);
              }
            } else {
              // Ensure the white marker is visible if no drag marker
              marker.setOpacity(1);
            }
          });

          edgeMarkers.push(marker as google.maps.Marker | google.maps.OverlayView);
        }
      }
    };
    
    const startDrawing = () => {
      // Create a polyline to track vertices
      tempPolyline = new google.maps.Polyline({
        map: map,
        path: [],
        strokeColor: strokeColor,  // Use the green color
        strokeWeight: strokeWeight
      });
      
      vertices = [];
      vertexMarkers = [];
      edgeMarkers = [];
      
      // Add click listener to map
      mapClickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng || !tempPolyline) return;
        
        vertices.push(e.latLng);
        
        // Create a marker for this vertex with circle icon (during drawing)
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

        let dragMarker: google.maps.Marker | null = null;

        const showRedMarker = (marker: google.maps.Marker) => {
          // If there's an existing active vertex marker, remove its drag marker
          if (activeVertexMarkerRef.current && activeVertexMarkerRef.current !== marker) {
            // Reset the previous active marker if it's not this one
            activeVertexMarkerRef.current.setOpacity(1);
            
            // Find and remove the previous drag marker if it exists
            const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
            if (prevDragMarker) {
              prevDragMarker.setMap(null);
              activeVertexMarkerRef.current.set('dragMarker', null);
            }
          }
          
          const position = marker.getPosition();
          if (!position) return;
          
          // Create the red location marker
          dragMarker = new google.maps.Marker({
            position: position,
            map: map,
            icon: {
              path: LOCATION_MARKER_PATH,
              fillColor: '#FF0000',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              scale: 4.5,
              anchor: new google.maps.Point(12, 23),
              rotation: MARKER_ROTATION
            },
            draggable: true,
            zIndex: 3
          });
          
          // Store the drag marker reference in the vertex marker
          marker.set('dragMarker', dragMarker);
          
          // Set this as the active vertex marker
          activeVertexMarkerRef.current = marker;
          
          // Hide the original marker
          marker.setOpacity(0);

          // Store the index of this vertex in the marker
          const vertexIndex = vertexMarkers.indexOf(marker);
          if (vertexIndex !== -1) {
            marker.set('vertexIndex', vertexIndex);
          }

          // Add drag listeners to the red marker
          dragMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            const index = marker.get('vertexIndex'); 
            if (typeof index === 'number') {
              vertices[index] = e.latLng;
              
              if (tempPolyline) {
                const path = vertices.slice();
                if (vertices.length >= 3) {
                  path.push(vertices[0]);
                }
                tempPolyline.setPath(path);
              }
              updateEdgeMarkers();
            }
          });
          
          // Add dragend listener to update the white marker position
          dragMarker.addListener('dragend', () => {
            // Update the position of the original white marker
            const finalPosition = dragMarker?.getPosition();
            if (finalPosition) {
              marker.setPosition(finalPosition);
            }
            
            // Clean up the drag marker
            if (dragMarker) {
              dragMarker.setMap(null);
            }
            marker.set('dragMarker', null);
            marker.setOpacity(1);
            activeVertexMarkerRef.current = null;
          });
        };

        // Add click listener to show red marker
        marker.addListener('click', () => {
          showRedMarker(marker);
        });

        // Also show red marker on dragstart
        marker.addListener('dragstart', () => {
          showRedMarker(marker);
        });

        marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          
          // Use the stored vertex index
          const index = marker.get('vertexIndex');
          if (typeof index === 'number') {
            vertices[index] = e.latLng;
            
            // Update the drag marker position if it exists
            const dragMarker = marker.get('dragMarker');
            if (dragMarker) {
              dragMarker.setPosition(e.latLng);
            }
            
            if (tempPolyline) {
              const path = vertices.slice();
              if (vertices.length >= 3) {
                path.push(vertices[0]);
              }
              tempPolyline.setPath(path);
            }
            updateEdgeMarkers();
          }
        });
        
        vertexMarkers.push(marker);
        
        // Update polyline path
        const path = vertices.slice();
        if (vertices.length >= 3) {
          path.push(vertices[0]); // Close the polygon
        }
        tempPolyline.setPath(path);
        
        // Update edge markers
        updateEdgeMarkers();
      });
      
      // Rest of the drawing code...
      mapDblClickListener = map.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
        if (vertices.length >= 3) {
          // Create final polygon
          const polygon = new google.maps.Polygon({
            map: map,
            paths: vertices,
            strokeColor: strokeColor,  // Use the green color
            strokeWeight: strokeWeight,
            fillColor: polygonColor,  // Use the green color
            fillOpacity: polygonFillOpacity,
            editable: true,
            draggable: true
          });
          
          // Clean up
          if (tempPolyline) {
            tempPolyline.setMap(null);
            tempPolyline = null;
          }
          
          // Remove all temporary markers
          vertexMarkers.forEach(marker => marker.setMap(null));
          edgeMarkers.forEach(marker => marker.setMap(null));
          vertexMarkers = [];
          edgeMarkers = [];
          
          if (mapClickListener) {
            google.maps.event.removeListener(mapClickListener);
            mapClickListener = null;
          }
          
          if (mapDblClickListener) {
            google.maps.event.removeListener(mapDblClickListener);
            mapDblClickListener = null;
          }
          
          // Call the polygon complete handler
          onPolygonComplete(polygon);
        }
      });
    };
    
    // Start drawing when drawing mode is enabled
    if (isDrawingMode) {
      startDrawing();
    }
    
    // Clean up when drawing mode is disabled
    return () => {
      if (tempPolyline) {
        tempPolyline.setMap(null);
      }
      if (vertexMarkers.length > 0) {
        vertexMarkers.forEach(marker => marker.setMap(null));
      }
      if (edgeMarkers.length > 0) {
        edgeMarkers.forEach(marker => marker.setMap(null));
      }
      if (mapClickListener) {
        google.maps.event.removeListener(mapClickListener);
      }
      if (mapDblClickListener) {
        google.maps.event.removeListener(mapDblClickListener);
      }
    };
  }, [map, isDrawingMode, onPolygonComplete]);

  // Use effect to setup auto-close polygon when drawing mode changes
  useEffect(() => {
    const cleanup = setupAutoClosePolygon();
    return cleanup;
  }, [setupAutoClosePolygon, isDrawingMode]);

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
            
            {/* We're not using DrawingManager anymore for our custom implementation */}
            
            {/* Display existing field polygons */}
            {fieldPolygons.map((polygon, index) => (
              <Polygon
                key={index}
                paths={polygon.getPath().getArray()}
                options={{
                  fillColor: polygonColor,  // Use the green color
                  fillOpacity: polygonFillOpacity,
                  strokeColor: strokeColor,  // Use the green color
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

        {/* Show Create Menu or New Field Button */}
        {showNewFieldButton ? (
          <div className="absolute bottom-24 right-4 z-10">
            <button 
              onClick={handleStartNewField}
              className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg flex items-center justify-center"
              style={{ width: '50px', height: '50px' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        ) : (
          <CreateMenu
            showMenu={showCreateMenu}
            onToggleMenu={() => setShowCreateMenu(!showCreateMenu)}
            onOptionSelect={handleCreateOption}
          />
        )}

        <ZoomControls
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      </div>
    </LoadScript>
  );
};

export default MapComponent;