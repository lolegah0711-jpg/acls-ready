// 3D-Fahrzeug-Vorschau für die Preisliste (self-hosted, kein CDN).
//
// Basis-Fahrzeug: "Car Kit" von Kenney (www.kenney.nl), CC0 (Public
// Domain) -- public/vendor/models/car/sedan-sports.glb. Kein Markenlogo,
// keine Nachbildung eines realen Herstellermodells.
//
// Das Kit liefert Karosserie/Räder als separate Meshes, aber ALLE Meshes
// teilen sich eine einzige "Colormap"-Palettentextur (Kenney-typisch: je
// nach UV-Position wird eine flache Farbe aus einem Farbstreifen-Bild
// gesampelt, keine echte Oberflächentextur). Für eigenständig einfärbbare
// Lack-/Felgen-/Glas-Flächen wird die Textur einmalig per Canvas
// ausgelesen und jedes Dreieck anhand der an seiner UV-Mitte gesampelten
// Farbe einer Kategorie zugeordnet (Karosserielack / Fensterglas / dunkler
// Kunststoff / Chrom bzw. Reifen / Felge) und in eine eigene Material-
// Gruppe verschoben. Das Ergebnis wird per GLTFExporter einmalig in ein
// GLB exportiert (Blob-URL) und an Googles <model-viewer> übergeben, das
// die eigentliche Darstellung übernimmt (Environment-Reflexionen, weicher
// Bodenschatten, physikalisch korrektes Tone-Mapping, Kamera-Orbit inkl.
// sanftem Auto-Rotate).
//
// Materialien tragen feste Namen (body/rim/headlight), damit sie nach dem
// Laden über model-viewer.model.materials live umgefärbt werden können,
// ohne das Modell neu zu exportieren.
(function () {
  const MODEL_URL = '/vendor/models/car/sedan-sports.glb';

  let _modulesPromise = null;
  function loadModules() {
    if (!_modulesPromise) {
      _modulesPromise = Promise.all([
        import('/vendor/three/three.module.min.js'),
        import('/vendor/three/loaders/GLTFLoader.js'),
        import('/vendor/three/exporters/GLTFExporter.js'),
        import('/vendor/model-viewer/model-viewer.min.js'),
      ]).then(([THREE, load, exp]) => ({
        THREE, GLTFLoader: load.GLTFLoader, GLTFExporter: exp.GLTFExporter,
      }));
    }
    return _modulesPromise;
  }

  function hexToLinear(hex) {
    const c = String(hex).replace('#', '');
    const toLin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return [0, 2, 4].map(i => toLin(parseInt(c.slice(i, i + 2), 16) / 255));
  }

  // Liest die (bereits geladene) Palettentextur einmalig in ein Canvas ein
  // und gibt eine Funktion zurück, die die Farbe an einer UV-Koordinate
  // ausliest (0..1 -> Pixel).
  function makeSampler(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return (u, v) => {
      const x = Math.max(0, Math.min(canvas.width - 1, Math.round(u * (canvas.width - 1))));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.round(v * (canvas.height - 1))));
      const idx = (y * canvas.width + x) * 4;
      return [data[idx], data[idx + 1], data[idx + 2]];
    };
  }

  // Ordnet jedes Dreieck des Meshes anhand der an seiner UV-Mitte
  // gesampelten Farbe einer benannten Materialgruppe zu (classifyFn liefert
  // einen Schlüssel aus materialsByName) und teilt die Geometrie per
  // BufferGeometry-Gruppen entsprechend auf -- Standardtechnik für
  // Multi-Material-Meshes in Three.js, von GLTFExporter nativ unterstützt.
  function splitMeshByColor(mesh, sampler, classifyFn, materialsByName) {
    const geo = mesh.geometry;
    const uv = geo.attributes.uv.array;
    const srcIndex = geo.index.array;
    const buckets = new Map();
    for (let t = 0; t < srcIndex.length; t += 3) {
      const i0 = srcIndex[t], i1 = srcIndex[t + 1], i2 = srcIndex[t + 2];
      const u = (uv[i0 * 2] + uv[i1 * 2] + uv[i2 * 2]) / 3;
      const v = (uv[i0 * 2 + 1] + uv[i1 * 2 + 1] + uv[i2 * 2 + 1]) / 3;
      const [r, g, b] = sampler(u, v);
      const key = classifyFn(r, g, b);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(i0, i1, i2);
    }
    const names = Object.keys(materialsByName).filter(n => buckets.has(n));
    const newIndex = [];
    geo.clearGroups();
    let offset = 0;
    names.forEach((name, matIdx) => {
      const idxs = buckets.get(name);
      newIndex.push(...idxs);
      geo.addGroup(offset, idxs.length, matIdx);
      offset += idxs.length;
    });
    geo.setIndex(newIndex);
    mesh.material = names.map(n => materialsByName[n]);
  }

  // b-r stark negativ (rot dominiert blau) -> Lack, egal welche Farbe die
  // Karosserie im Ausgangsmodell hat. Der Rest wird nach Helligkeit sortiert:
  // sehr dunkel = Kunststoff/Verkleidung, sehr hell = Chrom, dazwischen =
  // (bläulich getöntes) Fensterglas.
  function classifyBody(r, g, b) {
    if (b - r < -40) return 'body';
    const bright = (r + g + b) / 3;
    if (bright < 75) return 'trim';
    if (bright > 190) return 'chrome';
    return 'glass';
  }
  function classifyWheel(r, g, b) {
    return (r + g + b) / 3 > 100 ? 'rim' : 'tire';
  }

  function addBox(THREE, scene, mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  async function buildCarScene(THREE, GLTFLoader) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(MODEL_URL);
    const scene = gltf.scene;

    const bodyNode = scene.getObjectByName('body');
    const sourceTexture = Array.isArray(bodyNode.material) ? bodyNode.material[0].map : bodyNode.material.map;
    const sampler = makeSampler(sourceTexture.image);

    const bodyMat = new THREE.MeshPhysicalMaterial({
      name: 'body', color: 0xf97316, roughness: 0.32, metalness: 0.55,
      clearcoat: 1, clearcoatRoughness: 0.12,
      iridescence: 0.001, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 400],
    });
    const glassMat  = new THREE.MeshPhysicalMaterial({ name: 'glass', color: 0x16202b, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.55 });
    const trimMat   = new THREE.MeshStandardMaterial({ name: 'trim', color: 0x1c1e22, roughness: 0.7, metalness: 0.2 });
    const chromeMat = new THREE.MeshStandardMaterial({ name: 'chrome', color: 0xe8ecf0, roughness: 0.25, metalness: 0.9 });
    const rimMat    = new THREE.MeshStandardMaterial({ name: 'rim', color: 0xc7ccd1, roughness: 0.28, metalness: 0.85 });
    const tireMat   = new THREE.MeshStandardMaterial({ name: 'tire', color: 0x161616, roughness: 0.92, metalness: 0.05 });
    const headMat   = new THREE.MeshStandardMaterial({ name: 'headlight', color: 0xfef9c3, emissive: 0xfef9c3, emissiveIntensity: 0.6, roughness: 0.3 });
    const tailMat   = new THREE.MeshStandardMaterial({ name: 'taillight', color: 0x7f1d1d, emissive: 0x7f1d1d, emissiveIntensity: 0.5, roughness: 0.4 });

    const bodyMaterials = { body: bodyMat, glass: glassMat, trim: trimMat, chrome: chromeMat };
    splitMeshByColor(bodyNode, sampler, classifyBody, bodyMaterials);
    const spoilerNode = scene.getObjectByName('spoiler');
    if (spoilerNode) splitMeshByColor(spoilerNode, sampler, classifyBody, bodyMaterials);

    const wheelMaterials = { rim: rimMat, tire: tireMat };
    ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'].forEach(name => {
      const w = scene.getObjectByName(name);
      if (w) splitMeshByColor(w, sampler, classifyWheel, wheelMaterials);
    });

    // Kleine Scheinwerfer-/Rücklicht-Akzente vorne/hinten am Modell ergänzen
    // (das Kit selbst hat keine dedizierte Leuchtengeometrie).
    [0.42, -0.42].forEach(x => addBox(THREE, scene, headMat, 0.10, 0.09, 0.05, x, 0.40, 1.16));
    [0.42, -0.42].forEach(x => addBox(THREE, scene, tailMat, 0.10, 0.09, 0.05, x, 0.40, -1.16));

    return scene;
  }

  async function initCarPreview3D(container) {
    const { THREE, GLTFLoader, GLTFExporter } = await loadModules();
    if (!container.isConnected) return null; // Nutzer hat inzwischen die Seite gewechselt

    let scene;
    try { scene = await buildCarScene(THREE, GLTFLoader); }
    catch (e) { console.error('[Farbvorschau] Modell konnte nicht geladen werden:', e); return null; }
    if (!container.isConnected) return null;

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
    mv.setAttribute('camera-orbit', '-30deg 78deg 75%');
    mv.setAttribute('min-camera-orbit', 'auto 15deg 55%');
    mv.setAttribute('max-camera-orbit', 'auto 100deg 105%');
    mv.setAttribute('field-of-view', '25deg');
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
