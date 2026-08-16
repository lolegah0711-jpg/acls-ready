// 3D-Fahrzeug-Vorschau für die Preisliste (self-hosted, kein CDN).
//
// Technik: ein prozedural erzeugtes, generisches Fahrzeug (kein Markenlogo,
// keine Nachbildung eines realen Herstellermodells) wird in Three.js
// zusammengebaut, per GLTFExporter in ein GLB exportiert und dann von
// Googles <model-viewer> gerendert -- dieselbe Technik, mit der auch
// professionelle Fahrzeug-Konfiguratoren arbeiten (Environment-Reflexionen,
// weicher Bodenschatten, physikalisch korrektes Tone-Mapping, Kamera-Orbit
// per Maus/Touch inkl. sanftem Auto-Rotate). Three.js baut hier nur einmalig
// die Geometrie; das eigentliche Rendering übernimmt model-viewer komplett
// selbst -- entsprechend deutlich weniger und robusterer eigener Code als
// eine handgebaute Three.js-Renderschleife.
//
// Materialien tragen feste Namen (body/rim/tire/hub/glass/headlight/
// taillight), damit sie nach dem Laden über model-viewer.model.materials
// live umgefärbt werden können, ohne das Modell neu zu exportieren.
(function () {
  let _modulesPromise = null;
  function loadModules() {
    if (!_modulesPromise) {
      _modulesPromise = Promise.all([
        import('/vendor/three/three.module.min.js'),
        import('/vendor/three/exporters/GLTFExporter.js'),
        import('/vendor/model-viewer/model-viewer.min.js'),
      ]).then(([THREE, exp]) => ({ THREE, GLTFExporter: exp.GLTFExporter }));
    }
    return _modulesPromise;
  }

  function hexToLinear(hex) {
    const c = String(hex).replace('#', '');
    const toLin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return [0, 2, 4].map(i => toLin(parseInt(c.slice(i, i + 2), 16) / 255));
  }

  // Seitenprofil der Karosserie (X = Länge, Y = Höhe), entlang Z (Breite)
  // extrudiert. Monoton fallende X-Werte auf dem oberen Bogen, monoton
  // steigende X-Werte auf der Bodenlinie -> einfache, überschneidungsfreie
  // Kontur.
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

  function buildWheel(THREE, tireMat, rimMat, hubMat) {
    const g = new THREE.Group();
    // Zylinder-Achse (standardmäßig Y) auf Z drehen, damit die Kreisfläche
    // seitlich zum Fahrzeug zeigt (Rx(90°) bildet Y-Achse auf Z-Achse ab).
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 28), tireMat);
    tire.rotation.x = Math.PI / 2;
    g.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.23, 28), rimMat);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 14), hubMat);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);

    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.035, 0.03), rimMat);
      const a = (i / 5) * Math.PI * 2;
      spoke.position.set(0.11 * Math.cos(a), 0.11 * Math.sin(a), 0);
      spoke.rotation.z = a;
      g.add(spoke);
    }
    return g;
  }

  function buildCarScene(THREE) {
    const scene = new THREE.Scene();

    const bodyMat = new THREE.MeshPhysicalMaterial({
      name: 'body', color: 0xf97316, roughness: 0.32, metalness: 0.55,
      clearcoat: 1, clearcoatRoughness: 0.12,
      iridescence: 0.001, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400],
    });
    const rimMat  = new THREE.MeshStandardMaterial({ name: 'rim', color: 0xc7ccd1, roughness: 0.28, metalness: 0.85 });
    const tireMat = new THREE.MeshStandardMaterial({ name: 'tire', color: 0x161616, roughness: 0.92, metalness: 0.05 });
    const hubMat  = new THREE.MeshStandardMaterial({ name: 'hub', color: 0x4b4f54, roughness: 0.4, metalness: 0.7 });
    const winMat  = new THREE.MeshPhysicalMaterial({
      name: 'glass', color: 0x0b1622, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.72,
    });
    const headMat = new THREE.MeshStandardMaterial({ name: 'headlight', color: 0xfef9c3, emissive: 0xfef9c3, emissiveIntensity: 0.6, roughness: 0.3 });
    const tailMat = new THREE.MeshStandardMaterial({ name: 'taillight', color: 0x7f1d1d, emissive: 0x7f1d1d, emissiveIntensity: 0.5, roughness: 0.4 });

    // Karosserie
    const bodyGeo = new THREE.ExtrudeGeometry(buildBodyShape(THREE), {
      depth: 1.74, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 6, curveSegments: 24,
    });
    bodyGeo.translate(0, 0, -0.87);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    scene.add(body);

    // Fenster (getönte Platten, seitlich aufgesetzt statt echter Aussparung)
    const winGeo = new THREE.ShapeGeometry(buildGreenhouseShape(THREE), 16);
    scene.add(new THREE.Mesh(winGeo, winMat).translateZ(0.885));
    scene.add(new THREE.Mesh(winGeo, winMat).translateZ(-0.885));

    // Räder
    [[1.28, 0.34, 0.80], [1.28, 0.34, -0.80], [-1.32, 0.34, 0.80], [-1.32, 0.34, -0.80]].forEach(([x, y, z]) => {
      const w = buildWheel(THREE, tireMat, rimMat, hubMat);
      w.position.set(x, y, z);
      scene.add(w);
    });

    // Scheinwerfer / Rücklichter / Spiegel
    function addAt(geo, mat, x, y, z) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      scene.add(m);
    }
    const lightGeo = new THREE.BoxGeometry(0.08, 0.10, 0.22);
    [0.55, -0.55].forEach(z => addAt(lightGeo, headMat, 2.05, 0.50, z));
    [0.55, -0.55].forEach(z => addAt(lightGeo, tailMat, -2.10, 0.50, z));
    const mirrorGeo = new THREE.BoxGeometry(0.10, 0.09, 0.16);
    [0.92, -0.92].forEach(z => addAt(mirrorGeo, bodyMat, 0.85, 0.80, z));

    return scene;
  }

  async function initCarPreview3D(container) {
    const { THREE, GLTFExporter } = await loadModules();
    if (!container.isConnected) return null; // Nutzer hat inzwischen die Seite gewechselt

    const scene = buildCarScene(THREE);
    const exporter = new GLTFExporter();
    const glbBuffer = await new Promise((resolve, reject) => {
      exporter.parse(scene, resolve, reject, { binary: true });
    }).catch(() => null);
    if (!glbBuffer || !container.isConnected) return null;

    const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
    const url = URL.createObjectURL(blob);

    const mv = document.createElement('model-viewer');
    mv.src = url;
    mv.style.width = '100%';
    mv.style.height = '100%';
    mv.style.setProperty('--poster-color', 'transparent');
    mv.setAttribute('camera-controls', '');
    mv.setAttribute('auto-rotate', '');
    mv.setAttribute('auto-rotate-delay', '0');
    mv.setAttribute('rotation-per-second', '18deg');
    mv.setAttribute('interaction-prompt', 'none');
    mv.setAttribute('shadow-intensity', '1');
    mv.setAttribute('shadow-softness', '0.85');
    mv.setAttribute('exposure', '1.05');
    mv.setAttribute('environment-image', 'neutral');
    mv.setAttribute('camera-orbit', '-30deg 78deg 105%');
    mv.setAttribute('min-camera-orbit', 'auto 15deg auto');
    mv.setAttribute('max-camera-orbit', 'auto 100deg auto');
    mv.setAttribute('disable-tap', '');

    let materials = null;
    const ready = new Promise(resolve => {
      mv.addEventListener('load', () => {
        materials = {};
        (mv.model?.materials || []).forEach(m => { materials[m.name] = m; });
        resolve();
      }, { once: true });
      mv.addEventListener('error', () => resolve(), { once: true });
    });

    container.innerHTML = '';
    container.appendChild(mv);
    await ready;

    function setColor(name, hex) {
      const m = materials?.[name];
      if (!m) return;
      const [r, g, b] = hexToLinear(hex);
      m.pbrMetallicRoughness.setBaseColorFactor([r, g, b, 1]);
    }

    return {
      setBodyColor(hex)  { setColor('body', hex); },
      setRimColor(hex)   { setColor('rim', hex); },
      setXenonColor(hex) {
        setColor('headlight', hex);
        const m = materials?.headlight;
        if (m) m.setEmissiveFactor(hexToLinear(hex));
      },
      setPearl(on) {
        const m = materials?.body;
        if (m) m.setIridescenceFactor(on ? 0.9 : 0.001);
      },
      dispose() {
        if (mv.parentNode) mv.parentNode.removeChild(mv);
        URL.revokeObjectURL(url);
      },
    };
  }

  window.initCarPreview3D = initCarPreview3D;
})();
