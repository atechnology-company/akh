declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: Element | null, opts?: MapOptions);
      setCenter(latLng: LatLng | LatLngLiteral): void;
      setZoom(zoom: number): void;
      setOptions(options: MapOptions): void;
    }

    class Marker {
      constructor(opts?: MarkerOptions);
      setMap(map: Map | null): void;
      setPosition(latLng: LatLng | LatLngLiteral): void;
      setTitle(title: string): void;
    }

    class Polyline {
      constructor(opts?: PolylineOptions);
      setMap(map: Map | null): void;
      getPath(): MVCArray<LatLng>;
      setPath(path: MVCArray<LatLng> | LatLng[] | LatLngLiteral[]): void;
    }

    class LatLng {
      constructor(lat: number, lng: number, noWrap?: boolean);
      lat(): number;
      lng(): number;
      toString(): string;
      toUrlValue(precision?: number): string;
    }

    class MVCArray<T> {
      constructor(array?: T[]);
      clear(): void;
      getArray(): T[];
      getAt(i: number): T;
      getLength(): number;
      insertAt(i: number, elem: T): void;
      removeAt(i: number): T;
      setAt(i: number, elem: T): void;
    }

    class SymbolPath {
      static CIRCLE: number;
      static FORWARD_CLOSED_ARROW: number;
      static FORWARD_OPEN_ARROW: number;
      static BACKWARD_CLOSED_ARROW: number;
      static BACKWARD_OPEN_ARROW: number;
    }

    interface MapOptions {
      center?: LatLng | LatLngLiteral;
      zoom?: number;
      mapTypeId?: string;
      disableDefaultUI?: boolean;
      zoomControl?: boolean;
      styles?: MapTypeStyle[];
    }

    interface MarkerOptions {
      position?: LatLng | LatLngLiteral;
      map?: Map;
      title?: string;
      icon?: string | Icon | Symbol;
    }

    interface PolylineOptions {
      path?: MVCArray<LatLng> | LatLng[] | LatLngLiteral[];
      geodesic?: boolean;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
    }

    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    interface Icon {
      url?: string;
      size?: Size;
      origin?: Point;
      anchor?: Point;
      scaledSize?: Size;
    }

    interface Symbol {
      path?: string | number;
      scale?: number;
      fillColor?: string;
      fillOpacity?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
    }

    interface MapTypeStyle {
      featureType?: string;
      elementType?: string;
      stylers?: Array<{[key: string]: any}>;
    }

    interface Styler {
      [key: string]: string | number | boolean | undefined;
    }

    class Size {
      constructor(width: number, height: number, widthUnit?: string, heightUnit?: string);
      width: number;
      height: number;
      equals(other: Size): boolean;
      toString(): string;
    }

    class Point {
      constructor(x: number, y: number);
      x: number;
      y: number;
      equals(other: Point): boolean;
      toString(): string;
    }

    enum MapTypeId {
      ROADMAP = "roadmap",
      SATELLITE = "satellite",
      HYBRID = "hybrid",
      TERRAIN = "terrain"
    }

    // Add marker namespace with AdvancedMarkerElement
    namespace marker {
      class AdvancedMarkerElement {
        constructor(opts?: AdvancedMarkerElementOptions);
        position: LatLng | LatLngLiteral;
        map: Map | null;
        title: string;
        content: Node;
      }
      
      interface AdvancedMarkerElementOptions {
        position?: LatLng | LatLngLiteral;
        map?: Map;
        title?: string;
        content?: Node;
      }
    }
  }
}

// Extend window with google.maps
interface Window {
  google: typeof google;
  DeviceOrientationEvent: DeviceOrientationEvent;
}

// Device orientation event
interface DeviceOrientationEvent extends Event {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
} 