'use client';

import { useState, useCallback } from 'react';

type CreateOption = 'import' | 'field' | 'distance' | 'marker';

const useCreateMenu = (
  setIsDrawingMode: (value: boolean) => void,
  fieldPolygons: google.maps.Polygon[],
  onPolygonComplete: (polygon: google.maps.Polygon) => void,
  activeVertexMarkerRef: React.MutableRefObject<google.maps.Marker | null>,
  map: google.maps.Map | null
) => {
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const handleCreateOption = useCallback((option: CreateOption) => {
    setShowCreateMenu(false);
    
    switch (option) {
      case 'import':
        // Handle import functionality
        break;
        
      case 'field':
        console.log("'Draw New Field' option selected");
        // Disable editing and hide all markers for previous fields
        fieldPolygons.forEach(polygon => {
          // Disable dragging and editing for the polygon
          polygon.setDraggable(false);
          polygon.setEditable(false);
          
          // Hide all vertex markers
          const vertexMarkers = polygon.get('vertexMarkers') || [];
          vertexMarkers.forEach((marker: google.maps.Marker) => {
            marker.setMap(null);
          });
          
          // Hide all edge markers
          const edgeMarkers = polygon.get('edgeMarkers') || [];
          edgeMarkers.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
            marker.setMap(null);
          });
        });
        
        // Check if we're already in drawing mode with at least 3 vertices
        const isUnfinishedField = window.tempVerticesRef && 
          Array.isArray(window.tempVerticesRef) && window.tempVerticesRef.length >= 3;
        
        console.log("Checking for unfinished field", { 
          isUnfinishedField, 
          verticesLength: window.tempVerticesRef?.length || 0 
        });
        
        if (isUnfinishedField) {
          // Finish the current polygon by creating a final polygon with existing vertices
          console.log("Completing unfinished field before starting a new one");
          
          const polygon = new google.maps.Polygon({
            map: map,
            paths: window.tempVerticesRef,
            strokeColor: '#00C853',
            strokeWeight: 2,
            fillColor: '#00C853',
            fillOpacity: 0.3,
            editable: true,
            draggable: true
          });
          
          // Clean up any existing polyline and markers
          if (window.tempPolylineRef) {
            window.tempPolylineRef.setMap(null);
            window.tempPolylineRef = null;
          }
          
          // Remove temporary markers
          if (window.tempMarkersRef) {
            window.tempMarkersRef.forEach((marker: google.maps.Marker) => marker.setMap(null));
            window.tempMarkersRef = [];
          }
          
          if (window.tempEdgeMarkersRef) {
            window.tempEdgeMarkersRef.forEach((marker: google.maps.Marker | google.maps.OverlayView) => {
              if (marker) {
                marker.setMap(null);
              }
            });
            window.tempEdgeMarkersRef = [];
          }
          
          // Call polygon complete
          onPolygonComplete(polygon);
          
          // Wait before starting new field to ensure proper cleanup
          setTimeout(() => {
            // Make sure everything is cleaned up
            if (activeVertexMarkerRef.current) {
              const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
              if (prevDragMarker) {
                prevDragMarker.setMap(null);
              }
              activeVertexMarkerRef.current = null;
            }
            
            // Reset drawing mode to trigger a fresh start
            setIsDrawingMode(false);
            setTimeout(() => setIsDrawingMode(true), 100);
          }, 200);
        } else {
          // Make sure previous drawing state is cleaned up completely
          if (activeVertexMarkerRef.current) {
            // Find and remove any previous drag marker
            const prevDragMarker = activeVertexMarkerRef.current.get('dragMarker');
            if (prevDragMarker) {
              prevDragMarker.setMap(null);
            }
            activeVertexMarkerRef.current = null;
          }
          
          // Enable drawing mode
          setIsDrawingMode(true);
        }
        break;
        
      case 'distance':
        // Handle distance measurement
        break;
        
      case 'marker':
        // Handle marker placement
        break;
    }
  }, [map, setIsDrawingMode, onPolygonComplete, fieldPolygons, activeVertexMarkerRef]);

  return {
    showCreateMenu,
    setShowCreateMenu,
    handleCreateOption
  };
};

export default useCreateMenu; 