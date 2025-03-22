'use client';

import React from 'react';

// Instead of directly defining the class, export a factory function that creates it
const createDistanceOverlayClass = () => {
  // Only create the class if google maps API is available
  if (typeof google === 'undefined' || !google.maps) {
    return null;
  }

  return class DistanceOverlay extends google.maps.OverlayView {
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
      
      div.innerHTML = `
        <div style="
          background: rgba(0, 0, 0, 0.7);
          color: white;
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
              color: white;
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
  };
};

export default createDistanceOverlayClass; 