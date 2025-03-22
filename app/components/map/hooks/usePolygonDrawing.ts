'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { LOCATION_MARKER_PATH, strokeColor, strokeWeight, polygonColor, polygonFillOpacity, MARKER_ROTATION } from '../constants';
import createDistanceOverlayClass from '../DistanceOverlay';

// Add TypeScript declarations for global window object
declare global {
  interface Window {
    tempPolylineRef: google.maps.Polyline | null;
    tempVerticesRef: google.maps.LatLng[] | null;
    tempMarkersRef: google.maps.Marker[] | null;
    tempEdgeMarkersRef: (google.maps.Marker | google.maps.OverlayView)[] | null;
    updateEdgeMarkersRef: Function | null;
  }
}

export const usePolygonDrawing = (map: google.maps.Map | null) => {
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [fieldPolygons, setFieldPolygons] = useState<google.maps.Polygon[]>([]);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const activeVertexMarkerRef = useRef<google.maps.Marker | null>(null);
  const DistanceOverlayRef = useRef<any>(null);

  // Method to set up the DistanceOverlay class
  const setupDistanceOverlay = useCallback(() => {
    if (!map || typeof google === 'undefined') return;

    // Create the class using the factory function
    const DistanceOverlayClass = createDistanceOverlayClass();
    // Store the class in the ref for later use
    DistanceOverlayRef.current = DistanceOverlayClass;
  }, [map]);

  // Utility function to hide/show polygon markers
  const togglePolygonMarkers = useCallback((polygons: google.maps.Polygon[], show: boolean) => {
    if (!map) return;
    
    polygons.forEach(polygon => {
      if (!polygon) return;
      
      // Handle vertex markers
      const vertexMarkers = polygon.get('vertexMarkers') || [];
      vertexMarkers.forEach((marker: google.maps.Marker) => {
        marker.setMap(show ? map : null);
      });
      
      // Handle edge markers
      const edgeMarkers = polygon.get('edgeMarkers') || [];
      edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
        marker.setMap(show ? map : null);
      });
    });
  }, [map]);
  
  // Function to toggle drawing mode
  const toggleDrawingMode = useCallback((enable: boolean) => {
    // When enabling drawing mode, always hide all markers and make polygons non-editable
    fieldPolygons.forEach(polygon => {
      // Hide vertex markers
      const vertexMarkers = polygon.get('vertexMarkers') || [];
      vertexMarkers.forEach((marker: google.maps.Marker) => {
        marker.setMap(null);
      });
      
      // Hide edge markers
      const edgeMarkers = polygon.get('edgeMarkers') || [];
      edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
        marker.setMap(null);
      });
      
      // Make sure polygon is not editable
      polygon.setOptions({
        editable: false,
        draggable: false
      });
      
      // Update edit mode flag
      polygon.set('editMode', false);
    });
    
    // Update the drawing mode state
    setIsDrawingMode(enable);
  }, [fieldPolygons]);

  // Polygon complete handler
  const onPolygonComplete = useCallback((polygon: google.maps.Polygon) => {
    if (typeof google === 'undefined') return;
    
    // Add the completed polygon to state
    setFieldPolygons(prevPolygons => {
      const newPolygons = [...prevPolygons, polygon];
      
      // Create draggable vertex markers for the completed polygon
      const polygonPath = polygon.getPath();
      const pathLength = polygonPath.getLength();
      const vertexMarkers: google.maps.Marker[] = [];
      
      // Reset active vertex markers
      activeVertexMarkerRef.current = null;
      
      // Create a function to add/update edge markers
      const addEdgeMarkersForPolygon = () => {
        // Clear existing edge markers
        const oldMarkers = polygon.get('edgeMarkers') || [];
        oldMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
          marker.setMap(null);
        });

        // Create new edge markers
        const newEdgeMarkers: (google.maps.Marker | google.maps.OverlayView)[] = [];
        
        if (pathLength < 2) return;
        
        for (let i = 0; i < pathLength; i++) {
          const position1 = polygonPath.getAt(i);
          const position2 = polygonPath.getAt((i + 1) % pathLength);
          
          // Calculate midpoint
          const lat = (position1.lat() + position2.lat()) / 2;
          const lng = (position1.lng() + position2.lng()) / 2;
          const midpoint = new google.maps.LatLng(lat, lng);
          
          // Calculate distance
          const distance = google.maps.geometry.spherical.computeDistanceBetween(position1, position2);
          const distanceText = distance < 1000
            ? `${Math.round(distance)}m`
            : `${(distance / 1000).toFixed(2)}km`;
          
          // Create edge marker - not visible by default
          const edgeMarker = new google.maps.Marker({
            position: midpoint,
            map: null, // Initially hidden
            draggable: true,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 3,
              fillColor: '#FFFFFF',
              fillOpacity: 1,
              strokeColor: '#000000',
              strokeWeight: 1,
            },
            label: {
              text: distanceText,
              color: '#000000',
              fontSize: '10px',
              fontWeight: 'bold',
            }
          });
          
          edgeMarker.set('edgeIndex', i);
          edgeMarker.set('parentPolygon', polygon);
          newEdgeMarkers.push(edgeMarker);
          
          // Store the polygon with this edge marker
          edgeMarker.set('polygon', polygon);
          
          // Add direct drag handler for the edge marker
          edgeMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            
            // Forward the drag event to the red marker if it exists
            const dragMarker = edgeMarker.get('dragMarker');
            if (dragMarker) {
              dragMarker.setPosition(e.latLng);
              
              // Trigger the drag event on the red marker
              google.maps.event.trigger(dragMarker, 'drag', e);
            } else {
              // Handle dragging directly with the edge marker
              if (!edgeMarker.get('vertexInserted')) {
                const edgeIndex = edgeMarker.get('edgeIndex');
                if (typeof edgeIndex !== 'number') return;
                
                // We need to determine if we're in drawing mode or editing an existing polygon
                const polygonToUpdate = edgeMarker.get('polygon') as google.maps.Polygon;
                
                if (polygonToUpdate) {
                  // Editing an existing polygon
                  const polygonPath = polygonToUpdate.getPath();
                  const insertAt = (edgeIndex + 1) % polygonPath.getLength();
                  
                  // Insert new vertex at the edge midpoint
                  polygonPath.insertAt(insertAt, e.latLng);
                  edgeMarker.set('vertexInserted', true);
                  edgeMarker.set('insertedIndex', insertAt);
                  
                  // Update edge markers for the polygon
                  const addEdgeMarkersFunc = polygonToUpdate.get('addEdgeMarkersForPolygon');
                  if (typeof addEdgeMarkersFunc === 'function') {
                    addEdgeMarkersFunc();
                  }
                } else if (window.tempVerticesRef) {
                  // We're in drawing mode
                  const vertices = window.tempVerticesRef as google.maps.LatLng[];
                  const vertexMarkers = window.tempMarkersRef as google.maps.Marker[];
                  const tempPolyline = window.tempPolylineRef as google.maps.Polyline;
                  
                  // Insert new vertex at the edge midpoint
                  vertices.splice(edgeIndex + 1, 0, e.latLng);
                  edgeMarker.set('vertexInserted', true);
                  edgeMarker.set('insertedIndex', edgeIndex + 1);
                  
                  // Create a new vertex marker for the inserted point
                  const newMarker = new google.maps.Marker({
                    position: e.latLng,
                    map: map,
                    icon: {
                      path: google.maps.SymbolPath.CIRCLE,
                      scale: 7,
                      fillColor: '#FFFFFF',
                      fillOpacity: 0.5,
                      strokeColor: '#FFFFFF',
                      strokeWeight: 2
                    },
                    draggable: true,
                    zIndex: 2,
                    label: {
                      text: `${edgeIndex + 1}`,
                      color: '#000000',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }
                  });
                  
                  // Store the vertex index
                  const newIndex = edgeIndex + 1;
                  newMarker.set('vertexIndex', newIndex);
                  
                  // Add all the necessary event listeners to this new marker
                  if (window.tempEdgeMarkersRef) {
                    const edgeMarkers = window.tempEdgeMarkersRef as (google.maps.Marker | google.maps.OverlayView)[];
                    
                    // Function to show red marker when dragging
                    const showRedMarker = (baseMarker: google.maps.Marker) => {
                      if (activeVertexMarkerRef.current && activeVertexMarkerRef.current !== baseMarker) {
                        // Reset the previous active marker
                        activeVertexMarkerRef.current.setOpacity(1);
                        const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
                        if (prevDragMarker) {
                          prevDragMarker.setMap(null);
                          activeVertexMarkerRef.current.set('dragMarker', null);
                        }
                      }
                      
                      const position = baseMarker.getPosition();
                      if (!position) return;
                      
                      // Create the red location marker
                      const redMarker = new google.maps.Marker({
                        position: position,
                        map: map,
                        icon: {
                          path: LOCATION_MARKER_PATH,
                          fillColor: '#FF0000',
                          fillOpacity: 0.2,
                          strokeColor: '#FFFFFF',
                          strokeWeight: 1,
                          scale: 4.5,
                          anchor: new google.maps.Point(12, 23),
                          rotation: MARKER_ROTATION
                        },
                        draggable: true,
                        zIndex: 3
                      });
                      
                      baseMarker.set('dragMarker', redMarker);
                      activeVertexMarkerRef.current = baseMarker;
                      baseMarker.setOpacity(0);
                      
                      const markerIndex = baseMarker.get('vertexIndex');
                      if (typeof markerIndex !== 'number') return;
                      
                      redMarker.addListener('drag', (evt: google.maps.MapMouseEvent) => {
                        if (!evt.latLng) return;
                        vertices[markerIndex] = evt.latLng;
                        
                        if (tempPolyline) {
                          const polylinePath = vertices.slice();
                          if (vertices.length >= 3) {
                            polylinePath.push(vertices[0]);
                          }
                          tempPolyline.setPath(polylinePath);
                        }
                        edgeMarkers.forEach(marker => {
                          if (marker) marker.setMap(null);
                        });
                      });
                      
                      redMarker.addListener('dragend', () => {
                        const finalPosition = redMarker.getPosition();
                        if (finalPosition) {
                          baseMarker.setPosition(finalPosition);
                        }
                        
                        redMarker.setMap(null);
                        baseMarker.set('dragMarker', null);
                        baseMarker.setOpacity(1);
                        activeVertexMarkerRef.current = null;
                      });
                    };
                    
                    // Update indices of all markers after this one
                    for (let i = 0; i < vertexMarkers.length; i++) {
                      const marker = vertexMarkers[i];
                      const markerIndex = marker.get('vertexIndex');
                      if (typeof markerIndex === 'number' && markerIndex > edgeIndex) {
                        marker.set('vertexIndex', markerIndex + 1);
                        
                        // Update label text without using spread operator
                        marker.setLabel({
                          text: `${markerIndex + 2}`,
                          color: '#000000',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        });
                      }
                    }
                    
                    // Add the new marker to our collection
                    vertexMarkers.splice(newIndex, 0, newMarker);
                    window.tempMarkersRef = vertexMarkers;
                    
                    newMarker.addListener('click', () => {
                      showRedMarker(newMarker);
                    });
                    
                    newMarker.addListener('dragstart', () => {
                      showRedMarker(newMarker);
                    });
                    
                    newMarker.addListener('drag', (evt: google.maps.MapMouseEvent) => {
                      if (!evt.latLng) return;
                      
                      const markerIndex = newMarker.get('vertexIndex');
                      if (typeof markerIndex === 'number') {
                        vertices[markerIndex] = evt.latLng;
                        
                        const dragMarker = newMarker.get('dragMarker');
                        if (dragMarker) {
                          dragMarker.setPosition(evt.latLng);
                        }
                        
                        if (tempPolyline) {
                          const polylinePath = vertices.slice();
                          if (vertices.length >= 3) {
                            polylinePath.push(vertices[0]);
                          }
                          tempPolyline.setPath(polylinePath);
                        }
                        
                        edgeMarkers.forEach(marker => {
                          if (marker) marker.setMap(null);
                        });
                      }
                    });
                    
                    // Update the polyline
                    if (tempPolyline) {
                      const polylinePath = vertices.slice();
                      if (vertices.length >= 3) {
                        polylinePath.push(vertices[0]);
                      }
                      tempPolyline.setPath(polylinePath);
                    }
                    
                    // Update all edge markers
                    edgeMarkers.forEach(marker => {
                      if (marker) marker.setMap(null);
                    });
                  }
                }
              } else {
                // Update the position of the inserted vertex
                const insertedIndex = edgeMarker.get('insertedIndex');
                if (typeof insertedIndex === 'number') {
                  
                  // We need to determine if we're in drawing mode or editing an existing polygon
                  const polygonToUpdate = edgeMarker.get('polygon') as google.maps.Polygon;
                  
                  if (polygonToUpdate) {
                    // Editing an existing polygon
                    const polygonPath = polygonToUpdate.getPath();
                    polygonPath.setAt(insertedIndex, e.latLng);
                    
                    // Update edge markers for the polygon
                    const addEdgeMarkersFunc = polygonToUpdate.get('addEdgeMarkersForPolygon');
                    if (typeof addEdgeMarkersFunc === 'function') {
                      addEdgeMarkersFunc();
                    }
                  } else if (window.tempVerticesRef) {
                    // We're in drawing mode
                    const vertices = window.tempVerticesRef as google.maps.LatLng[];
                    const vertexMarkers = window.tempMarkersRef as google.maps.Marker[];
                    const tempPolyline = window.tempPolylineRef as google.maps.Polyline;
                    
                    vertices[insertedIndex] = e.latLng;
                    
                    // Update the marker position if it exists
                    const marker = vertexMarkers[insertedIndex];
                    if (marker) {
                      marker.setPosition(e.latLng);
                    }
                    
                    // Update the polyline
                    if (tempPolyline) {
                      const polylinePath = vertices.slice();
                      if (vertices.length >= 3) {
                        polylinePath.push(vertices[0]);
                      }
                      tempPolyline.setPath(polylinePath);
                    }
                    
                    // Update all edge markers
                    if (window.tempEdgeMarkersRef) {
                      const edgeMarkers = window.tempEdgeMarkersRef as (google.maps.Marker | google.maps.OverlayView)[];
                      edgeMarkers.forEach(marker => {
                        if (marker) marker.setMap(null);
                      });
                    }
                  }
                }
              }
            }
          });
          
          newEdgeMarkers.push(edgeMarker);
        }
        
        polygon.set('edgeMarkers', newEdgeMarkers);
      };
      
      // Create draggable vertex markers
      for (let i = 0; i < pathLength; i++) {
        const position = polygonPath.getAt(i);
        const marker = new google.maps.Marker({
          position,
          map: null, // Initially hidden
          draggable: true,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 5,
            fillColor: '#FFFFFF',
            fillOpacity: 1,
            strokeColor: '#000000',
            strokeWeight: 2,
          },
          label: {
            text: `${i + 1}`,
            color: '#000000',
            fontSize: '12px',
            fontWeight: 'bold'
          }
        });
        
        // Store index with marker
        marker.set('index', i);
        marker.set('polygon', polygon);
        vertexMarkers.push(marker);
        
        // Add drag listener to vertex marker
        marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          
          const index = marker.get('index');
          if (typeof index !== 'number') return;
          
          const polygonToUpdate = marker.get('polygon') as google.maps.Polygon;
          if (!polygonToUpdate) return;
          
          // Update the vertex position
          polygonToUpdate.getPath().setAt(index, e.latLng);
          
          // Update edge markers
          addEdgeMarkersForPolygon();
        });
      }
      
      // Store the vertex markers with the polygon
      polygon.set('vertexMarkers', vertexMarkers);
      
      // Store the function to update edge markers with the polygon
      polygon.set('addEdgeMarkersForPolygon', addEdgeMarkersForPolygon);
      
      // Initialize edit mode as false
      polygon.set('editMode', false);
      
      // Initialize edge markers
      addEdgeMarkersForPolygon();
      
      // Add click listener to polygon - doesn't show any markers
      polygon.addListener('click', () => {
        // We don't show any markers on click - only double-click will activate edit mode
        // Just highlight the selected polygon
        polygon.setOptions({
          strokeWeight: strokeWeight * 2, // Make the border thicker to indicate selection
        });
        
        // Hide all markers and return all other polygons to normal appearance
        fieldPolygons.forEach(otherPolygon => {
          // For the clicked polygon, make sure markers are hidden too
          if (otherPolygon === polygon) {
            // Ensure markers are hidden for clicked polygon unless in edit mode
            if (!otherPolygon.get('editMode')) {
              const vertexMarkers = otherPolygon.get('vertexMarkers') || [];
              vertexMarkers.forEach((marker: google.maps.Marker) => {
                marker.setMap(null);
              });
              
              const edgeMarkers = otherPolygon.get('edgeMarkers') || [];
              edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
                marker.setMap(null);
              });
            }
          } else {
            // For other polygons
            otherPolygon.setOptions({
              strokeWeight: strokeWeight,
            });
            
            // Ensure markers are hidden for other polygons
            const vertexMarkers = otherPolygon.get('vertexMarkers') || [];
            vertexMarkers.forEach((marker: google.maps.Marker) => {
              marker.setMap(null);
            });
            
            const edgeMarkers = otherPolygon.get('edgeMarkers') || [];
            edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
              marker.setMap(null);
            });
            
            // Ensure edit mode is off
            otherPolygon.set('editMode', false);
          }
        });
      });
      
      // Add a map click listener to hide markers when clicking outside the polygon
      const mapClickListener = map?.addListener('click', (e: google.maps.MapMouseEvent) => {
        // Hide markers of this polygon
        const vertexMarkers = polygon.get('vertexMarkers') || [];
        vertexMarkers.forEach((marker: google.maps.Marker) => {
          marker.setMap(null);
        });
        
        const edgeMarkers = polygon.get('edgeMarkers') || [];
        edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
          marker.setMap(null);
        });
        
        // Update the edit mode flag
        polygon.set('editMode', false);
        
        // Make the polygon non-editable
        polygon.setOptions({
          editable: false,
          draggable: false,
          strokeWeight: strokeWeight, // Reset to normal stroke weight
        });
      });
      
      // Store the map click listener reference for cleanup
      polygon.set('mapClickListener', mapClickListener);
      
      // Add double-click listener to toggle edit mode for the polygon
      polygon.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
        // Stop the event from propagating to prevent map double-click handler
        e.stop();
        
        // Toggle edit mode for this polygon
        const currentEditMode = polygon.get('editMode') || false;
        togglePolygonEditMode(polygon, !currentEditMode);
      });
      
      return newPolygons;
    });
    
    // Reset drawing state
    if (isDrawingMode) {
      toggleDrawingMode(false);
    }
  }, [map, isDrawingMode, toggleDrawingMode, fieldPolygons]);

  // Effect for initializing drawing mode
  useEffect(() => {
    if (!map || !isDrawingMode || typeof google === 'undefined') return;
    
    console.log("Drawing mode initialized, setting up map click listeners");
    
    // The togglePolygonMarkers is now handled by toggleDrawingMode
    // So we can remove the direct hide code from here
    
    // Create a new polyline to track vertices
    let tempPolyline = new google.maps.Polyline({
      map: map,
      path: [],
      strokeColor: strokeColor,
      strokeWeight: strokeWeight
    });
    
    // Arrays to store vertices and markers
    let vertices: google.maps.LatLng[] = [];
    let vertexMarkers: google.maps.Marker[] = [];
    let edgeMarkers: (google.maps.Marker | google.maps.OverlayView)[] = [];
    
    // Store in global variables for access from other components
    window.tempPolylineRef = tempPolyline;
    window.tempVerticesRef = vertices;
    window.tempMarkersRef = vertexMarkers;
    window.tempEdgeMarkersRef = edgeMarkers;
    
    // Function to update edge markers
    const updateEdgeMarkers = () => {
      // Remove existing edge markers
      edgeMarkers.forEach(marker => {
        if (marker) marker.setMap(null);
      });
      edgeMarkers = [];
      
      if (vertices.length < 2) return;
      
      // Add new edge markers
      for (let i = 0; i < vertices.length; i++) {
        const p1 = vertices[i];
        const p2 = vertices[(i + 1) % vertices.length];
        
        // Calculate midpoint
        const midLat = (p1.lat() + p2.lat()) / 2;
        const midLng = (p1.lng() + p2.lng()) / 2;
        const midpoint = new google.maps.LatLng(midLat, midLng);
        
        // Calculate distance
        const distance = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
        const distanceText = distance < 1000 
          ? `${Math.round(distance)}m`
          : `${(distance / 1000).toFixed(2)}km`;
        
        // Always keep text straight - no rotation
        const angle = 0;
        
        // Create distance label - only visible during drawing
        if (DistanceOverlayRef.current) {
          const overlay = new DistanceOverlayRef.current(
            midpoint,
            distanceText,
            angle,
            null // No handler during drawing
          );
          overlay.setMap(map);
          edgeMarkers.push(overlay);
        }
        
        // Create edge marker - only for dragging functionality, not visible
        const edgeMarker = new google.maps.Marker({
          position: midpoint,
          map: null, // Completely hidden by default
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
        
        // Store which edge this marker is for
        edgeMarker.set('edgeIndex', i);
        
        // Add dragstart event to switch to red marker
        edgeMarker.addListener('dragstart', () => {
          // If there's an existing active vertex marker, remove its drag marker
          if (activeVertexMarkerRef.current && activeVertexMarkerRef.current !== edgeMarker) {
            // Reset the previous active marker if it's not this one
            activeVertexMarkerRef.current.setOpacity(1);
            
            // Find and remove the previous drag marker if it exists
            const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
            if (prevDragMarker) {
              prevDragMarker.setMap(null);
              activeVertexMarkerRef.current.set('dragMarker', null);
            }
          }
          
          const position = edgeMarker.getPosition();
          if (!position) return;
          
          // Create draggable red marker at the edge midpoint
          const dragMarker = new google.maps.Marker({
            position: position,
            map: map,
            icon: {
              path: LOCATION_MARKER_PATH,
              fillColor: '#FF0000',
              fillOpacity: 0.2,
              strokeColor: '#FFFFFF',
              strokeWeight: 1,
              scale: 4.5,
              anchor: new google.maps.Point(12, 23),
              rotation: MARKER_ROTATION
            },
            draggable: true,
            zIndex: 3
          });
          
          // Store the drag marker reference in the edge marker
          edgeMarker.set('dragMarker', dragMarker);
          
          // Set this as the active vertex marker
          activeVertexMarkerRef.current = edgeMarker;
          
          // Hide the original marker
          edgeMarker.setOpacity(0);
          
          // Add drag event handling
          dragMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            
            // Handle inserting a new vertex during drag
            if (!edgeMarker.get('vertexInserted')) {
              const edgeIndex = edgeMarker.get('edgeIndex');
              if (typeof edgeIndex !== 'number') return;
              
              // Insert new vertex at the edge midpoint
              vertices.splice(edgeIndex + 1, 0, e.latLng);
              edgeMarker.set('vertexInserted', true);
              edgeMarker.set('insertedIndex', edgeIndex + 1);
              
              // Create a new vertex marker for the inserted point
              const newMarker = new google.maps.Marker({
                position: e.latLng,
                map: map,
                icon: {
                  path: google.maps.SymbolPath.CIRCLE,
                  scale: 7,
                  fillColor: '#FFFFFF',
                  fillOpacity: 0.5,
                  strokeColor: '#FFFFFF',
                  strokeWeight: 2
                },
                draggable: true,
                zIndex: 2,
                label: {
                  text: `${edgeIndex + 2}`,
                  color: '#000000',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }
              });
              
              // Store the vertex index
              const newIndex = edgeIndex + 1;
              newMarker.set('vertexIndex', newIndex);
              
              // Update indices of all markers after this one
              for (let i = 0; i < vertexMarkers.length; i++) {
                const marker = vertexMarkers[i];
                const markerIndex = marker.get('vertexIndex');
                if (typeof markerIndex === 'number' && markerIndex > edgeIndex) {
                  marker.set('vertexIndex', markerIndex + 1);
                  
                  // Update label text without using spread operator
                  marker.setLabel({
                    text: `${markerIndex + 2}`,
                    color: '#000000',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  });
                }
              }
              
              // Add the new marker to our collection
              vertexMarkers.splice(newIndex, 0, newMarker);
              window.tempMarkersRef = vertexMarkers;
              
              // Function to show red marker when dragging
              const showRedMarker = (baseMarker: google.maps.Marker) => {
                if (activeVertexMarkerRef.current && activeVertexMarkerRef.current !== baseMarker) {
                  // Reset the previous active marker if it's not this one
                  activeVertexMarkerRef.current.setOpacity(1);
                  
                  // Find and remove the previous drag marker if it exists
                  const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
                  if (prevDragMarker) {
                    prevDragMarker.setMap(null);
                    activeVertexMarkerRef.current.set('dragMarker', null);
                  }
                }
                
                const position = baseMarker.getPosition();
                if (!position) return;
                
                // Create the red location marker
                const redMarker = new google.maps.Marker({
                  position: position,
                  map: map,
                  icon: {
                    path: LOCATION_MARKER_PATH,
                    fillColor: '#FF0000',
                    fillOpacity: 0.2,
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
                baseMarker.set('dragMarker', redMarker);
                
                // Set this as the active vertex marker
                activeVertexMarkerRef.current = baseMarker;
                
                // Hide the original marker
                baseMarker.setOpacity(0);
                
                // Add drag listeners to the red marker
                redMarker.addListener('drag', (evt: google.maps.MapMouseEvent) => {
                  if (!evt.latLng) return;
                  
                  const markerIndex = baseMarker.get('vertexIndex');
                  if (typeof markerIndex === 'number') {
                    vertices[markerIndex] = evt.latLng;
                    
                    if (tempPolyline) {
                      const polylinePath = vertices.slice();
                      if (vertices.length >= 3) {
                        polylinePath.push(vertices[0]);
                      }
                      tempPolyline.setPath(polylinePath);
                    }
                    
                    updateEdgeMarkers();
                  }
                });
                
                // Add dragend listener to update the white marker position
                redMarker.addListener('dragend', () => {
                  const finalPosition = redMarker.getPosition();
                  if (finalPosition) {
                    baseMarker.setPosition(finalPosition);
                  }
                  
                  redMarker.setMap(null);
                  baseMarker.set('dragMarker', null);
                  baseMarker.setOpacity(1);
                  activeVertexMarkerRef.current = null;
                });
              };
              
              // Add all the necessary listeners to this new marker
              newMarker.addListener('click', () => {
                showRedMarker(newMarker);
              });
              
              newMarker.addListener('dragstart', () => {
                showRedMarker(newMarker);
              });
              
              newMarker.addListener('drag', (evt: google.maps.MapMouseEvent) => {
                if (!evt.latLng) return;
                
                const markerIndex = newMarker.get('vertexIndex');
                if (typeof markerIndex === 'number') {
                  vertices[markerIndex] = evt.latLng;
                  
                  const dragMarker = newMarker.get('dragMarker');
                  if (dragMarker) {
                    dragMarker.setPosition(evt.latLng);
                  }
                  
                  if (tempPolyline) {
                    const polylinePath = vertices.slice();
                    if (vertices.length >= 3) {
                      polylinePath.push(vertices[0]);
                    }
                    tempPolyline.setPath(polylinePath);
                  }
                  
                  updateEdgeMarkers();
                }
              });
            } else {
              const insertedIndex = edgeMarker.get('insertedIndex');
              if (typeof insertedIndex === 'number') {
                vertices[insertedIndex] = e.latLng;
                
                // Update the vertex marker position
                const createdMarker = vertexMarkers.find(m => m.get('vertexIndex') === insertedIndex);
                if (createdMarker) {
                  createdMarker.setPosition(e.latLng);
                }
              }
            }
            
            // Update the polyline
            if (tempPolyline) {
              const polylinePath = vertices.slice();
              if (vertices.length >= 3) {
                polylinePath.push(vertices[0]);
              }
              tempPolyline.setPath(polylinePath);
            }
            
            // Update all edge markers
            updateEdgeMarkers();
          });
          
          // Add dragend handler for cleanup
          dragMarker.addListener('dragend', () => {
            // Don't reset the vertexInserted flag or insertedIndex, as we want to keep the new vertex
            
            // Clean up the drag marker
            dragMarker.setMap(null);
            edgeMarker.set('dragMarker', null);
            edgeMarker.setOpacity(1);
            activeVertexMarkerRef.current = null;
          });
        });
        
        edgeMarkers.push(edgeMarker);
      }
      
      window.tempEdgeMarkersRef = edgeMarkers;
    };
    
    // Store the updateEdgeMarkers function for access from other components
    window.updateEdgeMarkersRef = updateEdgeMarkers;
    
    // Function to add a vertex when clicking on the map
    const addVertex = (latLng: google.maps.LatLng) => {
      vertices.push(latLng);
      window.tempVerticesRef = vertices;
      const vertexIndex = vertices.length - 1;
      
      // Create the vertex marker with circle icon (white during drawing)
      const marker = new google.maps.Marker({
        position: latLng,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#FFFFFF',
          fillOpacity: 0.5,
          strokeColor: '#FFFFFF',
          strokeWeight: 2
        },
        draggable: true,
        zIndex: 2,
        label: {
          text: `${vertexIndex + 1}`,
          color: '#000000',
          fontSize: '12px',
          fontWeight: 'bold'
        }
      });
      
      // Store the vertex index
      marker.set('vertexIndex', vertexIndex);
      
      // Function to show red marker when dragging
      const showRedMarker = (baseMarker: google.maps.Marker) => {
        if (activeVertexMarkerRef.current && activeVertexMarkerRef.current !== baseMarker) {
          // Reset the previous active marker if it's not this one
          activeVertexMarkerRef.current.setOpacity(1);
          
          // Find and remove the previous drag marker if it exists
          const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
          if (prevDragMarker) {
            prevDragMarker.setMap(null);
            activeVertexMarkerRef.current.set('dragMarker', null);
          }
        }
        
        const position = baseMarker.getPosition();
        if (!position) return;
        
        // Create the red location marker
        const dragMarker = new google.maps.Marker({
          position: position,
          map: map,
          icon: {
            path: LOCATION_MARKER_PATH,
            fillColor: '#FF0000',
            fillOpacity: 0.2,
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
        baseMarker.set('dragMarker', dragMarker);
        
        // Set this as the active vertex marker
        activeVertexMarkerRef.current = baseMarker;
        
        // Hide the original marker
        baseMarker.setOpacity(0);

        // Get the vertex index from the marker
        const index = baseMarker.get('vertexIndex');
        if (typeof index !== 'number') return;

        // Add drag listeners to the red marker
        dragMarker.addListener('drag', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          // Use the vertex index directly from the marker
          vertices[index] = e.latLng;
          
          if (tempPolyline) {
            const polylinePath = vertices.slice();
            if (vertices.length >= 3) {
              polylinePath.push(vertices[0]);
            }
            tempPolyline.setPath(polylinePath);
          }
          updateEdgeMarkers();
        });
        
        // Add dragend listener to update the white marker position
        dragMarker.addListener('dragend', () => {
          // Update the position of the original white marker
          const finalPosition = dragMarker?.getPosition();
          if (finalPosition) {
            baseMarker.setPosition(finalPosition);
          }
          
          // Clean up the drag marker
          dragMarker.setMap(null);
          baseMarker.set('dragMarker', null);
          baseMarker.setOpacity(1);
          activeVertexMarkerRef.current = null;
        });
      };
      
      // Add click listener to show red marker
      marker.addListener('click', () => {
        showRedMarker(marker);
      });
      
      // Add dragstart listener to show red marker
      marker.addListener('dragstart', () => {
        showRedMarker(marker);
      });
      
      // Add drag handlers
      marker.addListener('drag', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        
        const index = marker.get('vertexIndex');
        if (typeof index === 'number') {
          vertices[index] = e.latLng;
          
          // Update the drag marker position if it exists
          const dragMarker = marker.get('dragMarker');
          if (dragMarker) {
            dragMarker.setPosition(e.latLng);
          }
          
          if (tempPolyline) {
            const polylinePath = vertices.slice();
            if (vertices.length >= 3) {
              polylinePath.push(vertices[0]); // Close the path
            }
            tempPolyline.setPath(polylinePath);
          }
          
          updateEdgeMarkers();
        }
      });
      
      vertexMarkers.push(marker);
      window.tempMarkersRef = vertexMarkers;
      
      // Update the polyline
      const polylinePath = vertices.slice();
      if (vertices.length >= 3) {
        polylinePath.push(vertices[0]); // Close the polygon
      }
      tempPolyline.setPath(polylinePath);
      
      // Update edge markers
      updateEdgeMarkers();
    };
    
    // Add click listener to the map
    const mapClickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      console.log("Map clicked in drawing mode", e.latLng?.toString());
      if (e.latLng && isDrawingMode) {
        addVertex(e.latLng);
      }
    });
    
    // Add double-click listener to complete the polygon
    const mapDblClickListener = map.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
      if (vertices.length >= 3) {
        console.log("Double-clicked to complete polygon with", vertices.length, "vertices");
        
        // Create the final polygon
        const polygon = new google.maps.Polygon({
          map: map,
          paths: vertices,
          strokeColor: strokeColor,
          strokeWeight: strokeWeight,
          fillColor: polygonColor,
          fillOpacity: polygonFillOpacity,
          editable: false, // Not editable by default
          draggable: false // Not draggable by default
        });
        
        // Clean up temporary drawing elements
        tempPolyline.setMap(null);
        vertexMarkers.forEach(marker => marker.setMap(null));
        edgeMarkers.forEach(marker => {
          if (marker) marker.setMap(null);
        });
        
        // Reset references
        window.tempPolylineRef = null;
        window.tempVerticesRef = [];
        window.tempMarkersRef = [];
        window.tempEdgeMarkersRef = [];
        window.updateEdgeMarkersRef = null;
        
        // Call the polygon complete handler
        onPolygonComplete(polygon);
        
        // Also hide markers of all existing polygons to ensure they stay hidden
        fieldPolygons.forEach(existingPolygon => {
          // Hide vertex markers
          const vertexMarkers = existingPolygon.get('vertexMarkers') || [];
          vertexMarkers.forEach((marker: google.maps.Marker) => {
            marker.setMap(null);
          });
          
          // Hide edge markers
          const edgeMarkers = existingPolygon.get('edgeMarkers') || [];
          edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
            marker.setMap(null);
          });
        });
      }
    });
    
    // Cleanup function
    return () => {
      console.log("Cleaning up drawing mode");
      
      if (mapClickListener) {
        google.maps.event.removeListener(mapClickListener);
      }
      
      if (mapDblClickListener) {
        google.maps.event.removeListener(mapDblClickListener);
      }
      
      if (tempPolyline) {
        tempPolyline.setMap(null);
      }
      
      vertexMarkers.forEach(marker => marker.setMap(null));
      edgeMarkers.forEach(marker => {
        if (marker) marker.setMap(null);
      });
      
      // Clear global references
      window.tempPolylineRef = null;
      window.tempVerticesRef = null;
      window.tempMarkersRef = null;
      window.tempEdgeMarkersRef = null;
      window.updateEdgeMarkersRef = null;
    };
  }, [map, isDrawingMode, onPolygonComplete]);

  // Initialize distance overlay when map is loaded
  useEffect(() => {
    // Only run this effect when map and google are available
    if (map && typeof google !== 'undefined') {
      setupDistanceOverlay();
    }
  }, [setupDistanceOverlay, map]);

  // Function to toggle edit mode for a specific polygon
  const togglePolygonEditMode = useCallback((polygon: google.maps.Polygon, enable: boolean) => {
    if (!map || !polygon) return;
    
    // Update the edit mode flag
    polygon.set('editMode', enable);
    
    // Make the polygon editable/draggable based on the edit mode
    polygon.setOptions({
      editable: enable,
      draggable: enable
    });
    
    // Get references to the markers
    const vertexMarkers = polygon.get('vertexMarkers') || [];
    const edgeMarkers = polygon.get('edgeMarkers') || [];
    
    // Set visibility of markers based on edit mode
    vertexMarkers.forEach((marker: google.maps.Marker) => {
      marker.setMap(enable ? map : null);
    });
    
    edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
      marker.setMap(enable ? map : null);
    });
    
    // If enabling edit mode for this polygon, disable for all others
    if (enable) {
      fieldPolygons.forEach(otherPolygon => {
        if (otherPolygon !== polygon) {
          // Make the other polygons non-editable
          otherPolygon.setOptions({
            editable: false,
            draggable: false
          });
          
          // Get references to the other polygon's markers
          const otherVertexMarkers = otherPolygon.get('vertexMarkers') || [];
          const otherEdgeMarkers = otherPolygon.get('edgeMarkers') || [];
          
          // Hide the markers
          otherVertexMarkers.forEach((marker: google.maps.Marker) => {
            marker.setMap(null);
          });
          
          otherEdgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
            marker.setMap(null);
          });
          
          // Update the edit mode flag
          otherPolygon.set('editMode', false);
        }
      });
    }
  }, [map, fieldPolygons]);

  return {
    isDrawingMode,
    setIsDrawingMode,
    toggleDrawingMode,
    fieldPolygons,
    setFieldPolygons,
    drawingManagerRef,
    activeVertexMarkerRef,
    onPolygonComplete,
    togglePolygonEditMode
  };
};

export default usePolygonDrawing; 
