/* global d3, mapboxgl, ss, turf */

// Search "TODO" for code requring immediate changes

import { Spinner } from './spin.js';

(function () {
  var opts = {
    lines: 13, // The number of lines to draw
    length: 38, // The length of each line
    width: 17, // The line thickness
    radius: 45, // The radius of the inner circle
    scale: 0.6, // Scales overall size of the spinner
    corners: 1, // Corner roundness (0..1)
    color: '#aaa', // CSS color or array of colors
    fadeColor: 'transparent', // CSS color or array of colors
    speed: 1, // Rounds per second
    rotate: 0, // The rotation offset
    animation: 'spinner-line-fade-quick', // The CSS animation name for the lines
    direction: 1, // 1: clockwise, -1: counterclockwise
    zIndex: 2e9, // The z-index (defaults to 2000000000)
    className: 'spinner', // The CSS class to assign to the spinner
    top: '50%', // Top position relative to parent
    left: '50%', // Left position relative to parent
    shadow: '0 0 1px transparent', // Box-shadow for the lines
    position: 'absolute' // Element positioning
  };

  var target = document.getElementById('loading');
  var spinner = new Spinner(opts);

  // Animate spinner on page load
  spinner.spin(target);

  var mapLayers,
    firstBoundaryLayer,
    firstLabelLayer,
    data,
    bbox;

  mapboxgl.accessToken = 'pk.eyJ1IjoiY2hhZGxhd2xpcyIsImEiOiJlaERjUmxzIn0.P6X84vnEfttg0TZ7RihW1g';

  var map = new mapboxgl.Map({
    container: 'map',
    hash: true,
    style: 'mapbox://styles/mapbox/light-v10',
    customAttribution: '<a href="https://chadlawlis.com">Chad Lawlis</a>'
  });

  // [[sw],[ne]]
  // var usBounds = [[-131.50, 22.10], [-62.50, 52.66]];
  var zoomToBounds = [[-131.50, 22.10], [-62.50, 52.66]]; // TODO: update
  var zoomToOptions = {
    linear: true,
    padding: {
      top: 60,
      right: 80,
      bottom: 80,
      left: 80
    }
  };
  map.fitBounds(zoomToBounds, zoomToOptions);

  // Declare baseLayers for map style switcher
  // See baseLayers.forEach() in map.onLoad() for menu creation
  var baseLayers = [{
    label: 'Light',
    id: 'light-v10'
  }, {
    label: 'Dark',
    id: 'dark-v10'
  }, {
    label: 'Satellite',
    id: 'satellite-streets-v11'
  }];

  // TODO: update
  var overlayLayers = [{
    id: 'data',
    label: 'Data',
    source: {},
    sourceName: 'data',
    visibility: 'visible',
    type: 'fill'
  }];

  // Create popup, but don't add it to the map yet
  var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  // Trigger mapData() on map style load (ensures data persists when map style changed)
  map.on('style.load', function () {
    if (data) {
      mapData(data);
    }
  });

  map.on('load', function () {
  // Set minZoom as floor of (rounded down to nearest integer from) fitBounds zoom
    var minZoom = map.getZoom();
    map.setMinZoom(Math.floor(minZoom));

    mapLayers = map.getStyle().layers;

    // TODO: choose between setting firstLabelLayer or firstBoundaryLayer (below), depending on need

    // Find the index of the settlement-label layer in the loaded map style, to place added layers below
    for (let i = 0; i < mapLayers.length; i++) {
      if (mapLayers[i].id === 'settlement-label') {
        firstLabelLayer = mapLayers[i].id;
        break;
      }
    }

    // Find the index of the first admin/boundary layer in the loaded map style, to place counties layers below
    for (let i = 0; i < mapLayers.length; i++) {
      if (mapLayers[i]['source-layer'] === 'admin') {
        firstBoundaryLayer = mapLayers[i].id;
        break;
      }
    }

    // Add zoom and rotation controls
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

    // Create custom "zoom to" control and implement as ES6 class
    // https://docs.mapbox.com/mapbox-gl-js/api/#icontrol
    class ZoomToControl {
      onAdd (map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.id = 'zoom-to-control';
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group zoom-to-control';
        this._container.appendChild(document.createElement('button'));
        return this._container;
      }

      onRemove () {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }

    // Add custom "zoom to" control to map
    var zoomToControl = new ZoomToControl();
    map.addControl(zoomToControl);

    // Customize "zoom to" control to display custom icon and fitBounds functionality
    // using same usBounds bounding box from page landing extent above
    var zoomControl = document.getElementById('zoom-to-control');
    var zoomButton = zoomControl.firstElementChild;
    zoomButton.id = 'zoom-to-button';
    zoomButton.title = 'Zoom to ...'; // TODO: add appropriate title for zoomToControl
    zoomButton.addEventListener('click', function () {
      map.fitBounds(zoomToBounds, zoomToOptions);
    });

    // Create custom "zoom to bbox" control and implement as ES6 class
    // https://docs.mapbox.com/mapbox-gl-js/api/#icontrol
    class ZoomBboxControl {
      onAdd (map) {
        this._map = map;
        this._container = document.createElement('div');
        this._container.id = 'bbox-control';
        this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group bbox-control';
        this._container.appendChild(document.createElement('button'));
        return this._container;
      }

      onRemove () {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
      }
    }

    // Add custom "zoom to bbox" control to map
    var zoomBboxControl = new ZoomBboxControl();
    map.addControl(zoomBboxControl);

    // Customize "zoom to bbox" control to display custom icon and fitBounds functionality
    var bboxControl = document.getElementById('bbox-control');
    var bboxButton = bboxControl.firstElementChild;
    bboxButton.id = 'bbox';
    bboxButton.title = 'Zoom to feature extent';
    bboxButton.addEventListener('click', function () {
      map.fitBounds(bbox, zoomToOptions);
    });

    // Create map style switcher structure
    var layersToggle = document.getElementById('layers-toggle'); // Create "layers-toggle" parent div
    layersToggle.className = 'layers-toggle map-overlay';

    var layersImage = document.createElement('div'); // Create "layers-image" div with Leaflet layers icon; default display
    layersImage.className = 'layers-image';
    var layersImageAnchor = document.createElement('a');
    layersImage.appendChild(layersImageAnchor);
    layersToggle.appendChild(layersImage);

    var layersMenu = document.createElement('div'); // Create "layers-menu" div; displays on mouseover
    layersMenu.className = 'layers-menu';

    var overlayLayersMenu = document.createElement('div');
    overlayLayersMenu.className = 'form-menu';

    overlayLayers.forEach(function (l) {
      var layerDiv = document.createElement('div');
      layerDiv.className = 'toggle';
      var layerInput = document.createElement('input');
      layerInput.type = 'checkbox';
      layerInput.id = l.id;
      layerInput.checked = true;
      var layerLabel = document.createElement('label');
      layerLabel.textContent = l.label;
      layerDiv.appendChild(layerInput);
      layerDiv.appendChild(layerLabel);
      overlayLayersMenu.appendChild(layerDiv);

      layerInput.addEventListener('change', function (e) {
        map.setLayoutProperty(l.id, 'visibility', e.target.checked ? 'visible' : 'none');
        l.visibility = map.getLayoutProperty(l.id, 'visibility');

        // TODO: maintain only if needed for fill layer with separate line layer
        if (l.type === 'fill') {
          map.setLayoutProperty(l.id + '-line', 'visibility', e.target.checked ? 'visible' : 'none');
        }
      });
    });

    layersMenu.appendChild(overlayLayersMenu);

    var baseLayersMenu = document.createElement('div');
    baseLayersMenu.className = 'form-menu';

    baseLayers.forEach(function (l) { // Instantiate layersMenu with an input for each baseLayer declared at top of script
      var layerDiv = document.createElement('div'); // Store each input in a div for vertical list display
      layerDiv.id = l.label.toLowerCase() + '-input';
      layerDiv.className = 'toggle';
      var layerInput = document.createElement('input');
      layerInput.id = l.id;
      layerInput.type = 'radio';
      layerInput.name = 'base-layer';
      layerInput.value = l.label.toLowerCase();
      if (l.label === 'Light') { // Set Light style to checked by default (given loaded on landing); TODO: update as needed
        layerInput.checked = true;
      }
      layerDiv.appendChild(layerInput);

      var layerLabel = document.createElement('label');
      layerLabel.for = l.label.toLowerCase();
      layerLabel.textContent = l.label;
      layerDiv.appendChild(layerLabel);

      baseLayersMenu.appendChild(layerDiv);
    });

    layersMenu.appendChild(baseLayersMenu);
    layersToggle.appendChild(layersMenu);

    // Add map style switcher functionality
    var baseLayerInputs = baseLayersMenu.getElementsByTagName('input');

    function switchBaseLayer (layer) {
      var layerId = layer.target.id;
      map.setStyle('mapbox://styles/mapbox/' + layerId); // TODO: update if using styles other than mapbox
      // setStyle also triggers map.on('style.load') above, which includes a renewed call to mapData()
    }

    for (let i = 0; i < baseLayerInputs.length; i++) {
      baseLayerInputs[i].onclick = switchBaseLayer;
    }

    layersToggle.addEventListener('mouseover', function (e) {
      layersMenu.style.display = 'block'; // Display layer switcher menu on hover ..
      layersImage.style.display = 'none'; // ... replacing layers icon
    });

    layersToggle.addEventListener('mouseout', function (e) {
      layersImage.style.display = 'block'; // Return to default display of layers icon on mouseout ...
      layersMenu.style.display = 'none'; // ... hiding layer switcher menu
    });

    // Stop spinner once all page load functions have been called
    spinner.stop();
  });
})();
