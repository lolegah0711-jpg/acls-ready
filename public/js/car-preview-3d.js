// Leichtgewichtige 3D-Fahrzeug-Vorschau (Three.js, self-hosted, kein CDN).
// Prozedural erzeugtes generisches Fahrzeug (kein Markenlogo, kein Modell
// eines realen Herstellers) -- Karosserie, Felgen & Xenon-Scheinwerfer sind
// einzeln einfärbbar, Perlglanz nutzt ein echtes Iridescence-Material statt
// nur einer Deko-Animation. Frei drehbar per Maus/Touch (OrbitControls).
//
// Three.js liefert seit ~r150 nur noch ES-Module aus (kein <script>-Build
// mehr) -- wir laden es deshalb per dynamischem import() nach, ausgelöst
// erst wenn initCarPreview3D() wirklich aufgerufen wird. Die Bare-Specifier
// 'three' innerhalb von OrbitControls.js wird über die Importmap in
// index.html/preise.html aufgelöst.
(function () {
  let _modulesPromise = null;
  function loadThreeModules() {
    if (!_modulesPromise) {
      _modulesPromise = Promise.all([
        import('/vendor/three/three.module.min.js'),
        import('/vendor/three/controls/OrbitControls.js'),
      ]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }));
    }
    return _modulesPromise;
  }

  // Seitenprofil der Karosserie (X = Länge, Y = Höhe), wird entlang Z
  // (Fahrzeugbreite) extrudiert. Monoton fallende X-Werte auf dem oberen
  // Bogen und monoton steigende X-Werte auf der Bodenlinie -> einfache,
  // überschneidungsfreie Kontur.
  function buildBodyShape(THREE) {
    const s = new THREE.Shape();
    s.moveTo(2.00, 0.28);
    s.quadraticCurveTo(2.18, 0.30, 2.16, 0.50);
    s.quadraticCurveTo(2.14, 0.64, 1.98, 0.64);
    s.quadraticCurveTo(1.55, 0.64, 1.15, 0.70);
    s.quadraticCurveTo(0.92, 0.76, 0.70, 1.08);
    s.quadraticCurveTo(0.60, 1.20, 0.35, 1.22);
    s.lineTo(-0.45, 1.22);
    s.quadraticCurveTo(-0.70, 1.22, -0.85, 1.06);
    s.quadraticCurveTo(-1.05, 0.80, -1.30, 0.68);
    s.quadraticCurveTo(-1.65, 0.60, -1.95, 0.60);
    s.quadraticCurveTo(-2.16, 0.60, -2.16, 0.44);
    s.quadraticCurveTo(-2.16, 0.28, -2.00, 0.28);
    s.lineTo(2.00, 0.28);
    return s;
  }

  // Kleinere, nach innen versetzte Teilkontur des Fahrgastzellen-Bereichs
  // für die Fensterscheiben (flache Platten, seitlich auf die Karosserie
  // gesetzt statt echter Aussparung -- robust ohne Boolesche Operationen).
  function buildGreenhouseShape(THREE) {
    const s = new THREE.Shape();
    s.moveTo(1.02, 0.76);
    s.quadraticCurveTo(0.85, 0.90, 0.66, 1.12);
    s.quadraticCurveTo(0.56, 1.17, 0.36, 1.17);
    s.lineTo(-0.42, 1.17);
    s.quadraticCurveTo(-0.62, 1.17, -0.75, 1.08);
    s.quadraticCurveTo(-0.92, 0.92, -1.10, 0.78);
    s.quadraticCurveTo(-1.00, 0.72, -0.83, 0.72);
    s.lineTo(0.85, 0.72);
    s.quadraticCurveTo(0.98, 0.72, 1.02, 0.76);
    return s;
  }

  function buildWheel(THREE, rimHex) {
    const g = new THREE.Group();
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92, metalness: 0.05 });
    const rimMat  = new THREE.MeshStandardMaterial({ color: rimHex, roughness: 0.28, metalness: 0.85 });
    const hubMat  = new THREE.MeshStandardMaterial({ color: 0x4b4f54, roughness: 0.4, metalness: 0.7 });

    // Zylinder-Achse (standardmäßig Y) auf Z drehen, damit die Kreisfläche
    // seitlich zum Fahrzeug zeigt (Rx(90°) bildet Y-Achse auf Z-Achse ab).
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 24), tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    g.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.23, 24), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.userData.isRim = true;
    g.add(rim);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 12), hubMat);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);

    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.035, 0.03), rimMat);
      spoke.userData.isRim = true;
      const a = (i / 5) * Math.PI * 2;
      spoke.position.set(0.11 * Math.cos(a), 0.11 * Math.sin(a), 0);
      spoke.rotation.z = a;
      g.add(spoke);
    }
    return g;
  }

  async function initCarPreview3D(container) {
    const { THREE, OrbitControls } = await loadThreeModules();
    if (!container.isConnected) return null; // Nutzer hat inzwischen die Seite gewechselt

    const width  = container.clientWidth  || 320;
    const height = container.clientHeight || 240;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    camera.position.set(4.6, 2.0, 4.6);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      return null; // WebGL nicht verfügbar
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ── Licht ──
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a1a22, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4;   key.shadow.camera.bottom = -4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.5);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    // ── Boden (weicher Schattenwurf) ──
    const ground = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.ShadowMaterial({ opacity: 0.32 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ── Karosserie ──
    const bodyGeo = new THREE.ExtrudeGeometry(buildBodyShape(THREE), {
      depth: 1.74, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 4, curveSegments: 16,
    });
    bodyGeo.translate(0, 0, -0.87);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xf97316, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    scene.add(body);

    // ── Fenster (getönte Platten, seitlich aufgesetzt) ──
    const winGeo = new THREE.ShapeGeometry(buildGreenhouseShape(THREE), 12);
    const winMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1622, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(winGeo, winMat).translateZ(0.885));
    scene.add(new THREE.Mesh(winGeo, winMat).translateZ(-0.885));

    // ── Räder ──
    const wheelPositions = [[1.28, 0.34, 0.80], [1.28, 0.34, -0.80], [-1.32, 0.34, 0.80], [-1.32, 0.34, -0.80]];
    const wheels = wheelPositions.map(([x, y, z]) => {
      const w = buildWheel(THREE, 0xc7ccd1);
      w.position.set(x, y, z);
      scene.add(w);
      return w;
    });

    // ── Scheinwerfer / Rücklichter ──
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef9c3, emissiveIntensity: 0.6, roughness: 0.3 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0x7f1d1d, emissiveIntensity: 0.5, roughness: 0.4 });
    const lightGeo = new THREE.BoxGeometry(0.08, 0.10, 0.22);
    function addAt(geo, mat, x, y, z) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      scene.add(m);
      return m;
    }
    [0.55, -0.55].forEach(z => addAt(lightGeo, headMat, 2.05, 0.50, z));
    [0.55, -0.55].forEach(z => addAt(lightGeo, tailMat, -2.10, 0.50, z));

    // ── Seitenspiegel (karosseriefarben) ──
    const mirrorGeo = new THREE.BoxGeometry(0.10, 0.09, 0.16);
    [0.92, -0.92].forEach(z => addAt(mirrorGeo, bodyMat, 0.85, 0.80, z));

    // ── Kamera-Steuerung ──
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.55, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3.2;
    controls.maxDistance = 9;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.minPolarAngle = Math.PI * 0.12;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    controls.update();

    let disposed = false, raf = null;
    (function animate() {
      if (disposed) return;
      if (!document.hidden) { controls.update(); renderer.render(scene, camera); }
      raf = requestAnimationFrame(animate);
    })();

    function onResize() {
      const w = container.clientWidth || width, h = container.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return {
      setBodyColor(hex)  { bodyMat.color.set(hex); },
      setRimColor(hex)   { wheels.forEach(w => w.traverse(o => { if (o.userData.isRim) o.material.color.set(hex); })); },
      setXenonColor(hex) { headMat.color.set(hex); headMat.emissive.set(hex); },
      setPearl(on) {
        bodyMat.iridescence = on ? 0.9 : 0;
        bodyMat.iridescenceIOR = 1.3;
        bodyMat.iridescenceThicknessRange = [100, 400];
        bodyMat.clearcoatRoughness = on ? 0.04 : 0.12;
        bodyMat.needsUpdate = true;
      },
      dispose() {
        disposed = true;
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
        });
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
    };
  }

  window.initCarPreview3D = initCarPreview3D;
})();
