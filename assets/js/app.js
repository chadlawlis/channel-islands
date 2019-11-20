/* global fetch, mapboxgl, MapboxDraw */

import { Spinner } from './spin.js';

(() => {
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
    form,
    latInput,
    lonInput,
    typeSelect,
    typeIconSpan,
    nameLabel,
    nameInput,
    statusLabel,
    statusInputOpen,
    statusInputClosed,
    noteLabel,
    noteTextArea,
    verifiedLabel,
    verifiedInput,
    feature, // latest drawn feature
    mapLayers,
    data,
    submitButton,
    resetButton;

  var types = []; // array of poi type strings for map layers
  var poiLayers = []; // array of objects for map layer id and visibility
  // var features = []; // array of all drawn features

  var user = 'clawlis';
  // CARTO GET sql: includes created_at and updated_at in EST as strings, including leading zero for single-digit days
  var getSQL = 'select cartodb_id, name, type, island, status, note, verified, icon, text_offset, ' +
  'extract(year from created_at at time zone \'est\')::text || \'-\' || extract(month from created_at at time zone \'est\')::text || \'-\' || to_char(extract(day from created_at at time zone \'est\')::integer, \'fm00\') as created_at, ' +
  'extract(year from updated_at at time zone \'est\')::text || \'-\' || extract(month from updated_at at time zone \'est\')::text || \'-\' || to_char(extract(day from updated_at at time zone \'est\')::integer, \'fm00\') as updated_at, ' +
  'the_geom from clawlis.chis_poi order by type, name';
  var postSQL;
  var key = '1HNloqkcuddZcO5qOStx7w';

  // [[sw],[ne]]
  var zoomToBounds = [[-120.47, 33.88], [-119.34, 34.09]];
  var zoomToOptions = {
    linear: true,
    padding: 40
  };

  var maxBounds = [[-121, 32.88], [-118.34, 35.09]];

  mapboxgl.accessToken = 'pk.eyJ1IjoiY2hhZGxhd2xpcyIsImEiOiJlaERjUmxzIn0.P6X84vnEfttg0TZ7RihW1g';

  var map = new mapboxgl.Map({
    container: 'map',
    customAttribution: '<a href="https://chadlawlis.com">&#169; Chad Lawlis</a>',
    hash: true,
    maxBounds: maxBounds,
    maxZoom: 20,
    style: 'mapbox://styles/chadlawlis/ck33csain03ur1cn6m2i3fkrp'
  });

  map.fitBounds(zoomToBounds, zoomToOptions);

  // Declare baseLayers for map style switcher
  // See baseLayers.forEach() in map.onLoad() for menu creation
  var baseLayers = [{
    label: 'Outdoors',
    // Modified copy of mapbox outdoors-v11
    // w/ campsite, drinking-water, toilet, viewpoint maki icons/labels removed
    id: 'ck33csain03ur1cn6m2i3fkrp'
  }, {
    label: 'Satellite',
    // Modified copy of mapbox satellite-streets-v11
    // w/ campsite, drinking-water, toilet, viewpoint maki icons/labels removed
    id: 'ck33doci91n1t1cqktmahtemc'
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
  map.on('style.load', () => {
    mapLayers = map.getStyle().layers;
    // console.log('mapLayers on style.load:', mapLayers);

    if (data) {
      mapData(data);
    }
  });

  map.on('load', () => {
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
    map.addControl(draw, 'top-left');

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
    zoomButton.title = 'Zoom to park extent';
    zoomButton.addEventListener('click', () => {
      map.fitBounds(zoomToBounds, zoomToOptions);
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

    form = document.getElementById('draw-form');
    form.className = 'bottom-left draw-form form-menu map-overlay';

    getData();
  });

  map.on('draw.create', e => {
    // console.log('mapbox-gl-draw-hot:', map.getSource('mapbox-gl-draw-hot'));
    // console.log('mapbox-gl-draw-cold:', map.getSource('mapbox-gl-draw-cold'));
    // console.log(map.getSource('mapbox-gl-draw-cold')._data);

    form.style.display = 'block';

    console.log('draw.create:', e);

    // Feature drawn
    feature = e.features[0];
    console.log('feature drawn on draw.create:', feature);

    // All drawn features
    // features = draw.getAll();
    // console.log('all drawn features on draw.create:', features);

    lonInput.value = parseFloat(feature.geometry.coordinates[0].toFixed(6));
    latInput.value = parseFloat(feature.geometry.coordinates[1].toFixed(6));

    resetForm();
  });

  map.on('draw.update', e => {
    console.log('draw.update', e);

    feature = draw.getSelected().features[0];

    if (e.action === 'move') {
      lonInput.value = parseFloat(feature.geometry.coordinates[0].toFixed(6));
      latInput.value = parseFloat(feature.geometry.coordinates[1].toFixed(6));
    }
  });

  map.on('draw.delete', e => {
    console.log('draw.delete', e);

    form.style.display = 'none';
    lonInput.value = '';
    latInput.value = '';
    resetForm();
  });

  map.on('draw.selectionchange', e => {
    console.log('draw.selectionchange:', e);
    console.log('draw.getSelected()', draw.getSelected());

    // If selection changed to another point
    if (e.features.length > 0) {
      if (form.style.display === 'none') {
        form.style.display = 'block';
      }

      // feature = e.features[0];
      feature = draw.getSelected().features[0];
      var props = feature.properties;

      // Populate form
      lonInput.value = parseFloat(feature.geometry.coordinates[0].toFixed(6));
      latInput.value = parseFloat(feature.geometry.coordinates[1].toFixed(6));

      if (props.type) {
        resetButton.disabled = false;

        typeSelect.value = props.type;
        setTypeIconSpan();

        if (nameInput.disabled) {
          nameLabel.className = statusLabel.className = noteLabel.className = 'form-label';
          nameInput.disabled = statusInputOpen.disabled = statusInputClosed.disabled = noteTextArea.disabled = verifiedInput.disabled = false;
        }

        if (props.name) {
          nameInput.value = props.name;
        } else {
          nameInput.value = '';
        }

        if (props.status === 'Open') {
          statusInputOpen.checked = true;
        } else {
          statusInputClosed.checked = true;
        }

        if (props.note) {
          noteTextArea.value = props.note;
        } else {
          noteTextArea.value = '';
        }

        verifiedInput.checked = props.verified;
      } else {
        resetForm();
      }
    } else {
      // Otherwise, if no point selected (clicked away from point)
      form.style.display = 'none';
    }
  });

  // map.on('click', e => {
  //   console.log('click:', e);
  //
  //   if (draw.getFeatureIdsAt(e.point).length > 0) {
  //     // console.log(draw.getFeatureIdsAt(e.point));
  //
  //     var featureId = draw.getFeatureIdsAt(e.point)[0];
  //     feature = draw.get(featureId);
  //     console.log('feature on click:', feature);
  //
  //     idInput.value = feature.id;
  //     lonInput.value = parseFloat(feature.geometry.coordinates[0].toFixed(6));
  //     latInput.value = parseFloat(feature.geometry.coordinates[1].toFixed(6));
  //   }
  // });

  function setTypeIconSpan () {
    var val = typeSelect.value;

    if (val === 'campground') {
      typeIconSpan.style.backgroundImage = 'url(assets/img/maki/campsite-15.svg)';
    } else if (val === 'drinking-water') {
      typeIconSpan.style.backgroundImage = 'url(assets/img/maki/drinking-water-15.svg)';
    } else if (val === 'restroom') {
      typeIconSpan.style.backgroundImage = 'url(assets/img/maki/toilet-15.svg)';
    } else if (val === 'viewpoint') {
      typeIconSpan.style.backgroundImage = 'url(assets/img/maki/viewpoint-15.svg)';
    } else {
      typeIconSpan.style.backgroundImage = '';
    }
  }

  function resetForm () {
    typeSelect.value = '';
    nameInput.value = '';
    statusInputOpen.checked = true;
    noteTextArea.value = '';
    verifiedInput.checked = false;

    nameLabel.className = statusLabel.className = noteLabel.className = 'form-label-disabled';
    nameInput.disabled = statusInputOpen.disabled = statusInputClosed.disabled = noteTextArea.disabled = verifiedInput.disabled = true;
    typeIconSpan.style.backgroundImage = '';

    resetButton.disabled = true;
    typeSelect.focus();
  }

  function getData () {
    fetch('https://' + user + '.carto.com/api/v2/sql?format=GeoJSON&q=' + getSQL)
      .then(res => res.json())
      .then(getData => {
        data = getData;
        console.log('data on getData():', data);

        // Populate overlayLayersMenu if it has not been yet (i.e., on page landing)
        if (!overlayLayersMenu.hasChildNodes()) {
          addOverlayLayersMenu();
        }

        // Populate form if it has not been yet (i.e., on page landing)
        if (!form.hasChildNodes()) {
          buildForm();
        }

        mapData();
        spinner.stop();
      }).catch(err => {
        spinner.stop();
        window.alert('Error:', err);
      });
  }

  function postData () {
    fetch('https://' + user + '.carto.com/api/v2/sql?q=' + postSQL + '&api_key=' + key, {
      method: 'POST'
    });
  }

  function addOverlayLayersMenu () {
    data.features.forEach(f => {
      var props = f.properties;

      // If feature type hasn't been added to types array yet, add it to layer switcher
      if (types.indexOf(props.type) === -1) {
        types.push(props.type);

        // Add object for each layer with id and visibility
        var layer = {
          id: props.type,
          visibility: 'visible'
        };

        poiLayers.push(layer);
      }
    });

    poiLayers.forEach(l => {
      var layerDiv = document.createElement('div');
      layerDiv.className = 'toggle';
      var layerInput = document.createElement('input');
      layerInput.type = 'checkbox';
      layerInput.id = l.id;
      layerInput.checked = true;
      var layerLabel = document.createElement('label');

      if (l.id === 'drinking-water') {
        layerLabel.textContent = 'Drinking Water';
      } else {
        // Create layer label from type (e.g., "restroom" -> "Restrooms")
        layerLabel.textContent = l.id.charAt(0).toUpperCase() + l.id.slice(1) + 's';
      }

      layerDiv.appendChild(layerInput);
      layerDiv.appendChild(layerLabel);
      overlayLayersMenu.appendChild(layerDiv);

      layerInput.addEventListener('change', e => {
        map.setLayoutProperty(l.id, 'visibility', e.target.checked ? 'visible' : 'none');
        l.visibility = map.getLayoutProperty(l.id, 'visibility');
      });
    });

    // console.log('types on addOverlayLayersMenu:', types);
    // console.log('poiLayers on addOverlayLayersMenu:', poiLayers);

    layersMenu.appendChild(overlayLayersMenu);

    // Sort poiLayers by id in descending order before they are added to map
    // so that layers render in same order as overlay layer switcher order:
    //   campground, drinking-water, restroom, viewpoint
    // Otherwise they render in reverse, with layers added last rendered first:
    //   viewpoint, restroom, drinking-water, campground
    // (moved here, out from mapData(), given only needed once)
    poiLayers.sort((a, b) => {
      // https://stackoverflow.com/a/35092754
      return b.id.localeCompare(a.id);
    });

    // console.log('poiLayers after sort:', poiLayers);

    addBaseLayersMenu();
  }

  function addBaseLayersMenu () {
    baseLayers.forEach(l => { // Instantiate layersMenu with an input for each baseLayer declared at top of script
      var layerDiv = document.createElement('div'); // Store each input in a div for vertical list display
      layerDiv.id = l.label.toLowerCase() + '-input';
      layerDiv.className = 'toggle';
      var layerInput = document.createElement('input');
      layerInput.id = l.id;
      layerInput.type = 'radio';
      layerInput.name = 'base-layer';
      layerInput.value = l.label.toLowerCase();
      if (l.label === 'Outdoors') { // Set Outdoor style to checked by default (given loaded on landing)
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
        map.setStyle('mapbox://styles/chadlawlis/' + layerId);
        // setStyle also triggers map.on('style.load') above, which includes a renewed call to mapData()
      }
    }

    for (let i = 0; i < baseLayerInputs.length; i++) {
      baseLayerInputs[i].onclick = switchBaseLayer;
    }

    layersToggle.addEventListener('mouseover', e => {
      layersMenu.style.display = 'block'; // Display layer switcher menu on hover ..
      layersImage.style.display = 'none'; // ... replacing layers icon
    });

    layersToggle.addEventListener('mouseout', e => {
      layersImage.style.display = 'block'; // Return to default display of layers icon on mouseout ...
      layersMenu.style.display = 'none'; // ... hiding layer switcher menu
    });
  }

  function buildForm () {
    // Latitude number input
    var latInputDiv = document.createElement('div');
    latInputDiv.className = 'form-input lat';
    var latLabel = document.createElement('label');
    latLabel.className = 'form-label-disabled';
    latLabel.htmlFor = 'lat';
    latLabel.textContent = 'Latitude';
    latInputDiv.appendChild(latLabel);
    latInput = document.createElement('input');
    latInput.id = 'lat-input';
    latInput.type = 'number';
    latInput.name = 'lat';
    latInput.required = true;
    latInput.disabled = true;
    latInputDiv.appendChild(latInput);

    form.appendChild(latInputDiv);

    // Longitude number input
    var lonInputDiv = document.createElement('div');
    lonInputDiv.className = 'form-input lon';
    var lonLabel = document.createElement('label');
    lonLabel.className = 'form-label-disabled';
    lonLabel.htmlFor = 'lon';
    lonLabel.textContent = 'Longitude';
    lonInputDiv.appendChild(lonLabel);
    lonInput = document.createElement('input');
    lonInput.id = 'lon-input';
    lonInput.type = 'number';
    lonInput.name = 'lon';
    lonInput.required = true;
    lonInput.disabled = true;
    lonInputDiv.appendChild(lonInput);

    form.appendChild(lonInputDiv);

    // Type select
    var typeSelectDiv = document.createElement('div');
    // Clear both floating elements that precede it (lat + lon)
    // https://developer.mozilla.org/en-US/docs/Web/CSS/clear
    typeSelectDiv.className = 'clear-both form-input v-middle';
    var typeLabel = document.createElement('label');
    typeLabel.id = 'type-label';
    typeLabel.className = 'form-label';
    typeLabel.htmlFor = 'type';
    typeLabel.textContent = 'Type';
    typeSelectDiv.appendChild(typeLabel);
    typeSelect = document.createElement('select');
    typeSelect.id = 'type-select';
    typeSelect.name = 'type';
    typeSelect.required = true;

    var typeSelectDefaultOption = document.createElement('option');
    typeSelectDefaultOption.value = '';
    typeSelectDefaultOption.textContent = '-- Select type --';
    typeSelect.appendChild(typeSelectDefaultOption);

    types.forEach(t => {
      var option = document.createElement('option');
      option.value = t;

      if (t === 'drinking-water') {
        option.textContent = 'Drinking Water';
      } else {
        option.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      }

      typeSelect.appendChild(option);
    });

    typeIconSpan = document.createElement('span');
    typeIconSpan.id = 'type-icon-span';
    typeIconSpan.className = 'type-icon-span v-middle';

    typeSelect.addEventListener('change', e => {
      var val = e.target.value;

      if (val !== '') {
        draw.setFeatureProperty(feature.id, 'type', val);
        console.log('feature on typeSelect change:', feature);

        nameLabel.className = statusLabel.className = noteLabel.className = 'form-label';
        nameInput.disabled = statusInputOpen.disabled = statusInputClosed.disabled = noteTextArea.disabled = verifiedInput.disabled = false;

        nameInput.focus();

        // Set feature status
        // 'Open' set by default, so can't handle this exclusively on status input change/input event listeners
        if (statusInputOpen.checked) {
          draw.setFeatureProperty(feature.id, 'status', statusInputOpen.value);
        } else {
          draw.setFeatureProperty(feature.id, 'status', statusInputClosed.value);
        }

        // Set feature verified
        // false set by default, so can't handle this exclusively on verified input change/input event listeners
        draw.setFeatureProperty(feature.id, 'verified', verifiedInput.checked);

        resetButton.disabled = false;
      } else {
        nameLabel.className = statusLabel.className = noteLabel.className = 'form-label-disabled';
        nameInput.disabled = statusInputOpen.disabled = statusInputClosed.disabled = noteTextArea.disabled = verifiedInput.disabled = true;
      }

      setTypeIconSpan();
    });

    typeSelectDiv.appendChild(typeSelect);
    typeSelectDiv.appendChild(typeIconSpan);
    form.appendChild(typeSelectDiv);

    // Name text input
    var nameInputDiv = document.createElement('div');
    nameInputDiv.className = 'form-input';
    nameLabel = document.createElement('label');
    nameLabel.id = 'name-label';
    nameLabel.className = 'form-label-disabled';
    nameLabel.htmlFor = 'name';
    nameLabel.textContent = 'Name';
    nameInputDiv.appendChild(nameLabel);
    nameInput = document.createElement('input');
    nameInput.id = 'name-input';
    nameInput.type = 'text';
    nameInput.name = 'name';
    nameInput.size = 26;
    nameInput.required = true;
    nameInput.disabled = true;
    nameInput.addEventListener('input', e => {
      var val = e.target.value;

      if (e.target.validity.valid) {
        // Set feature name on valid input (i.e., name !== '')
        draw.setFeatureProperty(feature.id, 'name', val);

        console.log('feature on nameInput input:', feature);

        submitButton.disabled = false;
      } else {
        submitButton.disabled = true;
      }
    });
    nameInputDiv.appendChild(nameInput);

    var inputValidity = document.createElement('span');
    inputValidity.className = 'validity';
    nameInputDiv.appendChild(inputValidity);

    form.appendChild(nameInputDiv);

    // Status radio input div
    var statusDiv = document.createElement('div');
    statusDiv.className = 'form-input';
    statusLabel = document.createElement('label');
    statusLabel.id = 'status-label';
    statusLabel.className = 'form-label-disabled';
    statusLabel.htmlFor = 'status';
    statusLabel.textContent = 'Status';
    statusDiv.appendChild(statusLabel);
    var statusInputDiv = document.createElement('div');
    statusInputDiv.className = 'status';

    // Open status radio input
    statusInputOpen = document.createElement('input');
    statusInputOpen.id = 'status-input-open';
    statusInputOpen.type = 'radio';
    statusInputOpen.name = 'status';
    statusInputOpen.value = 'Open';
    statusInputOpen.checked = true;
    statusInputOpen.disabled = true;
    statusInputOpen.addEventListener('input', e => {
      var val = e.target.value;

      draw.setFeatureProperty(feature.id, 'status', val);
      console.log('feature on statusInputOpen input:', feature);
    });
    var statusInputOpenLabel = document.createElement('label');
    statusInputOpenLabel.textContent = 'Open';
    statusInputDiv.appendChild(statusInputOpen);
    statusInputDiv.appendChild(statusInputOpenLabel);

    // Closed status radio input
    statusInputClosed = document.createElement('input');
    statusInputClosed.id = 'status-input-closed';
    statusInputClosed.type = 'radio';
    statusInputClosed.name = 'status';
    statusInputClosed.value = 'Closed';
    statusInputClosed.disabled = true;

    statusInputClosed.addEventListener('input', e => {
      var val = e.target.value;

      draw.setFeatureProperty(feature.id, 'status', val);
      console.log('feature on statusInputClosed input:', feature);
    });

    var statusInputClosedLabel = document.createElement('label');
    statusInputClosedLabel.textContent = 'Closed';
    statusInputDiv.appendChild(statusInputClosed);
    statusInputDiv.appendChild(statusInputClosedLabel);

    statusDiv.appendChild(statusInputDiv);

    form.appendChild(statusDiv);

    // Note textarea
    var noteTextAreaDiv = document.createElement('div');
    noteTextAreaDiv.className = 'form-input';
    noteLabel = document.createElement('label');
    noteLabel.className = 'form-label-disabled';
    noteLabel.id = 'note-label';
    noteLabel.htmlFor = 'note';
    noteLabel.textContent = 'Note';
    noteTextAreaDiv.appendChild(noteLabel);
    noteTextArea = document.createElement('textarea');
    noteTextArea.id = 'note-text-area';
    noteTextArea.name = 'note';
    noteTextArea.placeholder = 'Include a note (optional)';
    noteTextArea.rows = 2;
    noteTextArea.cols = 24;
    noteTextArea.disabled = true;
    noteTextArea.addEventListener('input', e => {
      var val = e.target.value;

      if (val) {
        draw.setFeatureProperty(feature.id, 'note', val);
        console.log('feature on noteTextArea input:', feature);
      }
    });
    noteTextAreaDiv.appendChild(noteTextArea);

    form.appendChild(noteTextAreaDiv);

    // Verified checkbox input
    var verifiedInputDiv = document.createElement('div');
    verifiedInputDiv.className = 'form-input toggle';
    verifiedInput = document.createElement('input');
    verifiedInput.id = 'verified-input';
    verifiedInput.type = 'checkbox';
    verifiedInput.disabled = true;
    verifiedInput.addEventListener('input', e => {
      var val = e.target.checked;

      draw.setFeatureProperty(feature.id, 'verified', val);
      console.log('feature on verifiedInput input:', feature);
    });
    verifiedLabel = document.createElement('label');
    verifiedLabel.id = 'verified-label';
    verifiedLabel.htmlFor = 'verified';
    verifiedLabel.textContent = 'NPS Verified';
    verifiedInputDiv.appendChild(verifiedInput);
    verifiedInputDiv.appendChild(verifiedLabel);

    form.appendChild(verifiedInputDiv);

    var formInputButtonsDiv = document.createElement('div');
    formInputButtonsDiv.className = 'form-input-buttons';

    submitButton = document.createElement('button');
    submitButton.id = 'submit-button';
    submitButton.className = 'input-button';
    submitButton.type = 'submit';
    submitButton.disabled = true;
    submitButton.textContent = 'Submit';

    submitButton.addEventListener('click', () => {
      var lat = latInput.value;
      var lon = lonInput.value;
      var type = typeSelect.value;
      var name = nameInput.value;

      // If name includes single quote, replace it with two single quotes for CARTO SQL API
      // e.g., Chad's -> Chad''s
      // https://stackoverflow.com/a/58331941
      if (name.includes('\'')) {
        name = nameInput.value.replace(/'+/g, "''");
      }

      var status = statusInputOpen.checked ? statusInputOpen.value : statusInputClosed.value;
      var verified = verifiedInput.checked ? 'true' : 'false';

      if (noteTextArea.value) {
        var note = noteTextArea.value;

        // If note includes single quote, replace it with two single quotes for CARTO SQL API
        if (note.includes('\'')) {
          note = note.replace(/'+/g, "''");
        }

        postSQL = 'insert into clawlis.chis_poi (type, name, status, note, verified, the_geom) ' +
        'values (\'' + type + '\', \'' + name + '\', \'' + status + '\', \'' + note + '\', \'' + verified + '\', ' +
        '(select ST_SetSRID(ST_MakePoint(' + lon + ', ' + lat + '), 4326)))';
      } else {
        postSQL = 'insert into clawlis.chis_poi (type, name, status, verified, the_geom) ' +
        'values (\'' + type + '\', \'' + name + '\', \'' + status + '\', \'' + verified + '\', ' +
        '(select ST_SetSRID(ST_MakePoint(' + lon + ', ' + lat + '), 4326)))';
      }

      postData().then(getData());
    });

    resetButton = document.createElement('button');
    resetButton.id = 'reset-button';
    resetButton.className = 'input-button';
    resetButton.type = 'button';
    resetButton.disabled = true;
    resetButton.textContent = 'Reset';

    resetButton.addEventListener('click', () => {
      var props = feature.properties;

      draw.setFeatureProperty(feature.id, 'type', '');
      draw.setFeatureProperty(feature.id, 'status', '');
      draw.setFeatureProperty(feature.id, 'verified', '');

      if (props.name) {
        draw.setFeatureProperty(feature.id, 'name', '');
      }
      if (props.note) {
        draw.setFeatureProperty(feature.id, 'note', '');
      }

      console.log('feature after delete feature.properties on reset:', feature);

      resetForm();
    });

    formInputButtonsDiv.appendChild(submitButton);
    formInputButtonsDiv.appendChild(resetButton);
    form.appendChild(formInputButtonsDiv);
  }

  function mapData () {
    poiLayers.forEach(l => {
      if (map.getLayer(l.id)) {
        map.removeLayer(l.id);
      }
    });

    if (map.getSource('data')) {
      map.removeSource('data');
    }

    poiLayers.forEach(l => {
      if (!map.getSource('data')) {
        map.addSource('data', {
          type: 'geojson',
          data: data
        });
      }

      if (!map.getLayer(l.id)) {
        map.addLayer({
          id: l.id,
          type: 'symbol',
          source: 'data',
          layout: {
            // Get 15px maki icons (e.g., "campsite-15" -> "campsite-15.svg" served by Mapbox)
            'icon-image': ['concat', ['get', 'icon'], '-15'],
            // This also works:
            // 'icon-image': '{icon}-15',
            // If "icon" property "viewpoint" then get icon "viewpoint" (which would need to be added to map)
            // Otherwise get 15px maki icon based on "icon" property value
            // 'icon-image': [
            //   'case',
            //   ['==', ['get', 'icon'], 'viewpoint'],
            //   'viewpoint',
            //   ['concat', ['get', 'icon'], '-15']
            // ],
            // 'icon-allow-overlap': true, // defaults to false
            'text-field': ['get', 'name'], // '{name}',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Regular'], // defaults to ['Open Sans Regular', 'Arial Unicode MS Regular']
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              // when zoom <= 10, text-size: 10
              10, 10,
              // when zoom >= 18, text-size: 12
              18, 12
              // in between, text-size will be linearly interpolated between 10 and 18 pixels
            ],
            // 'text-line-height': 1.4, // defaults to 1.2
            // 'text-transform': 'uppercase',
            'text-letter-spacing': 0.05,
            // 'text-offset': ['to-number', ['get', 'text_offset']], // '{text_offset}'
            // 'text-offset': [
            //   'case',
            //   ['==', ['get', 'text_offset'], 2], // if text_offset = 2
            //   ['literal', [0, 2]], // if true set text-offset property to [0, 2]
            //   ['literal', [0, 1.5]] // if false set text-offset property to [0, 1.5]
            // ],
            'text-offset': [
              'step',
              ['get', 'text_offset'],
              ['literal', [0, 1.5]], // default to [0, 1.5] -> 1.5 ems offset above anchor
              2, ['literal', [0, 2]], // when "text_offset" = 2 then [0, 2] -> 2 ems offset above anchor
              2.5, ['literal', [0, 2.5]] // when "text_offset" = 3 then [0, 2.5] -> 2.5 ems offset above anchor
            ],
            'text-max-width': 8, // defaults to 10 ems
            visibility: l.visibility
          },
          paint: {
            'text-color': '#333',
            'text-halo-color': '#fff',
            'text-halo-width': 2,
            'text-halo-blur': 0.5
          },
          filter: ['==', 'type', l.id]
        });
      }

      // Add popup for each layer

      // map.on('click', l.id, e => {
      //   var props = e.features[0].properties;
      //   console.log(props);
      // });

      map.on('mousemove', l.id, e => {
        map.getCanvas().style.cursor = 'pointer';

        var popupContent;
        var props = e.features[0].properties;

        popupContent = '<div class="popup-menu"><p><b>' + props.name + '</b></p>';
        // '<p style="small subtitle">Type: ' + props.type + '</p></div>' +

        // Mapbox stringifies null feature properties
        if (props.island !== 'null') {
          popupContent += '<p>' + props.island + '</p></div><hr>';
        } else {
          popupContent += '</div><hr>';
        }

        popupContent += '<div class="popup-menu">';

        if (props.verified) {
          popupContent += '<p><b>NPS Verified&nbsp;&#10004;</b></p>';
        } else {
          popupContent += '<p><b>NPS Verified&nbsp;&#10006;</b></p>';
        }

        popupContent += '<p><b>' + props.status + '</b></p>';

        if (props.note !== 'null') {
          popupContent += '<p>Note:</p>' +
          '<p><b>' + props.note + '</b></p>';
        }

        popupContent += '<p>Created:<p>' +
        '<p><b>' + props.created_at + '</b></p>' +
        '<p>Updated:<p>' +
        '<p><b>' + props.updated_at + '</b></p></div>';

        popup.setLngLat(e.lngLat)
          .setHTML(popupContent)
          .addTo(map);
      });

      // Change cursor back to default ("grab") on parcel layer mouseleave
      map.on('mouseleave', l.id, () => {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    });
  }
})();
