// Map constants
export const libraries: ("places" | "drawing" | "geometry")[] = ["places", "drawing", "geometry"];

export const polygonColor = '#00C853'; // Bright green color
export const polygonFillOpacity = 0.3;
export const strokeColor = '#00C853';
export const strokeWeight = 2;

// SVG path for location marker
export const LOCATION_MARKER_PATH = "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z";

export const mapStyles = {
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

export const defaultCenter = {
  lat: 27.342860470286933, 
  lng: 75.79046143662488,
};

export const MARKER_ROTATION = 180; // Rotation in degrees

export type MapType = 'hybrid' | 'satellite' | 'roadmap' | 'terrain'; 