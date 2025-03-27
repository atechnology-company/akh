// Basic Leaflet type definitions
declare namespace L {
  class Map {
    constructor(id: string | HTMLElement, options?: MapOptions);
    setView(center: LatLngExpression, zoom: number): this;
    setZoom(zoom: number): this;
    removeLayer(layer: Layer): this;
    eachLayer(fn: (layer: Layer) => void, context?: any): this;
  }

  interface MapOptions {
    center?: LatLngExpression;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    layers?: Layer[];
    maxBounds?: LatLngBoundsExpression;
    renderer?: Renderer;
    zoomControl?: boolean;
    attributionControl?: boolean;
  }

  class Layer {
    addTo(map: Map): this;
    remove(): this;
    removeFrom(map: Map): this;
    getPane(name?: string): HTMLElement | undefined;
  }

  class Marker extends Layer {
    constructor(latlng: LatLngExpression, options?: MarkerOptions);
    setLatLng(latlng: LatLngExpression): this;
    getLatLng(): LatLng;
    setIcon(icon: Icon): this;
    setZIndexOffset(offset: number): this;
    setOpacity(opacity: number): this;
    bindPopup(content: string | HTMLElement | Function | Popup): this;
    openPopup(): this;
  }

  class CircleMarker extends Path {
    constructor(latlng: LatLngExpression, options?: CircleMarkerOptions);
    setLatLng(latlng: LatLngExpression): this;
    getLatLng(): LatLng;
    setRadius(radius: number): this;
    getRadius(): number;
    bindPopup(content: string | HTMLElement | Function | Popup): this;
    openPopup(): this;
  }

  interface CircleMarkerOptions extends PathOptions {
    radius?: number;
  }

  class Polyline extends Path {
    constructor(latlngs: LatLngExpression[] | LatLngExpression[][], options?: PolylineOptions);
    setLatLngs(latlngs: LatLngExpression[] | LatLngExpression[][]): this;
    getLatLngs(): LatLng[] | LatLng[][];
    addLatLng(latlng: LatLngExpression): this;
  }

  class Path extends Layer {
    setStyle(style: PathOptions): this;
    redraw(): this;
    setLatLngs(latlngs: LatLngExpression[]): this;
    getLatLngs(): LatLng[];
  }

  interface PathOptions {
    stroke?: boolean;
    color?: string;
    weight?: number;
    opacity?: number;
    fill?: boolean;
    fillColor?: string;
    fillOpacity?: number;
    dashArray?: string | number[];
    dashOffset?: string;
    fillRule?: 'nonzero' | 'evenodd';
    lineCap?: 'butt' | 'round' | 'square';
    lineJoin?: 'miter' | 'round' | 'bevel';
    interactive?: boolean;
  }

  class Popup extends Layer {
    constructor(options?: PopupOptions, source?: Layer);
    setLatLng(latlng: LatLngExpression): this;
    setContent(content: string | HTMLElement): this;
    openOn(map: Map): this;
  }

  interface PopupOptions {
    maxWidth?: number;
    minWidth?: number;
    maxHeight?: number;
    keepInView?: boolean;
    closeButton?: boolean;
    offset?: Point;
    autoPan?: boolean;
    autoPanPaddingTopLeft?: Point;
    autoPanPaddingBottomRight?: Point;
    autoPanPadding?: Point;
    closeOnClick?: boolean;
    autoClose?: boolean;
    className?: string;
  }

  class Icon {
    constructor(options: IconOptions);
  }

  interface IconOptions {
    iconUrl?: string;
    iconRetinaUrl?: string;
    iconSize?: Point;
    iconAnchor?: Point;
    popupAnchor?: Point;
    shadowUrl?: string;
    shadowRetinaUrl?: string;
    shadowSize?: Point;
    shadowAnchor?: Point;
    className?: string;
  }

  class LatLng {
    constructor(lat: number, lng: number, alt?: number);
    equals(otherLatLng: LatLng, maxMargin?: number): boolean;
    toString(): string;
    distanceTo(otherLatLng: LatLng): number;
    lat: number;
    lng: number;
    alt?: number;
  }

  class LatLngBounds {
    constructor(southWest: LatLngExpression, northEast: LatLngExpression);
    constructor(latlngs: LatLngExpression[]);
    extend(latlng: LatLngExpression | LatLngBounds): this;
    getSouthWest(): LatLng;
    getNorthEast(): LatLng;
    getNorthWest(): LatLng;
    getSouthEast(): LatLng;
    getWest(): number;
    getSouth(): number;
    getEast(): number;
    getNorth(): number;
    getCenter(): LatLng;
    contains(latlng: LatLngExpression | LatLngBounds): boolean;
    intersects(bounds: LatLngBounds): boolean;
    equals(bounds: LatLngBounds): boolean;
    isValid(): boolean;
    pad(bufferRatio: number): LatLngBounds;
  }

  class Point {
    constructor(x: number, y: number, round?: boolean);
    x: number;
    y: number;
  }

  class Control {
    constructor(options?: ControlOptions);
    getPosition(): string;
    setPosition(position: string): this;
    getContainer(): HTMLElement | undefined;
    addTo(map: Map): this;
    remove(): this;
  }

  interface ControlOptions {
    position?: string;
  }

  interface MarkerOptions {
    icon?: Icon;
    clickable?: boolean;
    draggable?: boolean;
    keyboard?: boolean;
    title?: string;
    alt?: string;
    opacity?: number;
    riseOnHover?: boolean;
    riseOffset?: number;
    zIndexOffset?: number;
  }

  interface TileLayerOptions {
    minZoom?: number;
    maxZoom?: number;
    maxNativeZoom?: number;
    minNativeZoom?: number;
    subdomains?: string | string[];
    errorTileUrl?: string;
    zoomOffset?: number;
    tms?: boolean;
    zoomReverse?: boolean;
    detectRetina?: boolean;
    crossOrigin?: boolean | string;
    tileSize?: number;
    opacity?: number;
    updateWhenIdle?: boolean;
    updateWhenZooming?: boolean;
    updateInterval?: number;
    attribution?: string;
  }

  interface PolylineOptions extends PathOptions {
    smoothFactor?: number;
    noClip?: boolean;
  }

  class TileLayer extends Layer {
    constructor(urlTemplate: string, options?: TileLayerOptions);
    setUrl(url: string, noRedraw?: boolean): this;
    setOpacity(opacity: number): this;
    setZIndex(zIndex: number): this;
    setParams(params: any, noRedraw?: boolean): this;
    bringToFront(): this;
    bringToBack(): this;
  }

  class Renderer extends Layer {
    constructor(options?: RendererOptions);
  }

  interface RendererOptions {
    padding?: number;
    tolerance?: number;
  }

  function map(element: string | HTMLElement, options?: MapOptions): Map;
  function marker(latlng: LatLngExpression, options?: MarkerOptions): Marker;
  function circleMarker(latlng: LatLngExpression, options?: CircleMarkerOptions): CircleMarker;
  function polyline(latlngs: LatLngExpression[] | LatLngExpression[][], options?: PolylineOptions): Polyline;
  function popup(options?: PopupOptions, source?: Layer): Popup;
  function tileLayer(urlTemplate: string, options?: TileLayerOptions): TileLayer;
  
  type LatLngExpression = LatLng | [number, number] | { lat: number; lng: number } | { lat: number; lon: number };
  type LatLngBoundsExpression = LatLngBounds | LatLngExpression[] | LatLngBounds[];
}

// Extend window with Leaflet
interface Window {
  L: typeof L;
} 