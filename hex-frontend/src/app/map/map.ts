import { Component, AfterViewInit, inject, PLATFORM_ID, NgZone, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class Map implements AfterViewInit {

  private platformId = inject(PLATFORM_ID);

  map: any;

  selectedField = '';
  selectedStat  = '';

  rawData:     any[] = [];
  groupedData: any[] = [];

  minMaxData: any = null;

  isBrowser = false;

  lastClickedHex: string | null = null;
  lastIsGrouped   = false;

  // ─── Path state ───────────────────────────────────────────────────────────
  pathModeActive  = false;
  pathHexId1      = '';   // ← hex_id of first selected hex
  pathHexId2      = '';   // ← hex_id of second selected hex
  pathStatus      = '';
  pathDistance: number | null = null;
  pathSteps:    number | null = null;
  pathHex1      = '';     // returned from API (start_hex)
  pathHex2      = '';     // returned from API (end_hex)

  private currentResolution: number | null = null;
  private readonly BASE = 'http://127.0.0.1:8000/api/hexagons';

  constructor(
    private http:  HttpClient,
    private ngZone: NgZone,
    private cdr:   ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  async ngAfterViewInit() {
    if (!this.isBrowser) return;

    const mapboxgl = await import('maplibre-gl');

    this.map = new mapboxgl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [75.7873, 26.9124],
      zoom: 20,
    });

    this.map.on('load', () => this.loadHexagons(null));

    this.map.on('zoomend', () => {
      const zoom = this.map.getZoom();

      let targetRes: number | null = null;
      if (zoom < 17) targetRes = 12;
      if (zoom < 15) targetRes = 11;

      if (targetRes !== this.currentResolution) {
        this.currentResolution = targetRes;
        this.lastIsGrouped     = targetRes !== null;
        this.loadHexagons(targetRes);
      }
    });
  }

  // ─── Normal hex click handlers ────────────────────────────────────────────

  private handleHexClick(hexId: string, isGrouped: boolean) {
    this.lastClickedHex = hexId;
    this.lastIsGrouped  = isGrouped;
    this.showStats(hexId, isGrouped);
    this.cdr.detectChanges();
  }

  private smallClickHandler = (e: any) => {
    const hexId = e.features?.[0]?.properties?.hex_id;
    if (!hexId) return;
    this.ngZone.run(() => this.handleHexClick(hexId, false));
  };

  private bigClickHandler = (e: any) => {
    const hexId = e.features?.[0]?.properties?.hex_id;
    if (!hexId) return;
    this.ngZone.run(() => this.handleHexClick(hexId, true));
  };

  private attachClickEvents() {
    this.map.off('click', 'hex-fill-small', this.smallClickHandler);
    this.map.off('click', 'hex-fill-big',   this.bigClickHandler);

    if (this.map.getLayer('hex-fill-small'))
      this.map.on('click', 'hex-fill-small', this.smallClickHandler);

    if (this.map.getLayer('hex-fill-big'))
      this.map.on('click', 'hex-fill-big', this.bigClickHandler);
  }

  // ─── Layer visibility ─────────────────────────────────────────────────────

  private syncLayerVisibility() {
    const showBig   = this.currentResolution !== null;
    const showSmall = !showBig;

    ['hex-fill-small', 'hex-border-small'].forEach(layer => {
      if (this.map.getLayer(layer))
        this.map.setLayoutProperty(layer, 'visibility', showSmall ? 'visible' : 'none');
    });

    ['hex-fill-big', 'hex-border-big'].forEach(layer => {
      if (this.map.getLayer(layer))
        this.map.setLayoutProperty(layer, 'visibility', showBig ? 'visible' : 'none');
    });
  }

  // ─── Data loading ─────────────────────────────────────────────────────────

  loadHexagons(resolution: number | null) {
    const params: string[] = [];
    if (resolution !== null) params.push(`resolution=${resolution}`);
    if (resolution !== null && this.selectedStat) params.push(`stat=${this.selectedStat}`);

    const url = params.length
      ? `${this.BASE}/?${params.join('&')}`
      : `${this.BASE}/`;

    this.http.get<any[]>(url).subscribe(async (data) => {

      if (resolution === null) {
        this.rawData = data;
      } else {
        this.groupedData = data;
      }

      await this.drawLayer(data, resolution !== null);

      if (this.lastClickedHex) {
        const dataset     = this.lastIsGrouped ? this.groupedData : this.rawData;
        const stillExists = dataset.some(
          (h: any) => String(h.hex_id) === String(this.lastClickedHex)
        );
        stillExists
          ? this.showStats(this.lastClickedHex, this.lastIsGrouped)
          : (this.lastClickedHex = null, this.minMaxData = null);
      } else {
        this.minMaxData = null;
      }

      this.applyColors();
      this.cdr.detectChanges();
    });
  }

  // ─── Draw layer ───────────────────────────────────────────────────────────

  async drawLayer(data: any[], isGrouped: boolean) {
    const { cellToBoundary } = await import('h3-js');
    if (!data?.length) return;

    const geojson = {
      type: 'FeatureCollection',
      features: data.map(item => {
        const boundary = cellToBoundary(item.hex_id);
        const coords   = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
        coords.push(coords[0]);
        return {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: { ...item }
        };
      })
    };

    const sourceId = isGrouped ? 'hexagons-big'   : 'hexagons-small';
    const fillId   = isGrouped ? 'hex-fill-big'   : 'hex-fill-small';
    const borderId = isGrouped ? 'hex-border-big' : 'hex-border-small';

    this.map.off('click', 'hex-fill-small', this.smallClickHandler);
    this.map.off('click', 'hex-fill-big',   this.bigClickHandler);

    if (this.map.getLayer(fillId))    this.map.removeLayer(fillId);
    if (this.map.getLayer(borderId))  this.map.removeLayer(borderId);
    if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);

    this.map.addSource(sourceId, { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: fillId, type: 'fill', source: sourceId,
      paint: { 'fill-color': '#cccccc', 'fill-opacity': 0.8 }
    });

    this.map.addLayer({
      id: borderId, type: 'line', source: sourceId,
      paint: { 'line-color': '#000', 'line-width': isGrouped ? 2 : 0.5 }
    });

    this.applyColors();

    // If path mode is active, re-attach map click not hex click
    if (this.pathModeActive) {
      this.map.on('click', this.mapClickHandler);
    } else {
      this.attachClickEvents();
    }

    this.syncLayerVisibility();
  }

  // ─── Coloring ─────────────────────────────────────────────────────────────

  applyColors() {
    const field = this.selectedField;
    if (!field) return;

    const stops = this.getColorStops(field);
    if (!stops.length) return;

    const expr: any[] = ['interpolate', ['linear'], ['get', field]];
    stops.forEach(([val, color]) => expr.push(val, color));

    ['hex-fill-small', 'hex-fill-big'].forEach(layer => {
      if (this.map.getLayer(layer))
        this.map.setPaintProperty(layer, 'fill-color', expr);
    });
  }

  getColorStops(field: string): [number, string][] {
    if (field === 'price')  return [[1000,'#2DC4B2'],[4000,'#3BB3C3'],[7000,'#669EC4'],[10000,'#A2719B']];
    if (field === 'rating') return [[1,'#00ff00'],[5,'#ffff00'],[10,'#ff0000']];
    if (field === 'value')  return [[500,'#2c7bb6'],[2500,'#abd9e9'],[5000,'#d7191c']];
    if (field === 'height') return [[1,'#ffeda0'],[3,'#feb24c'],[5,'#f03b20']];
    return [];
  }

  // ─── Statics panel ──────────────────────────────────────────────────────────

  showStats(hexId: string, isGrouped: boolean) {
    if (!hexId || !this.selectedField) { this.minMaxData = null; return; }

    const dataset = isGrouped ? this.groupedData : this.rawData;
    const item    = dataset.find((h: any) => String(h.hex_id) === String(hexId));

    if (!item) { this.minMaxData = null; return; }

    this.minMaxData = {
      hex_id: item.hex_id,
      value:  item[this.selectedField]
    };
  }

  // ─── UI callbacks ─────────────────────────────────────────────────────────

  onStatChange() {
    if (this.currentResolution !== null) {
      this.loadHexagons(this.currentResolution);
    } else if (this.lastClickedHex) {
      this.showStats(this.lastClickedHex, this.lastIsGrouped);
    }
  }

  onFieldChange() {
    this.applyColors();
    this.lastClickedHex
      ? this.showStats(this.lastClickedHex, this.lastIsGrouped)
      : (this.minMaxData = null);
  }

  updateLayer() {
    this.applyColors();
    if (this.lastClickedHex) this.showStats(this.lastClickedHex, this.lastIsGrouped);
  }

  // ─── PATH MODE ────────────────────────────────────────────────────────────

  private mapClickHandler = (e: any) => {
    if (!this.pathModeActive) return;

    const layers = ['hex-fill-small', 'hex-fill-big'];
    let hexId: string | null = null;

    for (const layer of layers) {
      if (!this.map.getLayer(layer)) continue;
      const visibility = this.map.getLayoutProperty(layer, 'visibility');
      if (visibility === 'none') continue;

      const features = this.map.queryRenderedFeatures(e.point, { layers: [layer] });
      if (features?.length) {
        hexId = features[0].properties?.['hex_id'] ?? null;
        break;
      }
    }

    if (!hexId) {
      this.ngZone.run(() => {
        this.pathStatus = 'click on any hex';
        this.cdr.detectChanges();
      });
      return;
    }

    const capturedHexId = hexId;
    const capturedLng   = e.lngLat.lng;
    const capturedLat   = e.lngLat.lat;
    this.ngZone.run(() => this.handlePathMapClick(capturedHexId, capturedLng, capturedLat));
  };

  togglePathMode() {
    this.pathModeActive = !this.pathModeActive;
    this.pathHexId1   = '';
    this.pathHexId2   = '';
    this.pathHex1     = '';
    this.pathHex2     = '';
    this.pathDistance = null;
    this.pathSteps    = null;
    this.pathStatus   = this.pathModeActive ? '📍 Click on first hex' : '';

    if (this.pathModeActive) {
      // Disable normal hex clicks
      this.map.off('click', 'hex-fill-small', this.smallClickHandler);
      this.map.off('click', 'hex-fill-big',   this.bigClickHandler);
      // Enable map-level click for path
      this.map.on('click', this.mapClickHandler);
      this.map.getCanvas().style.cursor = 'crosshair';
    } else {
      this.map.off('click', this.mapClickHandler);
      this.map.getCanvas().style.cursor = '';
      this.attachClickEvents();
      this.clearPathLayer();
    }
    this.cdr.detectChanges();
  }

  // hexId = jo hex click hua, lng/lat = marker ke liye
  private handlePathMapClick(hexId: string, lng: number, lat: number) {

    if (!this.pathHexId1) {
      // ── First hex ──
      this.pathHexId1 = hexId;
      this.pathStatus = `📍 First hex selected, Click on second hex`;
      this.drawMarker('marker1', lng, lat, '#0f0e0e');

    } else if (!this.pathHexId2) {
      // ── Second hex ──
      this.pathHexId2 = hexId;
      this.pathStatus = '⏳ Path is being fetched...';
      this.drawMarker('marker2', lng, lat, '#3b2511');
      this.fetchAndDrawPath();

    } else {
      // ── Reset — naya path shuru karo ──
      this.clearPathLayer();
      this.pathHexId1   = hexId;
      this.pathHexId2   = '';
      this.pathHex1     = '';
      this.pathHex2     = '';
      this.pathDistance = null;
      this.pathSteps    = null;
      this.pathStatus   = `✅ Reset — 📍 Click on second hex`;
      this.drawMarker('marker1', lng, lat, '#0c0c0c');
    }

    this.cdr.detectChanges();
  }

  private fetchAndDrawPath() {
    // Guard — dono set hone chahiye
    if (!this.pathHexId1 || !this.pathHexId2) {
      this.pathStatus = 'Hex IDs missing';
      return;
    }

    const url = `http://127.0.0.1:8000/api/path/?start=${this.pathHexId1}&end=${this.pathHexId2}`;
    console.log('Path URL:', url);

    this.http.get<any>(url).subscribe({
      next: async (res) => {
        console.log('Path response:', res);
        this.pathDistance = res.grid_distance;
        this.pathSteps    = res.steps;
        this.pathHex1     = res.start_hex;
        this.pathHex2     = res.end_hex;
        this.pathStatus   = `✅ ${res.grid_distance} hops — ${res.steps + 1} cells`;
        await this.drawPathLayer(res.path);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Path error:', err);
        this.pathStatus =  (err.error?.error ?? 'Unknown error');
        this.cdr.detectChanges();
      }
    });
  }

  private async drawPathLayer(hexIds: string[]) {
    const { cellToBoundary } = await import('h3-js');

    this.clearPathLayer();

    const features = hexIds.map((hexId, i) => {
      const boundary = cellToBoundary(hexId);
      const coords   = boundary.map(([lat, lng]: [number, number]) => [lng, lat]);
      coords.push(coords[0]);
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: { hex_id: hexId, index: i, total: hexIds.length - 1 }
      };
    });

    const geojson: any = { type: 'FeatureCollection', features };

    this.map.addSource('path-source', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'path-fill',
      type: 'fill',
      source: 'path-source',
      paint: {
        'fill-color': '#090808',
        'fill-opacity': 0.7
      }
    });

    this.map.addLayer({
      id: 'path-border',
      type: 'line',
      source: 'path-source',
      paint: {
        'line-color': '#cc0000',
        'line-width': 2
      }
    });
  }

  private drawMarker(id: string, lng: number, lat: number, color: string) {
    const existing = document.getElementById(`path-marker-${id}`);
    if (existing) existing.remove();

    import('maplibre-gl').then(mapboxgl => {
      const el = document.createElement('div');
      el.id    = `path-marker-${id}`;
      el.style.cssText = `
        width:18px; height:18px; border-radius:50%;
        background:${color}; border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
        cursor:pointer;
      `;
      new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(this.map);
    });
  }

  private clearPathLayer() {
    ['path-fill', 'path-border'].forEach(l => {
      if (this.map.getLayer(l)) this.map.removeLayer(l);
    });
    if (this.map.getSource('path-source')) this.map.removeSource('path-source');

    ['marker1', 'marker2'].forEach(id => {
      const el = document.getElementById(`path-marker-${id}`);
      if (el) el.remove();
    });
  }
}