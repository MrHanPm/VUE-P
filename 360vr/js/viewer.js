var initFov = 166; // 初始视角
var isAnim = true; // 初始动画
var PhotoSphereViewer = function(args) {
	var isCanvasSupported = function() {
		var canvas = document.createElement('canvas');
		return !!(canvas.getContext && canvas.getContext('2d'));
	};
	/**
	 * Detects whether WebGL is supported.
	 * @private
	 * @return {boolean} `true` if WebGL is supported, `false` otherwise
	 **/

	var isWebGLSupported = function() {
		var canvas = document.createElement('canvas');
		return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
	};
	

	/**
	 * Attaches an event handler function to an element.
	 * @private
	 * @param {HTMLElement} elt - The element
	 * @param {string} evt - The event name
	 * @param {function} f - The handler function
	 * @return {void}
	 **/
	var addEvent = function(elt, evt, f) {
		if (!!elt.addEventListener)
			elt.addEventListener(evt, f, false);
		else
			elt.attachEvent('on' + evt, f);
	};
	/**
	 * 确保某个数字处于给定的区间内.
	 * @private
	 * @param {number} x - The number to check
	 * @param {number} min - First endpoint
	 * @param {number} max - Second endpoint
	 * @return {number} The checked number
	 **/
	var stayBetween = function(x, min, max) {
		return Math.max(min, Math.min(max, x));
	};
	/**
	 * 计算距离.
	 * @private
	 * @param {number} x1 - First point horizontal coordinate
	 * @param {number} y1 - First point vertical coordinate
	 * @param {number} x2 - Second point horizontal coordinate
	 * @param {number} y2 - Second point vertical coordinate
	 * @return {number} Square of the wanted distance
	 **/
	var dist = function(x1, y1, x2, y2) {
		var x = x2 - x1;
		var y = y2 - y1;
		return x*x + y*y;
	};

	/**
	 * Returns the measure of an angle (between 0 and 2π).
	 * @private
	 * @param {number} angle - The angle to reduce
	 * @return {number} The wanted measure
	 **/
	var getAngleMeasure = function(angle) {
		return angle - Math.floor(angle / (2.0 * Math.PI)) * 2.0 * Math.PI;
	};

	/**
	 * Starts to load the panorama.
	 * @public
	 * @return {void}
	 **/

	this.load = function() {
		// Loading indicator (text or image if given)
		if (!!loading_img) {
			var loading = document.createElement('img');
			loading.setAttribute('src', loading_img);
			loading.setAttribute('alt', loading_msg);
			container.appendChild(loading);
		}
		else
			container.style.textAlign = 'center';
			container.style.lineHeight = '30px';
			container.textContent = loading_msg;

		// Adds a new container
		root = document.createElement('div');
		root.style.width = '100%';
		root.style.height = '100%';
		root.style.position = 'relative';
		root.style.overflow = 'hidden';

		// Is canvas supported?
		if (!isCanvasSupported()) {
			container.textContent = 'Canvas is not supported, update your browser!';
			return;
		}

		// Is Three.js loaded?
		if (window.THREE === undefined) {
			console.log('PhotoSphereViewer: Three.js is not loaded.');
			return;
		}
		// Current viewer size
		viewer_size = {
			width: 0,
			height: 0,
			ratio: 0
		};
		// XMP data?
		if (readxmp)
			loadXMP();

		else
			createBuffer(false);
	};

	/**
	 * 返回全景元数据中给定属性的值.
	 * @private
	 * @param {string} data - The panorama metadata
	 * @param {string} attr - The wanted attribute
	 * @return {string} The value of the attribute
	 **/

	var getAttribute = function(data, attr) {
		var a = data.indexOf('GPano:' + attr) + attr.length + 8, b = data.indexOf('"', a);
		return data.substring(a, b);
	};

	/**
	 * Loads the XMP data with AJAX.
	 * @private
	 * @return {void}
	 **/

	var loadXMP = function() {
		var xhr = null;

		if (window.XMLHttpRequest)
			xhr = new XMLHttpRequest();

		else if (window.ActiveXObject) {
			try {
				xhr = new ActiveXObject('Msxml2.XMLHTTP');
			}
			catch (e) {
				xhr = new ActiveXObject('Microsoft.XMLHTTP');
			}
		}

		else {
			container.textContent = 'XHR is not supported, update your browser!';
			return;
		}

		xhr.onreadystatechange = function() {
				if (xhr.readyState == 4 && xhr.status == 200) {
					// Metadata
					var binary = xhr.responseText;
					var a = binary.indexOf('<x:xmpmeta'), b = binary.indexOf('</x:xmpmeta>');
					var data = binary.substring(a, b);

					// No data retrieved
					if (a == -1 || b == -1 || data.indexOf('GPano:') == -1) {
						createBuffer(false);
						return;
					}

					// Useful values
					var pano_data = {
							full_width: parseInt(getAttribute(data, 'FullPanoWidthPixels')),
							full_height: parseInt(getAttribute(data, 'FullPanoHeightPixels')),
							cropped_width: parseInt(getAttribute(data, 'CroppedAreaImageWidthPixels')),
							cropped_height: parseInt(getAttribute(data, 'CroppedAreaImageHeightPixels')),
							cropped_x: parseInt(getAttribute(data, 'CroppedAreaLeftPixels')),
							cropped_y: parseInt(getAttribute(data, 'CroppedAreaTopPixels')),
						};

					createBuffer(pano_data);
				}
			};

		xhr.open('GET', panorama, true);
		xhr.send(null);
	};

	/**
	 * Creates an image in the right dimensions.
	 * @private
	 * @param {mixed} pano_data - An object containing the panorama XMP data (`false` if there is not)
	 * @return {void}
	 **/

	var createBuffer = function(pano_data) {
		var img = new Image();
		img.onload = function() {
				// No XMP data?
				if (!pano_data) {
					pano_data = {
						full_width: img.width,
						full_height: img.height,
						cropped_width: img.width,
						cropped_height: img.height,
						cropped_x: 0,
						cropped_y: 0,
					};
				}

				// Size limit for mobile compatibility
				var max_width = 20048;
				if (isWebGLSupported()) {
					var canvas = document.createElement('canvas');
					var ctx = canvas.getContext('webgl');
					max_width = ctx.getParameter(ctx.MAX_TEXTURE_SIZE);
				}

				// Buffer width (not too big)
				var new_width = Math.min(pano_data.full_width, max_width);
				var r = new_width / pano_data.full_width;

				pano_data.full_width = new_width;
				pano_data.cropped_width *= r;
				pano_data.cropped_x *= r;
				img.width = pano_data.cropped_width;

				// Buffer height (proportional to the width)
				pano_data.full_height *= r;
				pano_data.cropped_height *= r;
				pano_data.cropped_y *= r;
				img.height = pano_data.cropped_height;

				// Buffer creation
				var buffer = document.createElement('canvas');
				buffer.width = pano_data.full_width;
				buffer.height = pano_data.full_height;

				var ctx = buffer.getContext('2d');
				ctx.drawImage(img, pano_data.cropped_x, pano_data.cropped_y, pano_data.cropped_width, pano_data.cropped_height);
				loadTexture(buffer.toDataURL('image/jpeg'));
			};

		// CORS when the panorama is not given as a base64 string
		if (!panorama.match(/^data:image\/[a-z]+;base64/))
			img.setAttribute('crossOrigin', 'anonymous');

		img.src = panorama;
	};

	/**
	 * Loads the sphere texture.
	 * @private
	 * @param {string} path - Path to the panorama
	 * @return {void}
	 **/

	var loadTexture = function(path) {
		var texture = new THREE.Texture();
		var loader = new THREE.ImageLoader();

		var onLoad = function(img) {
			texture.needsUpdate = true;
			texture.image = img;

			createScene(texture);
		}

		loader.load(path, onLoad);
	};

	/**
	 * Creates the 3D scene.
	 * @private
	 * @param {THREE.Texture} texture - The sphere texture
	 * @return {void}
	 **/
	var createScene = function(texture) {
		// New size?
		if (new_viewer_size.width !== undefined)
			container.style.width = new_viewer_size.width.css;

		if (new_viewer_size.height !== undefined)
			container.style.height = new_viewer_size.height.css;

		fitToContainer();

		// The chosen renderer depends on whether WebGL is supported or not
		renderer = (isWebGLSupported()) ? new THREE.WebGLRenderer() : new THREE.CanvasRenderer();
		renderer.setSize(viewer_size.width*4, viewer_size.height*4);

		scene = new THREE.Scene();

		camera = new THREE.PerspectiveCamera(initFov, viewer_size.ratio, 1, 300);
		camera.position.set(0, 0, 0);
		scene.add(camera);

		// Sphere
		var geometry = new THREE.SphereGeometry(200, 32, 32);
		var material = new THREE.MeshBasicMaterial({map: texture, overdraw: true});
		var mesh = new THREE.Mesh(geometry, material);
		mesh.scale.x = -1;
		scene.add(mesh);

		// Canvas container
		canvas_container = document.createElement('div');
		canvas_container.style.position = 'absolute';
		canvas_container.style.zIndex = 0;
		root.appendChild(canvas_container);

		// Navigation bar?
		if (display_navbar) {
			navbar.setStyle(navbar_style);
			navbar.create();
			root.appendChild(navbar.getBar());
		}

		// Adding events
		addEvent(window, 'resize', fitToContainer);

		if (user_interactions_allowed) {
			addEvent(canvas_container, 'mousedown', onMouseDown);
			addEvent(document, 'mousemove', onMouseMove);
			addEvent(canvas_container, 'mousemove', showNavbar);
			addEvent(document, 'mouseup', onMouseUp);

			addEvent(canvas_container, 'touchstart', onTouchStart);
			addEvent(document, 'touchend', onMouseUp);
			addEvent(document, 'touchmove', onTouchMove);

			addEvent(canvas_container, 'mousewheel', onMouseWheel);
			addEvent(canvas_container, 'DOMMouseScroll', onMouseWheel);
		}

		addEvent(document, 'fullscreenchange', fullscreenToggled);
		addEvent(document, 'mozfullscreenchange', fullscreenToggled);
		addEvent(document, 'webkitfullscreenchange', fullscreenToggled);
		addEvent(document, 'MSFullscreenChange', fullscreenToggled);

		sphoords.addListener(onDeviceOrientation);

		// First render
		container.innerHTML = '';
		container.appendChild(root);

		var canvas = renderer.domElement;
		canvas.style.display = 'block';
		canvas.style.width = document.body.clientWidth + 'px';
		canvas.style.height = document.body.clientHeight + 'px';
		canvas_container.appendChild(canvas);
		render();

		// Zoom?
		if (zoom_lvl > 0)
			zoom(zoom_lvl);

		// 动画?
		anim();

		/**
		 * 指示加载完成：呈现第一个图像
		 * @callback PhotoSphereViewer~onReady
		 **/

		triggerAction('ready');
	};

	/**
	* Renders an image.
	* @private
	* @return {void}
	**/

	var render = function() {
		var point = new THREE.Vector3();
		point.setX(Math.cos(lat) * Math.sin(long));
		point.setY(Math.sin(lat));
		point.setZ(Math.cos(lat) * Math.cos(long));
		camera.lookAt(point);
		// Stereo?
		if (stereo_effect !== null)
			stereo_effect.render(scene, camera);

		else
			renderer.render(scene, camera);
	};

	/**
	 * Starts the stereo effect.
	 * @private
	 * @return {void}
	 **/

	var startStereo = function() {
		stereo_effect = new THREE.StereoEffect(renderer);
		stereo_effect.eyeSeparation = 5;
		stereo_effect.setSize(viewer_size.width, viewer_size.height);

		startDeviceOrientation();
		enableFullscreen();
		navbar.mustBeHidden();
		render();

		/**
		 * Indicates that the stereo effect has been toggled.
		 * @callback PhotoSphereViewer~onStereoEffectToggled
		 * @param {boolean} enabled - `true` if stereo effect is enabled, `false` otherwise
		 **/

		triggerAction('stereo-effect', true);
	};

	/**
	 * Stops the stereo effect.
	 * @private
	 * @return {void}
	 **/

	var stopStereo = function() {
		stereo_effect = null;
		renderer.setSize(viewer_size.width*4, viewer_size.height*4);

		navbar.mustBeHidden(false);
		render();

		triggerAction('stereo-effect', false);
	};

	/**
	 * Toggles the stereo effect (virtual reality).
	 * @public
	 * @return {void}
	 **/

	this.toggleStereo = function() {
		if (stereo_effect !== null)
			stopStereo();

		else
			startStereo();
	};

	/**
	* Automatically animates the panorama.
	* @private
	* @return {void}
	**/

	var anim = function() {
		if (anim_delay !== false)
			anim_timeout = setTimeout(startAutorotate, anim_delay);
	};

	/**
	* 自动旋转全景图.
	* @private
	* @return {void}
	**/

	var autorotate = function() {
		if(initFov > 90){
            initFov -= 1.6;
            // camera.fov = initFov;
            camera.projectionMatrix.makePerspective( initFov, window.innerWidth / window.innerHeight, 1, 1100 );
            // viewer_size.ratio, 1, 300
        } else {
        	isAnim = false;
			// Returns to the equator (lat = 0)
			lat -= lat / 200;

			// Rotates the sphere
			long += long_offset;
			long -= Math.floor(long / (2.0 * Math.PI)) * 2.0 * Math.PI;
		}
		render();
		autorotate_timeout = setTimeout(autorotate, PSV_ANIM_TIMEOUT);
	};

	/**
	 * Starts the autorotate animation.
	 * @private
	 * @return {void}
	 **/

	var startAutorotate = function() {
		autorotate();
		
		/**
		 * Indicates that the autorotate animation state has changed.
		 * @callback PhotoSphereViewer~onAutorotateChanged
		 * @param {boolean} enabled - `true` if animation is enabled, `false` otherwise
		 **/

		triggerAction('autorotate', true);
	};

	/**
	 * Stops the autorotate animation.
	 * @private
	 * @return {void}
	 **/

	var stopAutorotate = function() {
		if (!isAnim){
			clearTimeout(anim_timeout);
			anim_timeout = null;

			clearTimeout(autorotate_timeout);
			autorotate_timeout = null;
			
			triggerAction('autorotate', false);
		}
	};
	var AlertBox = document.getElementById('msg'),isalt_tot = null;
	var isShowAlert = function (txt) {
		clearTimeout(alt_timeout);
		alt_timeout = null;
		clearTimeout(isalt_tot);
		isalt_tot = null;
		AlertBox.innerHTML = txt || '';
		AlertBox.style.display = 'block';
		alt_timeout = setTimeout(function(){
			AlertBox.style.opacity = 1;
			isalt_tot = setTimeout(function(){
				AlertBox.style.opacity = 0;
				alt_timeout = setTimeout(function(){
					AlertBox.style.display = 'none';
				},500);
			},1000);
		},100);
	};
	/**
	 * Launches/stops the autorotate animation.
	 * @public
	 * @return {void}
	 **/

	this.toggleAutorotate = function() {
		clearTimeout(anim_timeout);

		if (!!autorotate_timeout){
			stopAutorotate();
			isShowAlert('\u81ea\u52a8\u770b\u8f66\u5df2\u5173\u95ed');
		}else{
			startAutorotate();
			isShowAlert('\u81ea\u52a8\u770b\u8f66\u5df2\u5f00\u542f');
		}
	};

	/**
	 * Resizes the canvas to make it fit the container.
	 * @private
	 * @return {void}
	 **/

	var fitToContainer = function() {
		if (container.clientWidth != viewer_size.width || container.clientHeight != viewer_size.height) {
			resize({
				width: container.clientWidth,
				height: container.clientHeight
			});
		}
	};

	/**
	 * Resizes the canvas to make it fit the container.
	 * @public
	 * @return {void}
	 **/

	this.fitToContainer = function() {
		fitToContainer();
	};

	/**
	 * Resizes the canvas.
	 * @private
	 * @param {object} size - New dimensions
	 * @param {number} [size.width] - The new canvas width (default to previous width)
	 * @param {number} [size.height] - The new canvas height (default to previous height)
	 * @return {void}
	 **/

	var resize = function(size) {
		viewer_size.width = (size.width !== undefined) ? parseInt(size.width) : viewer_size.width;
		viewer_size.height = (size.height !== undefined) ? parseInt(size.height) : viewer_size.height;
		viewer_size.ratio = viewer_size.width / viewer_size.height;

		if (!!camera) {
			camera.aspect = viewer_size.ratio;
			camera.updateProjectionMatrix();
		}

		if (!!renderer) {
			renderer.setSize(viewer_size.width*4, viewer_size.height*4);
			render();
		}

		if (!!stereo_effect) {
			stereo_effect.setSize(viewer_size.width, viewer_size.height);
			render();
		}
	};

	/**
	 * The user wants to move.
	 * @private
	 * @param {Event} evt - The event
	 * @return {void}
	 **/

	var onMouseDown = function(evt) {
		startMove(parseInt(evt.clientX), parseInt(evt.clientY));
	};

	/**
	 * The user wants to move or to zoom (mobile version).
	 * @private
	 * @param {Event} evt - The event
	 * @return {void}
	 **/

	var onTouchStart = function(evt) {
		// Move
		if (evt.touches.length == 1) {
			var touch = evt.touches[0];
			if (touch.target.parentNode == canvas_container)
				startMove(parseInt(touch.clientX), parseInt(touch.clientY));
		}

		// Zoom
		else if (evt.touches.length == 2) {
			onMouseUp();

			if (evt.touches[0].target.parentNode == canvas_container && evt.touches[1].target.parentNode == canvas_container)
				startTouchZoom(dist(evt.touches[0].clientX, evt.touches[0].clientY, evt.touches[1].clientX, evt.touches[1].clientY));
		}

		// Show navigation bar if hidden
		showNavbar();
	};

	/**
	 * Initializes the movement.
	 * @private
	 * @param {integer} x - Horizontal coordinate
	 * @param {integer} y - Vertical coordinate
	 * @return {void}
	 **/

	var startMove = function(x, y) {
		mouse_x = x;
		mouse_y = y;

		stopAutorotate();

		mousedown = true;
	};

	/**
	 * Initializes the "pinch to zoom" action.
	 * @private
	 * @param {number} d - Square of the distance between the two fingers
	 * @return {void}
	 **/

	var startTouchZoom = function(d) {
		touchzoom_dist = d;

		touchzoom = true;
	};

	/**
	 * The user wants to stop moving (or stop zooming with their finger).
	 * @private
	 * @param {Event} evt - The event
	 * @return {void}
	 **/

	var onMouseUp = function(evt) {
		mousedown = false;
		touchzoom = false;
		// if(isGos){
		// 	sphoords.start();
		// 	triggerAction('device-orientation', true);
		// }
	};

	/**
	 * The user moves the image.
	 * @private
	 * @param {Event} evt - The event
	 * @return {void}
	 **/

	var onMouseMove = function(evt) {
		evt.preventDefault();
		move(parseInt(evt.clientX), parseInt(evt.clientY));
	};

	/**
	 * The user moves the image (mobile version).
	 * @private
	 * @param {Event} evt - The event
	 * @return {void}
	 **/

	var onTouchMove = function(evt) {
		if(sphoords.isEventAttached()){
			sphoords.stop();
			// stopAutorotate();
			isGos = false;
			triggerAction('device-orientation', false);
		}
		// Move
		if (evt.touches.length == 1 && mousedown) {
			var touch = evt.touches[0];
			if (touch.target.parentNode == canvas_container) {
				evt.preventDefault();
				move(parseInt(touch.clientX), parseInt(touch.clientY));
			}
		}
		
		// Zoom
		else if (evt.touches.length == 2) {
			if (evt.touches[0].target.parentNode == canvas_container && evt.touches[1].target.parentNode == canvas_container && touchzoom) {
				evt.preventDefault();

				// Calculate the new level of zoom
				var d = dist(evt.touches[0].clientX, evt.touches[0].clientY, evt.touches[1].clientX, evt.touches[1].clientY);
				var diff = d - touchzoom_dist;

				if (diff != 0) {
					var direction = diff / Math.abs(diff);
					zoom(zoom_lvl + direction);

					touchzoom_dist = d;
				}
				// console.log(evt.touches[0].clientX, evt.touches[0].clientY, evt.touches[1].clientX, evt.touches[1].clientY);
			}
		}
	};

	/**
	 * Movement.
	 * @private
	 * @param {integer} x - Horizontal coordinate
	 * @param {integer} y - Vertical coordinate
	 * @return {void}
	 **/

	var move = function(x, y) {
		if (mousedown) {
			long = getAngleMeasure(long + (x - mouse_x) * PSV_LONG_OFFSET);
			lat += (y - mouse_y) * PSV_LAT_OFFSET;
			lat = stayBetween(lat, PSV_TILT_DOWN_MAX, PSV_TILT_UP_MAX);

			mouse_x = x;
			mouse_y = y;
			if(isGos){
				sphoords.setLog(long);
				sphoords.setLat(lat);
			}
			// console.log('lat:', lat, 'log:', long);
			// console.log(PSV_LONG_OFFSET,args.long_offset);
			render();
		}
	};

	/**
	 * Starts following the device orientation.
	 * @private
	 * @return {void}
	 **/

	var startDeviceOrientation = function() {
		sphoords.start();
		stopAutorotate();
		isGos = true;
		/**
		 * Indicates that we starts/stops following the device orientation.
		 * @callback PhotoSphereViewer~onDeviceOrientationStateChanged
		 * @param {boolean} state - `true` if device orientation is followed, `false` otherwise
		 **/

		triggerAction('device-orientation', true);
	};

	/**
	 * Stops following the device orientation.
	 * @private
	 * @return {void}
	 **/
	var isGos = false;
	var stopDeviceOrientation = function() {
		sphoords.stop();
		isGos = false;
		triggerAction('device-orientation', false);
	};

	/**
	 * Starts/stops following the device orientation.
	 * @public
	 * @return {void}
	 **/

	this.toggleDeviceOrientation = function() {
		if (sphoords.isEventAttached()){
			stopDeviceOrientation();
			// 自由看车已关闭
			isShowAlert('\u81ea\u7531\u770b\u8f66\u5df2\u5173\u95ed');
		}else{
			startDeviceOrientation();
			isShowAlert('\u81ea\u7531\u770b\u8f66\u5df2\u5f00\u542f');
		}
	};

	/**
	* The user moved their device.
	* @private
	* @param {object} coords - The spherical coordinates to look at
	* @param {number} coords.longitude - The longitude
	* @param {number} coords.latitude - The latitude
	* @return {void}
	**/

	var onDeviceOrientation = function(coords) {
		long = coords.longitude;
		lat = stayBetween(coords.latitude, PSV_TILT_DOWN_MAX, PSV_TILT_UP_MAX);
		// alert(long,lat);
		render();
	};

	/**
	 * The user wants to zoom.
	 * @private
	 * @param {Event} evt - The event
	 * @return {void}
	 **/

	var onMouseWheel = function(evt) {
		evt.preventDefault();
		evt.stopPropagation();

		var delta = (evt.detail) ? -evt.detail : evt.wheelDelta;

		if (delta != 0) {
			var direction = parseInt(delta / Math.abs(delta));
			zoom(zoom_lvl + direction);
		}
	};

	/**
	 * 设置新的缩放级别.
	 * @private
	 * @param {integer} level - New zoom level
	 * @return {void}
	 **/

	var zoom = function(level) {
		zoom_lvl = stayBetween(parseInt(Math.round(level)), 0, 100);

		camera.fov = PSV_FOV_MAX + (zoom_lvl / 100) * (PSV_FOV_MIN - PSV_FOV_MAX);
		camera.updateProjectionMatrix();
		render();

		/**
		 * Indicates that the zoom level has changed.
		 * @callback PhotoSphereViewer~onZoomUpdated
		 * @param {number} zoom_level - The new zoom level
		 **/

		triggerAction('zoom-updated', zoom_lvl);
	};

	/**
	 * Sets the new zoom level.
	 * @public
	 * @param {integer} level - New zoom level
	 * @return {void}
	 **/

	this.zoom = function(level) {
		zoom(level);
	};

	/**
	 * Zoom in.
	 * @public
	 * @return {void}
	 **/

	this.zoomIn = function() {
		if (zoom_lvl < 100)
			zoom(zoom_lvl + 1);
	};

	/**
	 * Zoom out.
	 * @public
	 * @return {void}
	 **/

	this.zoomOut = function() {
		if (zoom_lvl > 0)
			zoom(zoom_lvl - 1);
	};

	/**
	 * Detects whether fullscreen is enabled or not.
	 * @private
	 * @return {boolean} `true` if fullscreen is enabled, `false` otherwise
	 **/

	var isFullscreenEnabled = function() {
		return (!!document.fullscreenElement || !!document.mozFullScreenElement || !!document.webkitFullscreenElement || !!document.msFullscreenElement);
	};

	/**
	 * Fullscreen state has changed.
	 * @private
	 * @return {void}
	 **/

	var fullscreenToggled = function() {
		// Fix the (weird and ugly) Chrome behavior
		if (!!document.webkitFullscreenElement) {
			real_viewer_size.width = container.style.width;
			real_viewer_size.height = container.style.height;

			container.style.width = '100%';
			container.style.height = '100%';
			fitToContainer();
		}

		else if (!!container.webkitRequestFullscreen) {
			container.style.width = real_viewer_size.width;
			container.style.height = real_viewer_size.height;
			fitToContainer();
		}

		/**
		 * Indicates that the fullscreen mode has been toggled.
		 * @callback PhotoSphereViewer~onFullscreenToggled
		 * @param {boolean} enabled - `true` if fullscreen is enabled, `false` otherwise
		 **/

		triggerAction('fullscreen-mode', isFullscreenEnabled());
	};

	/**
	 * Enables fullscreen.
	 * @private
	 * @return {void}
	 **/

	var enableFullscreen = function() {
		if (!!container.requestFullscreen)
			container.requestFullscreen();

		else if (!!container.mozRequestFullScreen)
			container.mozRequestFullScreen();

		else if (!!container.webkitRequestFullscreen)
			container.webkitRequestFullscreen();

		else if (!!container.msRequestFullscreen)
			container.msRequestFullscreen();
	};

	/**
	 * Disables fullscreen.
	 * @private
	 * @return {void}
	 **/

	var disableFullscreen = function() {
		if (!!document.exitFullscreen)
			document.exitFullscreen();

		else if (!!document.mozCancelFullScreen)
			document.mozCancelFullScreen();

		else if (!!document.webkitExitFullscreen)
			document.webkitExitFullscreen();

		else if (!!document.msExitFullscreen)
			document.msExitFullscreen();
	};

	/**
	 * Enables/disables fullscreen.
	 * @public
	 * @return {void}
	 **/

	this.toggleFullscreen = function() {
		// Switches to fullscreen mode
		if (!isFullscreenEnabled())
			enableFullscreen();

		// Switches to windowed mode
		else
			disableFullscreen();
	};

	/**
	 * Shows the navigation bar.
	 * @private
	 * @return {void}
	 **/

	var showNavbar = function() {
		if (display_navbar)
			navbar.show();
	};

	/**
	 * Sets the animation speed.
	 * @private
	 * @param {string} speed - The speed, in radians/degrees/revolutions per second/minute
	 * @return {void}
	 **/

	var setAnimSpeed = function(speed) {
		speed = speed.toString().trim();

		// Speed extraction
		var speed_value = parseFloat(speed.replace(/^(-?[0-9]+(?:\.[0-9]*)?).*$/, '$1'));
		var speed_unit = speed.replace(/^-?[0-9]+(?:\.[0-9]*)?(.*)$/, '$1').trim();

		// "per minute" -> "per second"
		if (speed_unit.match(/(pm|per minute)$/))
			speed_value /= 60;

		var rad_per_second = 0;

		// Which unit?
		switch (speed_unit) {
			// Revolutions per minute / second
			case 'rpm':
			case 'rev per minute':
			case 'revolutions per minute':
			case 'rps':
			case 'rev per second':
			case 'revolutions per second':
				// speed * 2pi
				rad_per_second = speed_value * 2 * Math.PI;
				break;

			// Degrees per minute / second
			case 'dpm':
			case 'deg per minute':
			case 'degrees per minute':
			case 'dps':
			case 'deg per second':
			case 'degrees per second':
				// Degrees to radians (rad = deg * pi / 180)
				rad_per_second = speed_value * Math.PI / 180;
				break;

			// Radians per minute / second
			case 'rad per minute':
			case 'radians per minute':
			case 'rad per second':
			case 'radians per second':
				rad_per_second = speed_value;
				break;

			// Unknown unit
			default:
				m_anim = false;
		}

		// Longitude offset
		long_offset = rad_per_second * PSV_ANIM_TIMEOUT / 1000;
	};

	/**
	 * Parses an angle given in radians or degrees.
	 * @private
	 * @param {number|string} angle - Angle in radians (number) or in degrees (string)
	 * @return {number} The angle in radians
	 **/

	var parseAngle = function(angle) {
		angle = angle.toString().trim();

		// Angle extraction
		var angle_value = parseFloat(angle.replace(/^(-?[0-9]+(?:\.[0-9]*)?).*$/, '$1'));
		var angle_unit = angle.replace(/^-?[0-9]+(?:\.[0-9]*)?(.*)$/, '$1').trim();

		// Degrees
		if (angle_unit == 'deg')
			angle_value *= Math.PI / 180;

		// Radians by default, we don't have anyting to do
		return getAngleMeasure(angle_value);
	};

	/**
	 * Sets the viewer size.
	 * @private
	 * @param {object} size - An object containing the wanted width and height
	 * @return {void}
	 **/

	var setNewViewerSize = function(size) {
		// Checks all the values
		for (dim in size) {
			// Only width and height matter
			if (dim == 'width' || dim == 'height') {
				// Size extraction
				var size_str = size[dim].toString().trim();

				var size_value = parseFloat(size_str.replace(/^([0-9]+(?:\.[0-9]*)?).*$/, '$1'));
				var size_unit = size_str.replace(/^[0-9]+(?:\.[0-9]*)?(.*)$/, '$1').trim();

				// Only percentages and pixels are allowed
				if (size_unit != '%')
					size_unit = 'px';

				// We're good
				new_viewer_size[dim] = {
						css: size_value + size_unit,
						unit: size_unit
					};
			}
		}
	};

	/**
	 * Adds a function to execute when a given action occurs.
	 * @public
	 * @param {string} name - The action name
	 * @param {function} f - The handler function
	 * @return {void}
	 **/

	this.addAction = function(name, f) {
		// New action?
		if (!(name in actions))
			actions[name] = [];

		actions[name].push(f);
	};

	/**
	 * Triggers an action.
	 * @private
	 * @param {string} name - Action name
	 * @param {*} arg - An argument to send to the handler functions
	 * @return {void}
	 **/

	var triggerAction = function(name, arg) {
		// Does the action have any function?
		if ((name in actions) && !!actions[name].length) {
			for (var i = 0, l = actions[name].length; i < l; ++i) {
				if (arg !== undefined)
					actions[name][i](arg);

				else
					actions[name][i]();
			}
		}
	};

	// Required parameters
	if (args === undefined || args.panorama === undefined || args.container === undefined) {
		console.log('PhotoSphereViewer: no value given for panorama or container');
		return;
	}

	// Movement speed
	var PSV_LONG_OFFSET = (args.long_offset !== undefined) ? parseFloat(args.long_offset) : Math.PI / 360.0;
	var PSV_LAT_OFFSET = (args.lat_offset !== undefined) ? parseFloat(args.lat_offset) : Math.PI / 180.0;

	// 最小和最大度的视野
	var PSV_FOV_MIN = (args.min_fov !== undefined) ? stayBetween(parseFloat(args.min_fov), 1, 179) : 30;
	var PSV_FOV_MAX = (args.max_fov !== undefined) ? stayBetween(parseFloat(args.max_fov), 1, 179) : 90;
	// Maximal tilt up / down angles
	var PSV_TILT_UP_MAX = (args.tilt_up_max !== undefined) ? stayBetween(parseAngle(args.tilt_up_max), 0, Math.PI / 2.0) : Math.PI / 2.0;
	var PSV_TILT_DOWN_MAX = (args.tilt_down_max !== undefined) ? -stayBetween(parseAngle(args.tilt_down_max), 0, Math.PI / 2.0) : -Math.PI / 2.0;

	// Default position
	var lat = 0, long = 0;

	if (args.default_position !== undefined) {
		if (args.default_position.lat !== undefined)
			// lat = stayBetween(parseAngle(args.default_position.lat), PSV_TILT_DOWN_MAX, PSV_TILT_UP_MAX);
			lat = args.default_position.lat;

		if (args.default_position.long !== undefined)
			// long = parseAngle(args.default_position.long);
			long = args.default_position.long;
	}

	// Default zoom level
	var zoom_lvl = 0;

	if (args.zoom_level !== undefined)
		zoom_lvl = stayBetween(parseInt(Math.round(args.zoom_level)), 0, 100);

	// Animation constants
	var PSV_FRAMES_PER_SECOND = 60;
	var PSV_ANIM_TIMEOUT = 1000 / PSV_FRAMES_PER_SECOND;

	// Delay before the animation
	var anim_delay = 2000;

	if (args.time_anim !== undefined) {
		if (typeof args.time_anim == 'number' && args.time_anim >= 0)
			anim_delay = args.time_anim;

		else
			anim_delay = false;
	}
	// Deprecated: horizontal offset for the animation
	var long_offset = (args.theta_offset !== undefined) ? Math.PI / parseInt(args.theta_offset) : Math.PI / 1440;

	// Horizontal animation speed
	if (args.anim_speed !== undefined)
		setAnimSpeed(args.anim_speed);
	else
		setAnimSpeed('2rpm');

	// Navigation bar
	var navbar = new PSVNavBar(this);

	// Must we display the navigation bar?
	var display_navbar = (args.navbar !== undefined) ? !!args.navbar : false;

	// Style of the navigation bar
	var navbar_style = (args.navbar_style !== undefined) ? args.navbar_style : {};

	// Are user interactions allowed?
	var user_interactions_allowed = (args.allow_user_interactions !== undefined) ? !!args.allow_user_interactions : true;

	if (!user_interactions_allowed)
		display_navbar = false;

	// Container
	var container = args.container;

	// Size of the viewer
	var viewer_size, new_viewer_size = {}, real_viewer_size = {};
	if (args.size !== undefined)
		setNewViewerSize(args.size);

	// Some useful attributes
	var panorama = args.panorama;
	var root, canvas_container;
	var renderer = null, scene = null, camera = null, stereo_effect = null;
	var mousedown = false, mouse_x = 0, mouse_y = 0;
	var touchzoom = false, touchzoom_dist = 0;
	var autorotate_timeout = null, anim_timeout = null, alt_timeout = null;

	var sphoords = new Sphoords();

	var actions = {};

	// Must we read XMP data?
	var readxmp = (args.usexmpdata !== undefined) ? !!args.usexmpdata : true;

	// Loading message
	var loading_msg = (args.loading_msg !== undefined) ? args.loading_msg.toString() : 'Loading…';

	// Loading image
	var loading_img = (args.loading_img !== undefined) ? args.loading_img.toString() : null;

	// Function to call once panorama is ready?
	if (args.onready !== undefined)
		this.addAction('ready', args.onready);

	// Go?
	var autoload = (args.autoload !== undefined) ? !!args.autoload : true;

	if (autoload)
		this.load();
};

/**
 * 表示导航栏.
 **/

var PSVNavBar = function(psv) {
	/**
	 * Checks if a value exists in an array.
	 * @private
	 * @param {*} searched - The searched value
	 * @param {array} array - The array
	 * @return {boolean} `true` if the value exists in the array, `false` otherwise
	 **/

	var inArray = function(searched, array) {
		for (var i = 0, l = array.length; i < l; ++i) {
			if (array[i] == searched)
				return true;
		}

		return false;
	};

	/**
	 * Checks if a property is valid.
	 * @private
	 * @param {string} property - The property
	 * @param {*} value - The value to check
	 * @return {boolean} `true` if the value is valid, `false` otherwise
	 **/

	var checkValue = function(property, value) {
		return (
				// Color
				(
					inArray(property, colors) && (typeof value == 'string') &&
					(
						value == 'transparent' ||
						!!value.match(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/) ||
						!!value.match(/^rgb\((1?[0-9]{1,2}|2[0-4][0-9]|25[0-5])(,\s*(1?[0-9]{1,2}|2[0-4][0-9]|25[0-5])){2}\)$/) ||
						!!value.match(/^rgba\(((1?[0-9]{1,2}|2[0-4][0-9]|25[0-5]),\s*){3}(0(\.[0-9]*)?|1)\)$/)
					)
				) ||

				// Number
				(inArray(property, numbers) && !isNaN(parseFloat(value)) && isFinite(value) && value >= 0)
			);
	};

	/**
	 * Sets the style.
	 * @public
	 * @param {object} new_style - The properties to change
	 * @param {string} [new_style.backgroundColor=rgba(61, 61, 61, 0.5)] - Navigation bar background color
	 * @param {string} [new_style.buttonsColor=rgba(255, 255, 255, 0.7)] - Buttons foreground color
	 * @param {string} [new_style.buttonsBackgroundColor=transparent] - Buttons background color
	 * @param {string} [new_style.activeButtonsBackgroundColor=rgba(255, 255, 255, 0.1)] - Active buttons background color
	 * @param {number} [new_style.buttonsHeight=20] - Buttons height in pixels
	 * @param {number} [new_style.autorotateThickness=1] - Autorotate icon thickness in pixels
	 * @param {number} [new_style.zoomRangeWidth=50] - Zoom range width in pixels
	 * @param {number} [new_style.zoomRangeThickness=1] - Zoom range thickness in pixels
	 * @param {number} [new_style.zoomRangeDisk=7] - Zoom range disk diameter in pixels
	 * @param {number} [new_style.fullscreenRatio=4/3] - Fullscreen icon ratio (width / height)
	 * @param {number} [new_style.fullscreenThickness=2] - Fullscreen icon thickness in pixels
	 * @param {number} [new_style.gyroscopeThickness=1] - Gyroscope icon thickness in pixels
	 * @param {number} [new_style.virtualRealityRatio=4/3] - Virtual reality icon ratio (width / height)
	 * @param {number} [new_style.virtualRealityBorderRadius=2] - Virtual reality icon border radius in pixels
	 * @return {void}
	 **/

	this.setStyle = function(new_style) {
		// Properties to change
		for (property in new_style) {
			// Is this property a property we'll use?
			if ((property in style) && checkValue(property, new_style[property]))
				style[property] = new_style[property];
		}
	};

	/**
	 * Creates the elements.
	 * @public
	 * @return {void}
	 **/

	this.create = function() {
		// Container
		container = document.createElement('div');
		container.style.backgroundColor = style.backgroundColor;

		container.style.position = 'absolute';
		container.style.zIndex = 10;
		container.style.bottom = 0;
		container.style.width = '100%';
		container.style.boxSizing = 'content-box';
		container.style.textAlign = 'center';
		container.style.lineHeight = '60px';
		container.style.transition = 'bottom 0.4s ease-out';

		// Autorotate button
		autorotate = new PSVNavBarButton(psv, 'autorotate', style);
		container.appendChild(autorotate.getButton());

		// if (Sphoords.isDeviceOrientationSupported) {
		if(navigator.userAgent.match(/(iPhone|iPod|android|ios)/i)){
			// Device orientation button
			orientation = new PSVNavBarButton(psv, 'orientation', style);
			container.appendChild(orientation.getButton());
		}
	};

	/**
	 * Returns the bar itself.
	 * @public
	 * @return {HTMLElement} The bar
	 **/

	this.getBar = function() {
		return container;
	};

	/**
	 * Shows the bar.
	 * @private
	 * @return {void}
	 **/

	var show = function() {
		// Stop hiding the bar if necessary
		if (!!must_hide_timeout) {
			clearTimeout(must_hide_timeout);

			if (!hidden && must_be_hidden)
				must_hide_timeout = setTimeout(hide, 5000);
		}

		if (hidden) {
			container.style.bottom = 0;
			hidden = false;

			// If bar must be hidden, we hide it again
			if (must_be_hidden)
				must_hide_timeout = setTimeout(hide, 5000);
		}
	};

	/**
	 * Shows the bar.
	 * @public
	 * @return {void}
	 **/

	this.show = function() {
		show();
	};

	/**
	 * Hides the bar.
	 * @private
	 * @return {void}
	 **/

	var hide = function() {
		if (!hidden) {
			container.style.bottom = (-container.offsetHeight + 1) + 'px';
			hidden = true;
		}
	};

	/**
	 * Hides the bar.
	 * @public
	 * @return {void}
	 **/

	this.hide = function() {
		hide();
	};

	/**
	 * Returns the current state.
	 * @public
	 * @return {boolean} `true` if navigation bar is hidden, `false` otherwise
	 **/

	this.isHidden = function() {
		return hidden;
	};

	/**
	 * Indicates that the bar must be hidden or not.
	 * @public
	 * @param {boolean} [state=true] - `true` to automatically hide the bar, `false` to show it
	 * @return {void}
	 **/

	this.mustBeHidden = function(state) {
		must_be_hidden = (state !== undefined) ? !!state : true;

		if (must_be_hidden)
			hide();

		else
			show();
	};

	// Default style
	var style = {
			// Bar background
			backgroundColor: 'rgba(61, 61, 61, 0.5)',

			// Buttons foreground color
			buttonsColor: 'rgba(255, 255, 255, 0.7)',

			// Buttons background color
			buttonsBackgroundColor: 'transparent',

			// Buttons background color when active
			activeButtonsBackgroundColor: 'rgba(255, 255, 255, 0.1)',

			// Buttons height in pixels
			buttonsHeight: 20,

			// Autorotate icon thickness in pixels
			autorotateThickness: 1,

			// Zoom range width in pixels
			zoomRangeWidth: 50,

			// Zoom range thickness in pixels
			zoomRangeThickness: 1,

			// Zoom range disk diameter in pixels
			zoomRangeDisk: 7,

			// Fullscreen icon ratio
			fullscreenRatio: 4 / 3,

			// Fullscreen icon thickness in pixels
			fullscreenThickness: 2,

			// Gyroscope icon thickness in pixels
			gyroscopeThickness: 1,

			// Virtual reality icon ratio
			virtualRealityRatio: 4 / 3,

			// Virtual reality icon border radius in pixels
			virtualRealityBorderRadius: 2
		};

	// Properties types
	var colors = ['backgroundColor', 'buttonsColor', 'buttonsBackgroundColor', 'activeButtonsBackgroundColor'];
	var numbers = ['buttonsHeight', 'autorotateThickness', 'zoomRangeWidth', 'zoomRangeThickness', 'zoomRangeDisk', 'fullscreenRatio', 'fullscreenThickness'];

	// Some useful attributes
	var container;
	var autorotate, zoom, fullscreen, orientation, vr;
	var must_hide_timeout = null;
	var hidden = false, must_be_hidden = false;
};

/**
 * 表示导航栏按钮.
 * @class
 * @param {PhotoSphereViewer} psv - A PhotoSphereViewer object
 * @param {string} type - Type of button
 * @param {object} style - Style of the navigation bar
 **/

var PSVNavBarButton = function(psv, type, style) {
    /**
     * Attaches an event handler function to an elemnt.
     * @private
     * @param {HTMLElement} elt - The element
     * @param {string} evt - The event name
     * @param {Function} f - The handler function
     * @return {void}
     **/

    var addEvent = function(elt, evt, f) {
        if (!!elt.addEventListener)
            elt.addEventListener(evt, f, false);
        else
            elt.attachEvent('on' + evt, f);
    };

    /**
     * Creates the right button.
     * @private
     * @return {void}
     **/

    var create = function() {
        switch (type) {
            case 'autorotate':
                // Autorotate icon sizes
        		var autorotate_sphere_width = style.buttonsHeight - style.autorotateThickness * 2;
        		var autorotate_equator_height = autorotate_sphere_width / 10;

        		// Autorotate button
        		button = document.createElement('div');
        		button.id = 'AutoButton';
        		button.style.cssFloat = 'left';
        		button.style.padding = '10px';
        		button.style.width = style.buttonsHeight + 'px';
        		button.style.height = style.buttonsHeight + 'px';
        		button.style.backgroundColor = style.buttonsBackgroundColor;
        		button.style.position = 'relative';
        		button.style.cursor = 'pointer';

                addEvent(button, 'click', function(){psv.toggleAutorotate();});

        		var autorotate_sphere = document.createElement('div');
        		autorotate_sphere.style.width = autorotate_sphere_width + 'px';
        		autorotate_sphere.style.height = autorotate_sphere_width + 'px';
        		autorotate_sphere.style.borderRadius = '50%';
        		autorotate_sphere.style.border = style.autorotateThickness + 'px solid ' + style.buttonsColor;
        		button.appendChild(autorotate_sphere);

        		var autorotate_equator = document.createElement('div');
        		autorotate_equator.style.width = autorotate_sphere_width + 'px';
        		autorotate_equator.style.height = autorotate_equator_height + 'px';
        		autorotate_equator.style.borderRadius = '50%';
        		autorotate_equator.style.border = style.autorotateThickness + 'px solid ' + style.buttonsColor;
        		autorotate_equator.style.position = 'absolute';
        		autorotate_equator.style.top = '50%';
        		autorotate_equator.style.marginTop = -(autorotate_equator_height / 2 + style.autorotateThickness) + 'px';
        		button.appendChild(autorotate_equator);

                // (In)active
                psv.addAction('autorotate', toggleActive);

                break;

            case 'orientation':
                // Gyroscope icon sizes
                var gyroscope_sphere_width = style.buttonsHeight - style.gyroscopeThickness * 2;
                var gyroscope_ellipses_big_axis = gyroscope_sphere_width - style.gyroscopeThickness * 4;
                var gyroscope_ellipses_little_axis = gyroscope_sphere_width / 10;

                // Gyroscope button
        		button = document.createElement('div');
        		button.style.cssFloat = 'right';
        		button.style.padding = '10px';
                button.style.width = style.buttonsHeight + 'px';
                button.style.height = style.buttonsHeight + 'px';
                button.style.backgroundColor = style.buttonsBackgroundColor;
                button.style.position = 'relative';
                button.style.cursor = 'pointer';

                addEvent(button, 'click', function(){psv.toggleDeviceOrientation();});

                var gyroscope_sphere = document.createElement('div');
                gyroscope_sphere.style.width = gyroscope_sphere_width + 'px';
                gyroscope_sphere.style.height = gyroscope_sphere_width + 'px';
                gyroscope_sphere.style.borderRadius = '50%';
                gyroscope_sphere.style.border = style.gyroscopeThickness + 'px solid ' + style.buttonsColor;
                button.appendChild(gyroscope_sphere);

                var gyroscope_hor_ellipsis = document.createElement('div');
                gyroscope_hor_ellipsis.style.width = gyroscope_ellipses_big_axis + 'px';
                gyroscope_hor_ellipsis.style.height = gyroscope_ellipses_little_axis + 'px';
                gyroscope_hor_ellipsis.style.borderRadius = '50%';
                gyroscope_hor_ellipsis.style.border = style.gyroscopeThickness + 'px solid ' + style.buttonsColor;
                gyroscope_hor_ellipsis.style.position = 'absolute';
                gyroscope_hor_ellipsis.style.top = '50%';
                gyroscope_hor_ellipsis.style.left = '50%';
                gyroscope_hor_ellipsis.style.marginTop = -(gyroscope_ellipses_little_axis / 2 + style.gyroscopeThickness) + 'px';
                gyroscope_hor_ellipsis.style.marginLeft = -(gyroscope_ellipses_big_axis / 2 + style.gyroscopeThickness) + 'px';
                button.appendChild(gyroscope_hor_ellipsis);

                var gyroscope_ver_ellipsis = document.createElement('div');
                gyroscope_ver_ellipsis.style.width = gyroscope_ellipses_little_axis + 'px';
                gyroscope_ver_ellipsis.style.height = gyroscope_ellipses_big_axis + 'px';
                gyroscope_ver_ellipsis.style.borderRadius = '50%';
                gyroscope_ver_ellipsis.style.border = style.gyroscopeThickness + 'px solid ' + style.buttonsColor;
                gyroscope_ver_ellipsis.style.position = 'absolute';
                gyroscope_ver_ellipsis.style.top = '50%';
                gyroscope_ver_ellipsis.style.left = '50%';
                gyroscope_ver_ellipsis.style.marginTop = -(gyroscope_ellipses_big_axis / 2 + style.gyroscopeThickness) + 'px';
                gyroscope_ver_ellipsis.style.marginLeft = -(gyroscope_ellipses_little_axis / 2 + style.gyroscopeThickness) + 'px';
                button.appendChild(gyroscope_ver_ellipsis);

                // (In)active
                psv.addAction('device-orientation', toggleActive);

                break;
        }
    };

    /**
     * Returns the button element.
     * @public
     * @return {HTMLElement} The button
     **/

    this.getButton = function() {
        return button;
    };

    /**
     * Changes the active state of the button.
     * @private
     * @param {boolean} active - `true` if the button should be active, `false` otherwise
     * @return {void}
     **/

    var toggleActive = function(active) {
        if (active)
            button.style.backgroundColor = style.activeButtonsBackgroundColor;

        else
            button.style.backgroundColor = style.buttonsBackgroundColor;
    };

    /**
     * Moves the zoom cursor.
     * @private
     * @param {integer} level - Zoom level (between 0 and 100)
     * @return {void}
     **/

    var moveZoomValue = function(level) {
        zoom_value.style.left = (level / 100 * style.zoomRangeWidth - style.zoomRangeDisk / 2) + 'px';
    };

    /**
     * The user wants to zoom.
     * @private
     * @param {Event} evt - The event
     * @return {void}
     **/

    var initZoomChangeWithMouse = function(evt) {
        initZoomChange(parseInt(evt.clientX));
    };

    /**
     * The user wants to zoom (mobile version).
     * @private
     * @param {Event} evt - The event
     * @return {void}
     **/

    var initZoomChangeByTouch = function(evt) {
        var touch = evt.touches[0];
        if (touch.target == zoom_range_bg || touch.target == zoom_range || touch.target == zoom_value)
            initZoomChange(parseInt(touch.clientX));
    };

    /**
     * Initializes a zoom change.
     * @private
     * @param {integer} x - Horizontal coordinate
     * @return {void}
     **/

    var initZoomChange = function(x) {
        mousedown = true;
        changeZoom(x);
    };

    /**
     * The user wants to stop zooming.
     * @private
     * @param {Event} evt - The event
     * @return {void}
     **/

    var stopZoomChange = function(evt) {
        mousedown = false;
    };

    /**
     * The user moves the zoom cursor.
     * @private
     * @param {Event} evt - The event
     * @return {void}
     **/

    var changeZoomWithMouse = function(evt) {
        evt.preventDefault();
        changeZoom(parseInt(evt.clientX));
    };

    /**
     * The user moves the zoom cursor (mobile version).
     * @private
     * @param {Event} evt - The event
     * @return {void}
     **/

    var changeZoomByTouch = function(evt) {
        var touch = evt.touches[0];
        if (touch.target == zoom_range_bg || touch.target == zoom_range || touch.target == zoom_value) {
            evt.preventDefault();
            changeZoom(parseInt(touch.clientX));
        }
    };

    /**
     * Zoom change.
     * @private
     * @param {integer} x - Horizontal coordinate
     * @return {void}
     **/

    var changeZoom = function(x) {
        if (mousedown) {
            var user_input = x - zoom_range.getBoundingClientRect().left;
            var zoom_level = user_input / style.zoomRangeWidth * 100;
            psv.zoom(zoom_level);
        }
    };

    // Some useful attributes
    var zoom_range_bg, zoom_range, zoom_value;
    var mousedown = false;

    // Create the button
    var button;
    create();
};

/**
 * 
 **/

var Sphoords = function() {
	/**
	 * 检测所使用的浏览器引擎.
	 * @private
	 * @return {void}
	 **/
	var detectBrowserEngine = function() {
		// User-Agent
		var ua = navigator.userAgent;

		// Gecko
		if (/Gecko\/[0-9.]+/.test(ua))
			return 'Gecko';

		// Blink
		if (/Chrome\/[0-9.]+/.test(ua))
			return 'Blink';

		// WebKit
		if (/AppleWebKit\/[0-9.]+/.test(ua))
			return 'WebKit';

		// Trident
		if (/Trident\/[0-9.]+/.test(ua))
			return 'Trident';

		// Presto
		if (/Opera\/[0-9.]+/.test(ua))
			return 'Presto';

		// No engine detected, Gecko by default
		return 'Gecko';
	};

	/**
	 * 返回主角的度数.
	 * @private
	 * @param {number} angle - The initial angle
	 * @return {number} The principal angle
	 **/

	var getPrincipalAngle = function(angle) {
		return angle - Math.floor(angle / 360.0) * 360.0;
	};

	/**
	 * Attaches the DeviceOrientation event to the window and starts the record, only if Device Orientation is supported.
	 * @public
	 * @return {boolean} `true` if event is attached, `false` otherwise
	 **/

	this.start = function() {
		if (Sphoords.isDeviceOrientationSupported) {
			window.addEventListener('deviceorientation', onDeviceOrientation, false);

			recording = true;
			return true;
		}

		else {
			console.log('Device Orientation API not supported');
			return false;
		}
	};

	/**
	 * Stops the record by removing the event handler.
	 * @public
	 * @return {void}
	 **/

	this.stop = function() {
		// Is there something to remove?
		if (recording) {
			window.removeEventListener('deviceorientation', onDeviceOrientation, false);
			recording = false;
		}
	};

	/**
	 * Toggles the recording state.
	 * @public
	 * @return {void}
	 **/

	this.toggle = function() {
		if (recording)
			this.stop();

		else
			this.start();
	};

	/**
	 * 确定设备的方向活动连接.
	 * @public
	 * @return {boolean} `true` if event is attached, `false` otherwise
	 **/

	this.isEventAttached = function() {
		return recording;
	};

	/**
	 * 记录当前的方向
	 * @private
	 * @param {Event} evt - The event
	 * @return {void}
	 **/

	var onDeviceOrientation = function(evt) {
		// 当前屏幕方向
		orientation = Sphoords.getScreenOrientation();
		// Coordinates depend on the orientation
		var theta = 0, phi = 0;
		// if(navigator.userAgent.match(/(iPhone|iPod|ios)/i)){
			// evt = {};
		// }
		// alert(JSON.stringify(evt));
		switch (orientation) {
			// 纵向结构
			case 'portrait-primary':
				theta = evt.alpha + evt.gamma;
				phi = evt.beta - 90;

				break;

			// 景观模式
			case 'landscape-primary':
				// If "-90" is not present for theta, origin won't be the same than for portrait mode
				theta = evt.alpha + evt.beta - 90;
				phi = -evt.gamma - 90;

				// The user looks to the top while phi "looks" to the bottom
				if (Math.abs(evt.beta) > 90) {
					// Here browser engines have different behaviors
					// Hope we have a really respected standard soon

					switch (engine) {
						case 'Blink':
							phi += 180;
							break;

						case 'Gecko':
						default:
							phi = -phi;
							break;
					}
				}

				break;

			// Landscape mode (inversed)
			case 'landscape-secondary':
				// Still the same reason for "+90"
				theta = evt.alpha - evt.beta + 90;
				phi = evt.gamma - 90;

				// The user looks to the top while phi "looks" to the bottom
				if (Math.abs(evt.beta) > 90) {
					// Here again, some different behaviors…

					switch (engine) {
						case 'Blink':
							phi += 180;
							break;

						case 'Gecko':
						default:
							phi = -phi;
							break;
					}
				}

				break;

			// Portrait mode (inversed)
			case 'portrait-secondary':
				theta = evt.alpha - evt.gamma;
				phi = 180 - (evt.beta - 90);
				phi = 270 - evt.beta;

				break;
		}

		// First, we want phi to be between -π and π
		phi = getPrincipalAngle(phi);

		if (phi >= 180)
			phi -= 360;

		// We store the right values
		long_deg = getPrincipalAngle(theta);
		lat_deg = Math.max(-90, Math.min(90, phi));
		if(navigator.userAgent.match(/(iPhone|iPod|ios)/i)){
			lat_deg = Math.max(-90, Math.min(180, phi));
		}
		long = long_deg * DEG_TO_RAD;
		lat = lat_deg * DEG_TO_RAD;
		// We execute the wanted functions
		executeListeners();
	};

	/**
	 * 返回当前坐标.
	 * @public
	 * @return {object} Longitude/latitude couple
	 **/

	this.getCoordinates = function() {
		return {
				longitude: long,
				latitude: lat
			};
	};

	/**
	 * Returns the current coordinates in degrees.
	 * @return {object} Longitude/latitude couple
	 **/

	this.getCoordinatesInDegrees = function() {
		return {
				longitude: long_deg,
				latitude: lat_deg
			};
	};

	/**
	 * 返回当前屏幕方向.
	 * @return {string|null} The screen orientation (portrait-primary, portrait-secondary, landscape-primary, landscape-secondary) or `null` if not supported
	 **/

	this.getScreenOrientation = function() {
		return orientation;
	};

	/**
	 * 添加当设备方向更改时执行的函数.
	 * @public
	 * @param {function} f - The handler function
	 * @return {void}
	 **/

	this.addListener = function(f) {
		listeners.push(f);
	};

	/**
	 * Executes all the wanted functions for the main event.
	 * @private
	 * @return {void}
	 **/

	var executeListeners = function() {
		if (!!listeners.length) {
			for (var i = 0, l = listeners.length; i < l; ++i) {
				listeners[i]({
					longitude: long,
					latitude: lat
				});
			}
		}
	};
	this.setLog = function(v){
		long = v;
	}
	this.setLat = function(v){
		lat = v;
	}
	// Current state
	var recording = false;

	// Coordinates in degrees
	var long_deg = 0, lat_deg = 0;

	// Coordinates in radians
	var long = 0, lat = 0;

	// What a useful constant!
	var DEG_TO_RAD = Math.PI / 180;

	// Screen orientation
	var orientation = Sphoords.getScreenOrientation();

	// 浏览器引擎
	var engine = detectBrowserEngine();

	// Listeners
	var listeners = [];
};

/**
 * 检索当前屏幕方向
 * @static
 * @return {string|null} Current screen orientation, `null` if not supported
 **/

Sphoords.getScreenOrientation = function() {
	var screen_orientation = null;

	if (!!screen.orientation)
		screen_orientation = screen.orientation;

	else if (!!screen.mozOrientation)
		screen_orientation = screen.mozOrientation;

	else if (!!screen.msOrientation)
		screen_orientation = screen.msOrientation;
	if(navigator.userAgent.match(/(iPhone|iPod|ios)/i)){
		screen_orientation = {type: 'portrait-primary'};
		// screen_orientation = {type: 'portrait-secondary'};
		// screen_orientation = {};
	}
	// alert(JSON.stringify(screen_orientation));
	// Are the specs respected?
	return (screen_orientation !== null && (typeof screen_orientation == 'object')) ? screen_orientation.type : screen_orientation;
};

/**
 * 知道设备方向是否支持(`true` if it is, `false` otherwise).
 * @static
 **/

Sphoords.isDeviceOrientationSupported = false;

// Just testing if window.DeviceOrientationEvent is defined is not enough
// In fact, it can return false positives with some desktop browsers which run in computers that don't have the dedicated hardware
(function() {
	// We attach the right event
	// If it is fired, the API is really supported so we can indicate true :)
	if (!!window.DeviceOrientationEvent && Sphoords.getScreenOrientation() !== null) {
		function testDeviceOrientation(evt) {
			if (evt !== null && evt.alpha !== null) {
				Sphoords.isDeviceOrientationSupported = true;
				window.removeEventListener('deviceorientation', testDeviceOrientation);
			}
		}
		window.addEventListener('deviceorientation', testDeviceOrientation);
	}
})();
