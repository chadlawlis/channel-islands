/* global $, d3, mapboxgl, MapboxDraw, ss, turf */

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

  var layersToggle, // Define globally so can be accessed on data load when creating layer switchers
    layersImage, // Define globally so can be accessed on data load when creating layer switchers
    layersMenu, // Define globally so can be instantiated on data load when creating layer switchers
    baseLayersMenu, // Define globally so can be instantiated on data load when creating layer switchers
    overlayLayersMenu, // Define globally so can be instantiated on data load when creating layer switchers
    mapLayers,
    firstLabelLayer,
    data,
    types,
    bboxFeatures,
    bbox;

  var user = 'clawlis';
  var sql = 'select cartodb_id, name, type, island, status, note, verified, icon, the_geom from clawlis.chis_poi where type = \'campground\' or type = \'restroom\' or type = \'drinking-water\' or type = \'viewpoint\' order by type, name';

  mapboxgl.accessToken = 'pk.eyJ1IjoiY2hhZGxhd2xpcyIsImEiOiJlaERjUmxzIn0.P6X84vnEfttg0TZ7RihW1g';

  var map = new mapboxgl.Map({
    container: 'map',
    hash: true,
    style: 'mapbox://styles/mapbox/outdoors-v10',
    customAttribution: '<a href="https://chadlawlis.com">&#169; Chad Lawlis</a>'
  });

  // [[sw],[ne]]
  var zoomToBounds = [[-120.47, 33.88], [-119.34, 34.09]]; // TODO: update
  var zoomToOptions = {
    linear: true,
    padding: 40
  };
  map.fitBounds(zoomToBounds, zoomToOptions);

  // Declare baseLayers for map style switcher
  // See baseLayers.forEach() in map.onLoad() for menu creation
  var baseLayers = [{
    label: 'Outdoors',
    id: 'outdoors-v11'
  }, {
    label: 'Satellite',
    id: 'satellite-streets-v11'
  }];

  // Create popup, but don't add it to the map yet
  var popup = new mapboxgl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  // Create draw control, but don't add it to the map yet
  // (must be added on map load)
  var draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {
      point: true,
      trash: true
    },
    userProperties: true
  });

  // Trigger mapData() on map style load (ensures data persists when map style changed)
  map.on('style.load', function () {
    mapLayers = map.getStyle().layers;

    // Find the index of the settlement-label layer in the loaded map style, to place counties layer below
    for (let i = 0; i < mapLayers.length; i++) {
      if (mapLayers[i].id === 'settlement-label') {
        firstLabelLayer = mapLayers[i].id;
        break;
      }
    }

    if (data) {
      mapData(data);
    }
  });

  map.on('load', function () {
  // Set minZoom as floor of (rounded down to nearest integer from) fitBounds zoom
    var minZoom = map.getZoom();
    map.setMinZoom(Math.floor(minZoom));

    // Add zoom and rotation controls
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

    // Add geolocate control
    // https://docs.mapbox.com/mapbox-gl-js/api/#geolocatecontrol
    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true
    }));

    // Add draw control to the map
    map.addControl(draw);

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
    layersToggle = document.getElementById('layers-toggle'); // Create "layers-toggle" parent div
    layersToggle.className = 'layers-toggle map-overlay';

    layersImage = document.createElement('div'); // Create "layers-image" div with Leaflet layers icon; default display
    layersImage.className = 'layers-image';
    var layersImageAnchor = document.createElement('a');
    layersImage.appendChild(layersImageAnchor);
    layersToggle.appendChild(layersImage);

    // Defined globally above so can be instantiated on data load
    layersMenu = document.createElement('div'); // Create "layers-menu" div; displays on mouseover
    layersMenu.className = 'layers-menu';

    // Defined globally above so can be instantiated on data load
    // see addOverlayLayersMenu()
    overlayLayersMenu = document.createElement('div');
    overlayLayersMenu.id = 'overlay-layers';
    overlayLayersMenu.className = 'form-menu';

    // Defined globally above so can be instantiated on data load
    // see addBaseLayersMenu()
    baseLayersMenu = document.createElement('div');
    baseLayersMenu.id = 'base-layers';
    baseLayersMenu.className = 'form-menu';

    loadData();
  });

  map.on('draw.create', function () {
    // console.log(map.getStyle().layers);

    var data = draw.getAll();
    var item = data.features.length - 1;
    var feature = data.features[item];
    console.log(feature);

    draw.setFeatureProperty(feature.id, 'type', 'restroom');

    // console.log('mapbox-gl-draw-hot:', map.getSource('mapbox-gl-draw-hot'));
    // console.log('mapbox-gl-draw-cold:', map.getSource('mapbox-gl-draw-cold'));
  });

  map.on('click', function (e) {
    if (draw.getFeatureIdsAt(e.point).length > 0) {
      // console.log(draw.getFeatureIdsAt(e.point));

      var featureId = draw.getFeatureIdsAt(e.point)[0];
      console.log(draw.get(featureId));
    }
  });

  function loadData () {
    $.ajax('https://' + user + '.carto.com/api/v2/sql?format=GeoJSON&q=' + sql, {
      beforeSend: function () {
        spinner.spin(target);
      },
      complete: function () {
        spinner.stop();
      },
      dataType: 'json',
      success: function (response) {
        data = response;

        console.log(data);

        // Populate overlayLayersMenu if it has not been yet (i.e., on page landing)
        if (!overlayLayersMenu.hasChildNodes()) {
          addOverlayLayersMenu();
        }

        mapData();
      },
      error: function () {
        spinner.stop();
      },
      statusCode: {
        400: function () {
          window.alert('Error (400): Bad request.');
        },
        404: function () {
          window.alert('Error (404): The requested resource could not be found.');
        },
        500: function () {
          window.alert('Error (500): Internal server error.');
        }
      }
    });
  }

  function addOverlayLayersMenu () {
    types = [];
    data.features.forEach(function (f) {
      let props = f.properties;

      // If feature type hasn't been added to types array yet, add it to layer switcher
      if (types.indexOf(props.type) === -1) {
        types.push(props.type);
        var layerDiv = document.createElement('div');
        layerDiv.className = 'toggle';
        var layerInput = document.createElement('input');
        layerInput.type = 'checkbox';
        layerInput.id = props.type;
        layerInput.checked = true;
        var layerLabel = document.createElement('label');

        if (props.type === 'drinking-water') {
          layerLabel.textContent = 'Drinking Water';
        } else {
          // Create layer label from type: "restroom" -> "Restrooms"
          layerLabel.textContent = props.type.charAt(0).toUpperCase() + props.type.slice(1) + 's';
        }

        layerDiv.appendChild(layerInput);
        layerDiv.appendChild(layerLabel);
        overlayLayersMenu.appendChild(layerDiv);

        layerInput.addEventListener('change', function (e) {
          map.setLayoutProperty(props.type, 'visibility', e.target.checked ? 'visible' : 'none');
        });
      }
    });

    console.log('types on addOverlayLayersMenu:', types);

    layersMenu.appendChild(overlayLayersMenu);

    addBaseLayersMenu();
  }

  function addBaseLayersMenu () {
    baseLayers.forEach(function (l) { // Instantiate layersMenu with an input for each baseLayer declared at top of script
      var layerDiv = document.createElement('div'); // Store each input in a div for vertical list display
      layerDiv.id = l.label.toLowerCase() + '-input';
      layerDiv.className = 'toggle';
      var layerInput = document.createElement('input');
      layerInput.id = l.id;
      layerInput.type = 'radio';
      layerInput.name = 'base-layer';
      layerInput.value = l.label.toLowerCase();
      if (l.label === 'Outdoors') { // Set Light style to checked by default (given loaded on landing); TODO: update as needed
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
      // Only set style if different than current style
      if (map.getStyle().metadata['mapbox:origin'] !== layerId) {
        map.setStyle('mapbox://styles/mapbox/' + layerId);
        // setStyle also triggers map.on('style.load') above, which includes a renewed call to mapData()
      }
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
  }

  function mapData () {
    console.log('data on mapData():', data);

    // data.features.forEach(function (f) {
    //   let props = f.properties;
    //
    //   if (map.getLayer(props.type)) {
    //     map.removeLayer(props.type);
    //   }
    // });

    types.forEach(function (t) {
      if (map.getLayer(t)) {
        map.removeLayer(t);
      }
    });

    if (map.getSource('data')) {
      map.removeSource('data');
    }

    // Reverse types order so that features render in same order as overlay layer switcher order:
    // campground, drinking-water, restroom, viewpoint
    // (otherwise, they render in reverse of original order: viewpoint, restroom, drinking-water, campground)
    types = types.reverse();

    types.forEach(function (t) {
      if (!map.getSource('data')) {
        map.addSource('data', {
          type: 'geojson',
          data: data
        });
      }
      if (!map.getLayer(t)) {
        map.addLayer({
          id: t,
          type: 'symbol',
          source: 'data',
          layout: {
            'icon-image': '{icon}',
            'icon-allow-overlap': true,
            'text-field': '{name}',
            // 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 10,
            // 'text-transform': 'uppercase',
            'text-letter-spacing': 0.05
            // 'text-offset': [0, 1.5]
          },
          paint: {
            'text-color': '#333',
            'text-halo-color': '#fff',
            'text-halo-width': 2
          },
          'filter': ['==', 'type', t]
        }); // }, firstLabelLayer);
      }
    });

    // data.features.forEach(function (f) {
    //   let props = f.properties;
    //
    //   if (!map.getSource('data')) {
    //     map.addSource('data', {
    //       type: 'geojson',
    //       data: data
    //     });
    //   }
    //
    //   if (!map.getLayer(props.type)) {
    //     map.addLayer({
    //       id: props.type,
    //       type: 'symbol',
    //       source: 'data',
    //       layout: {
    //         'icon-image': props.icon,
    //         'icon-allow-overlap': true,
    //         'text-field': '{name}',
    //         // 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
    //         'text-size': 12,
    //         // 'text-transform': 'uppercase',
    //         'text-letter-spacing': 0.05
    //         // 'text-offset': [0, 1.5]
    //       },
    //       paint: {
    //         'text-color': '#333',
    //         'text-halo-color': '#fff',
    //         'text-halo-width': 2
    //       },
    //       'filter': ['==', 'type', props.type]
    //     }); // }, firstLabelLayer);
    //   }
    //
    //   // // Add popup for each layer
    //   // // Change cursor to pointer on parcel layer mouseover
    //   // map.on('mousemove', 'counties', function (e) {
    //   //   map.getCanvas().style.cursor = 'pointer';
    //   //
    //   //   var popupContent;
    //   //   var props = e.features[0].properties;
    //   //
    //   //   popupContent = '<div><div class="popup-menu"><p><b>' + props.name + '</b></p>' +
    //   //   '<p style="margin-top: 2px">' + props.state_name + '</p></div>' +
    //   //   '<hr>' +
    //   //   '<div class="popup-menu"><p><b>Hard Freeze Date</b></p>' +
    //   //   '<p class="small" style="margin-top: 2px">' + fLayer.substring(0, 1) + ' of past 10 years</p><p>';
    //   //
    //   //   if (props[fDate] !== 'null') {
    //   //     popupContent += props[fDate] + '</p>';
    //   //   } else {
    //   //     popupContent += 'N/A</p>';
    //   //   }
    //   //
    //   //   popupContent += '<p><b>Latest Silking Date</b></p><p>';
    //   //
    //   //   if (props[sDate] !== 'null') {
    //   //     popupContent += props[sDate] + '</p></div></div>';
    //   //   } else {
    //   //     popupContent += 'N/A</p></div></div>';
    //   //   }
    //   //
    //   //   popup.setLngLat(e.lngLat)
    //   //     .setHTML(popupContent)
    //   //     .addTo(map);
    //   // });
    //   //
    //   // // Change cursor back to default ("grab") on parcel layer mouseleave
    //   // map.on('mouseleave', 'counties', function () {
    //   //   map.getCanvas().style.cursor = '';
    //   //   popup.remove();
    //   // });
    // });
  }
})();
