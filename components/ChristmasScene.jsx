"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

// Gerador pseudoaleatório com semente, para a árvore ficar igual a cada carregamento
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Silhueta da árvore
const TREE_BOTTOM = 0.75; // altura dos galhos mais baixos
const TREE_TOP = 5.6; // ponta da árvore
const MAX_RADIUS = 2.3; // raio dos galhos de baixo

// Raio da copa em uma altura y (forma de pinheiro levemente côncava)
function radiusAt(y) {
  const s = THREE.MathUtils.clamp((y - TREE_BOTTOM) / (TREE_TOP - TREE_BOTTOM), 0, 1);
  return MAX_RADIUS * Math.pow(1 - s, 1.08);
}

const ORNAMENT_COLORS = ["#b3121b", "#d4a017", "#8e0e14", "#e0b84a", "#c41e3a", "#c9a227", "#c0c0c0"];

/* ---------- Galhos: ramos de pinheiro com textura de agulhas ---------- */

// Desenha um ramo de pinheiro (caule + agulhas) num canvas, com fundo transparente
function makeFrondTexture() {
  const W = 256;
  const H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  const rand = seededRandom(2024);
  const cx = W / 2;
  const bottom = H - 6;
  const top = 8;
  g.lineCap = "round";

  // agulhas: mais longas no meio do ramo, curtas na base e na ponta
  for (let i = 0; i < 420; i++) {
    const t = rand();
    const y = bottom - t * (bottom - top);
    const profile = Math.pow(1 - t, 0.55) * Math.min(1, 0.45 + t * 3);
    const len = 112 * profile * (0.7 + rand() * 0.35);
    const side = rand() < 0.5 ? -1 : 1;
    const ang = ((38 + rand() * 28) * Math.PI) / 180; // inclinadas para a ponta
    const dx = side * Math.sin(ang) * len;
    const dy = -Math.cos(ang) * len;
    const light = 16 + rand() * 22;
    g.strokeStyle = `hsl(${128 + rand() * 22}, ${42 + rand() * 18}%, ${light}%)`;
    g.lineWidth = 1.6 + rand() * 2;
    g.beginPath();
    g.moveTo(cx + side * 1.5, y);
    // leve curvatura em cada agulha
    g.quadraticCurveTo(cx + dx * 0.55, y + dy * 0.45 - 3, cx + dx, y + dy);
    g.stroke();
  }

  // pontas mais claras (brotos novos)
  for (let i = 0; i < 90; i++) {
    const t = 0.55 + rand() * 0.45;
    const y = bottom - t * (bottom - top);
    const len = 50 * (1 - t) + 10;
    const side = rand() < 0.5 ? -1 : 1;
    const ang = ((30 + rand() * 25) * Math.PI) / 180;
    g.strokeStyle = `hsl(${105 + rand() * 20}, 45%, ${36 + rand() * 12}%)`;
    g.lineWidth = 1.4 + rand();
    g.beginPath();
    g.moveTo(cx, y);
    g.lineTo(cx + side * Math.sin(ang) * len, y - Math.cos(ang) * len);
    g.stroke();
  }

  // caule afinando até a ponta
  for (let k = 0; k < 24; k++) {
    const t0 = k / 24;
    const t1 = (k + 1) / 24;
    g.strokeStyle = "#4a3320";
    g.lineWidth = 6 * (1 - t0) + 1;
    g.beginPath();
    g.moveTo(cx, bottom - t0 * (bottom - top));
    g.lineTo(cx, bottom - t1 * (bottom - top));
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Plano curvado: o ramo cai em arco e as laterais descem um pouco
function makeFrondGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 6, 10);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, -0.28 * y * y - Math.abs(x) * 0.35);
  }
  geo.computeVertexNormals();
  return geo;
}

const FROND_TINTS = ["#ffffff", "#e4eedc", "#cfdcc6", "#f0f5e2", "#bfcfb6"];

// Gera (uma única vez) os ramos e os pontos de fixação de lâmpadas e bolas
let treeCache = null;
function getTreeData() {
  if (treeCache) return treeCache;
  const anchors = [];
  const rand = seededRandom(1234);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const list = [];

  const addFrond = (base, dir, length, roll, width = 0.62, main = false) => {
    const y = dir.clone().normalize();
    let z = worldUp.clone().addScaledVector(y, -worldUp.dot(y));
    if (z.lengthSq() < 1e-4) z = new THREE.Vector3(0, 0, 1);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    const basis = new THREE.Matrix4().makeBasis(x, y, z);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(y, roll));
    list.push({
      pos: base.clone(),
      quat: q,
      scale: new THREE.Vector3(length * width, length, length * 0.7),
      tint: FROND_TINTS[Math.floor(rand() * FROND_TINTS.length)],
    });

    // pontos sobre a superfície dos ramos principais, onde vão lâmpadas e bolas
    if (main) {
      const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const az = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      for (const t of [0.5, 0.65, 0.8]) {
        const p = base
          .clone()
          .addScaledVector(ay, t * length)
          .addScaledVector(az, -0.28 * t * t * length * 0.7);
        const out = new THREE.Vector3(p.x, 0, p.z).normalize();
        const top = p.clone().addScaledVector(az, 0.035).addScaledVector(out, 0.02);
        const under = p.clone().addScaledVector(az, -0.06);
        anchors.push({
          top,
          under,
          h: top.y,
          ang: Math.atan2(top.z, top.x),
          r: Math.hypot(top.x, top.z),
          t,
        });
      }
    }
  };

  let whorl = 0;
  for (let y = TREE_BOTTOM; y < TREE_TOP - 0.2; y += 0.115, whorl++) {
    const R = radiusAt(y);
    const s = (y - TREE_BOTTOM) / (TREE_TOP - TREE_BOTTOM);
    const count = Math.max(6, Math.round(R * 8));
    const droop = 0.1 + (1 - s) * 0.3;

    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2 + whorl * golden + (rand() - 0.5) * 0.35;
      const d = droop + (rand() - 0.5) * 0.14;
      const dir = new THREE.Vector3(
        Math.cos(theta) * Math.cos(d),
        -Math.sin(d),
        Math.sin(theta) * Math.cos(d)
      ).normalize();
      const L = R * (0.95 + rand() * 0.18) + 0.2;
      const base = new THREE.Vector3(0, y + (rand() - 0.5) * 0.05, 0);

      // ramo principal
      addFrond(base, dir, L, (rand() - 0.5) * 0.4, 0.62, true);

      // ramos laterais saindo do principal, para dar volume
      const side = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
      const subs = L > 1 ? 4 : 2;
      for (let k = 0; k < subs; k++) {
        const f = 0.25 + (k / subs) * 0.5 + rand() * 0.08;
        const p = base.clone().addScaledVector(dir, L * f * 0.85);
        const sign = k % 2 === 0 ? 1 : -1;
        const dir2 = dir
          .clone()
          .multiplyScalar(0.75)
          .addScaledVector(side, sign * (0.5 + rand() * 0.25))
          .add(new THREE.Vector3(0, -0.05 - rand() * 0.15, 0))
          .normalize();
        addFrond(p, dir2, L * (0.45 - f * 0.15), sign * 0.35, 0.58);
      }
    }

    // ramos internos mais curtos e levemente para cima, preenchendo a copa
    for (let i = 0; i < count; i++) {
      const theta = ((i + 0.5) / count) * Math.PI * 2 + whorl * golden;
      const dir = new THREE.Vector3(Math.cos(theta), 0.12 + rand() * 0.15, Math.sin(theta)).normalize();
      addFrond(new THREE.Vector3(0, y + 0.06, 0), dir, R * 0.78 + 0.15, (rand() - 0.5) * 0.6);
    }
  }

  // ponta da árvore: alguns ramos apontando para cima
  for (let i = 0; i < 5; i++) {
    const theta = (i / 5) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(theta) * 0.35, 1, Math.sin(theta) * 0.35).normalize();
    addFrond(new THREE.Vector3(0, TREE_TOP - 0.55, 0), dir, 0.55, 0, 0.5);
  }


  // --- contorno real da copa: raio máximo dos ramos por faixa de altura e direção ---
  const H_STEP = 0.15;
  const A_BINS = 18;
  const env = new Map();
  for (const an of anchors) {
    if (an.t < 0.8) continue;
    const hb = Math.floor(an.h / H_STEP);
    const ab = Math.floor(((an.ang + Math.PI) / (Math.PI * 2)) * A_BINS) % A_BINS;
    const key = hb + "_" + ab;
    env.set(key, Math.max(env.get(key) || 0, an.r));
  }
  const envR = (h, ang) => {
    const hb = Math.floor(h / H_STEP);
    const ab = Math.floor(((Math.atan2(Math.sin(ang), Math.cos(ang)) + Math.PI) / (Math.PI * 2)) * A_BINS) % A_BINS;
    let sum = 0;
    let w = 0;
    for (let dh = -1; dh <= 1; dh++) {
      for (let da = -1; da <= 1; da++) {
        const v = env.get(hb + dh + "_" + ((ab + da + A_BINS) % A_BINS));
        if (v === undefined) continue;
        const weight = dh === 0 && da === 0 ? 2 : 1;
        sum += v * weight;
        w += weight;
      }
    }
    return w > 0 ? sum / w : radiusAt(h) * 0.8;
  };
  const heights = anchors.map((an) => an.h).sort((x, y) => x - y);
  const minH = heights[Math.floor(heights.length * 0.04)];
  const maxH = heights[Math.floor(heights.length * 0.97)];

  // --- pisca-pisca: fio em espiral com "barrigas" entre os pontos onde está preso ---
  const LIGHT_COUNT = 260;
  const TURNS = 8;
  const HANGS_PER_TURN = 5;
  const wirePoints = [];
  const lights = [];
  const SAMPLES = LIGHT_COUNT * 3;
  for (let i = 0; i <= SAMPLES; i++) {
    const s = i / SAMPLES;
    const ang = s * Math.PI * 2 * TURNS;
    const frac = ((s * TURNS * HANGS_PER_TURN) % 1 + 1) % 1;
    const y = minH + 0.08 + s * (maxH - minH - 0.15) - 0.07 * Math.sin(frac * Math.PI);
    const r = envR(y, ang) * 0.99 + 0.03;
    const p = new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r);
    wirePoints.push(p);
    if (i % 3 === 0) lights.push({ position: p, phase: rand() * Math.PI * 2 });
  }

  // --- bolas espalhadas na superfície, majoritariamente vermelhas e douradas ---
  const ornaments = [];
  const ORNAMENT_COUNT = 64;
  for (let i = 0; i < ORNAMENT_COUNT; i++) {
    const s = (i + 0.5) / ORNAMENT_COUNT;
    const y = minH + 0.15 + Math.pow(s, 0.85) * (maxH - minH - 0.6);
    const ang = i * golden * 1.7 + rand() * 0.3;
    const size = 0.085 + rand() * 0.045 - s * 0.02;
    const r = envR(y, ang) * 0.97 + size * 0.4;
    ornaments.push({
      position: [Math.cos(ang) * r, y - 0.04, Math.sin(ang) * r],
      color: ORNAMENT_COLORS[Math.floor(rand() * ORNAMENT_COLORS.length)],
      size,
    });
  }

  treeCache = { fronds: list, lights, ornaments, wirePoints };
  return treeCache;
}

function Branches() {
  const ref = useRef();
  const texture = useMemo(() => makeFrondTexture(), []);
  const geometry = useMemo(() => makeFrondGeometry(), []);
  const depthMaterial = useMemo(
    () =>
      new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: texture,
        alphaTest: 0.5,
      }),
    [texture]
  );

  const instances = useMemo(() => getTreeData().fronds, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    instances.forEach((inst, i) => {
      m.compose(inst.pos, inst.quat, inst.scale);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(inst.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.needsUpdate = true;
  }, [instances]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, instances.length]}
      customDepthMaterial={depthMaterial}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        map={texture}
        alphaTest={0.5}
        side={THREE.DoubleSide}
        roughness={0.8}
        metalness={0}
      />
    </instancedMesh>
  );
}

function Trunk() {
  return (
    <group>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 0.9, 14]} />
        <meshStandardMaterial color="#4a2f1b" roughness={0.95} />
      </mesh>
      {/* tronco interno que sobe pela copa */}
      <mesh position={[0, 2.9, 0]}>
        <cylinderGeometry args={[0.04, 0.16, 4.4, 10]} />
        <meshStandardMaterial color="#3d2716" roughness={0.95} />
      </mesh>
      {/* preenchimento escuro para não ver "buracos" entre os galhos */}
      <mesh position={[0, (TREE_BOTTOM + TREE_TOP) / 2 - 0.1, 0]}>
        <coneGeometry args={[MAX_RADIUS * 0.72, TREE_TOP - TREE_BOTTOM, 32]} />
        <meshStandardMaterial color="#173d22" roughness={1} />
      </mesh>
    </group>
  );
}

/* ---------- Estrela lapidada com halo ---------- */

// Estrela de 5 pontas com faces lapidadas (como um cristal), afinando nas pontas
function makeStarGeometry(outer = 0.4, inner = 0.17, depth = 0.13) {
  const ring = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    ring.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const front = new THREE.Vector3(0, 0, depth);
  const back = new THREE.Vector3(0, 0, -depth);
  const verts = [];
  for (let i = 0; i < 10; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 10];
    verts.push(front.x, front.y, front.z, a.x, a.y, a.z, b.x, b.y, b.z);
    verts.push(back.x, back.y, back.z, b.x, b.y, b.z, a.x, a.y, a.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

// Textura de brilho suave (gradiente radial) para o halo
function makeGlowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 236, 180, 0.9)");
  grad.addColorStop(0.2, "rgba(255, 210, 120, 0.45)");
  grad.addColorStop(0.5, "rgba(255, 180, 80, 0.12)");
  grad.addColorStop(1, "rgba(255, 160, 60, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function TopStar() {
  const starRef = useRef();
  const glowRef = useRef();
  const starGeo = useMemo(() => makeStarGeometry(), []);
  const glowTex = useMemo(() => makeGlowTexture(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (starRef.current) {
      starRef.current.rotation.y = t * 0.45;
      starRef.current.material.emissiveIntensity = 0.55 + Math.sin(t * 2) * 0.15;
    }
    if (glowRef.current) {
      const s = 1.7 + Math.sin(t * 2) * 0.12;
      glowRef.current.scale.set(s, s, 1);
    }
  });

  return (
    <group position={[0, TREE_TOP + 0.32, 0]}>
      {/* haste que prende a estrela na ponta */}
      <mesh position={[0, -0.32, 0]}>
        <cylinderGeometry args={[0.025, 0.04, 0.3, 10]} />
        <meshStandardMaterial color="#c9a347" metalness={1} roughness={0.3} />
      </mesh>

      <mesh ref={starRef} geometry={starGeo} castShadow>
        <meshPhysicalMaterial
          color="#f2c94c"
          emissive="#ffae35"
          emissiveIntensity={0.55}
          metalness={1}
          roughness={0.18}
          clearcoat={1}
          clearcoatRoughness={0.1}
          flatShading
        />
      </mesh>

      <sprite ref={glowRef} scale={[1.7, 1.7, 1]}>
        <spriteMaterial
          map={glowTex}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>

      <pointLight color="#ffcf80" intensity={4} distance={4.5} decay={2} />
    </group>
  );
}

/* ---------- Bolas de vidro/metal ---------- */

function Ornament({ position, color, size }) {
  return (
    <group position={position}>
      {/* gancho */}
      <mesh position={[0, size + 0.02, 0]}>
        <cylinderGeometry args={[size * 0.25, size * 0.25, size * 0.3, 10]} />
        <meshStandardMaterial color="#c8b27a" metalness={1} roughness={0.3} />
      </mesh>
      <mesh castShadow>
        <sphereGeometry args={[size, 32, 32]} />
        <meshPhysicalMaterial
          color={color}
          metalness={0.85}
          roughness={0.12}
          clearcoat={1}
          clearcoatRoughness={0.05}
        />
      </mesh>
    </group>
  );
}

function Ornaments() {
  const ornaments = useMemo(() => getTreeData().ornaments, []);
  return ornaments.map((o, i) => <Ornament key={i} {...o} />);
}

/* ---------- Pisca-pisca de luz quente, preso aos ramos ---------- */

function makeBulbGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.12, "rgba(255, 240, 200, 0.85)");
  grad.addColorStop(0.35, "rgba(255, 200, 120, 0.25)");
  grad.addColorStop(1, "rgba(255, 170, 80, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function FairyLights() {
  const bulbsRef = useRef();
  const glowRef = useRef();
  const lights = useMemo(() => getTreeData().lights, []);
  const count = lights.length;
  const wireGeo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(getTreeData().wirePoints);
    return new THREE.TubeGeometry(curve, getTreeData().wirePoints.length * 2, 0.007, 5, false);
  }, []);
  const glowTex = useMemo(() => makeBulbGlowTexture(), []);
  const warm = useMemo(() => new THREE.Color("#ffd8a0"), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  const { glowPositions, glowColors } = useMemo(() => {
    const glowPositions = new Float32Array(count * 3);
    const glowColors = new Float32Array(count * 3);
    lights.forEach((l, i) => {
      glowPositions[i * 3] = l.position.x;
      glowPositions[i * 3 + 1] = l.position.y;
      glowPositions[i * 3 + 2] = l.position.z;
    });
    return { glowPositions, glowColors };
  }, [lights, count]);

  useLayoutEffect(() => {
    const mesh = bulbsRef.current;
    const m = new THREE.Matrix4();
    lights.forEach((l, i) => {
      m.makeTranslation(l.position.x, l.position.y, l.position.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, warm);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.needsUpdate = true;
  }, [lights, warm]);

  // cintilar suave: cada lâmpada oscila no seu próprio ritmo
  useFrame((state) => {
    const mesh = bulbsRef.current;
    const glow = glowRef.current;
    if (!mesh || !glow) return;
    const t = state.clock.elapsedTime;
    const colors = glow.geometry.attributes.color.array;
    for (let i = 0; i < count; i++) {
      const ph = lights[i].phase;
      const k = 0.7 + 0.3 * Math.sin(t * 1.6 + ph) * Math.sin(t * 0.55 + ph * 1.7);
      mesh.setColorAt(i, tmp.copy(warm).multiplyScalar(2 + 1.5 * k));
      colors[i * 3] = warm.r * k * 1.3;
      colors[i * 3 + 1] = warm.g * k * 1.3;
      colors[i * 3 + 2] = warm.b * k * 1.3;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    glow.geometry.attributes.color.needsUpdate = true;
  });

  return (
    <group>
      {/* fio do pisca-pisca */}
      <mesh geometry={wireGeo}>
        <meshStandardMaterial color="#1c2e1a" roughness={0.6} metalness={0.2} />
      </mesh>

      {/* lâmpada */}
      <instancedMesh ref={bulbsRef} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* halo de luz em volta de cada lâmpada */}
      <points ref={glowRef} renderOrder={2}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[glowPositions, 3]} />
          <bufferAttribute attach="attributes-color" args={[glowColors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={glowTex}
          size={0.4}
          sizeAttenuation
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/* ---------- Presentes, saia da árvore, chão e neve ---------- */

function Present({ position, size, color, ribbon, rotation = 0 }) {
  const [w, h, d] = size;
  return (
    <group position={[position[0], h / 2, position[2]]} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh>
        <boxGeometry args={[w * 0.14, h + 0.01, d + 0.01]} />
        <meshStandardMaterial color={ribbon} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh>
        <boxGeometry args={[w + 0.01, h + 0.01, d * 0.14]} />
        <meshStandardMaterial color={ribbon} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* laço */}
      <mesh position={[0, h / 2 + 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[w * 0.12, w * 0.04, 8, 16]} />
        <meshStandardMaterial color={ribbon} metalness={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Presents() {
  return (
    <group>
      <Present position={[1.5, 0, 1.3]} size={[0.6, 0.45, 0.6]} color="#8b1e2b" ribbon="#d4af37" rotation={0.4} />
      <Present position={[-1.4, 0, 1.5]} size={[0.5, 0.38, 0.5]} color="#1f3b5c" ribbon="#e5e5e5" rotation={-0.3} />
      <Present position={[0.25, 0, 2.05]} size={[0.42, 0.32, 0.42]} color="#e8e1d3" ribbon="#a4161a" rotation={0.9} />
      <Present position={[-1.9, 0, -0.5]} size={[0.55, 0.55, 0.55]} color="#2f5d3a" ribbon="#d4af37" rotation={0.2} />
      <Present position={[1.95, 0, -0.4]} size={[0.4, 0.3, 0.4]} color="#6d2e46" ribbon="#e5e5e5" rotation={-0.6} />
    </group>
  );
}

function TreeSkirt() {
  return (
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[1.25, 48]} />
      <meshStandardMaterial color="#7a1420" roughness={0.95} />
    </mesh>
  );
}

/* ---------- Chão de neve com relevo ---------- */

// Ruído suave 2D (value noise) com semente, somado em várias escalas (fbm)
function makeNoise(seed) {
  const rand = seededRandom(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rand();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const smooth = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
  const noise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = v(xi, yi);
    const b = v(xi + 1, yi);
    const c = v(xi, yi + 1);
    const d = v(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * (noise(x * freq, y * freq) - 0.5);
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum;
  };
}

const snowNoise = makeNoise(77);

// Altura da neve em (x, z): plana perto da árvore, com montes e ondulações mais longe
function snowHeight(x, z) {
  const d = Math.hypot(x, z);
  const far = THREE.MathUtils.smoothstep(d, 2.8, 7);
  const dunes = snowNoise(x * 0.12, z * 0.12, 4) * 2.6 + Math.max(0, snowNoise(x * 0.05 + 9, z * 0.05, 2)) * 3;
  const ripples = snowNoise(x * 0.9, z * 0.9, 3) * 0.12;
  const fine = snowNoise(x * 3.5, z * 3.5, 2) * 0.025;
  return far * (dunes + ripples) + fine * (0.4 + far);
}

// Textura granulada da neve (cor + relevo fino)
function makeSnowGrainTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, size, size);
  const rand = seededRandom(5);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 1.8;
    const shade = 205 + Math.floor(rand() * 45);
    g.fillStyle = `rgba(${shade - 8}, ${shade - 3}, ${shade + 10 > 255 ? 255 : shade + 10}, ${0.25 + rand() * 0.4})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // marcas suaves de vento
  for (let i = 0; i < 60; i++) {
    const y = rand() * size;
    g.strokeStyle = `rgba(190, 200, 220, ${0.05 + rand() * 0.08})`;
    g.lineWidth = 1 + rand() * 3;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(size * 0.3, y + (rand() - 0.5) * 40, size * 0.7, y + (rand() - 0.5) * 40, size, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 8;
  return tex;
}

function Ground() {
  const grain = useMemo(() => makeSnowGrainTexture(), []);

  const geometry = useMemo(() => {
    const size = 44;
    const seg = 220;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const deep = new THREE.Color("#b9c6dc"); // vales azulados
    const high = new THREE.Color("#f7f9fc"); // topos claros
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = snowHeight(x, z);
      pos.setY(i, h);
      const k = THREE.MathUtils.clamp(0.55 + h * 0.35, 0, 1);
      c.copy(deep).lerp(high, k);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial
        vertexColors
        map={grain}
        bumpMap={grain}
        bumpScale={0.6}
        roughness={0.92}
        metalness={0}
      />
    </mesh>
  );
}

// Cristais de gelo cintilando na superfície da neve
function SnowGlitter({ count = 1400 }) {
  const ref = useRef();
  const glowTex = useMemo(() => makeRoundTexture(), []);
  const { positions, colors, phases } = useMemo(() => {
    const rand = seededRandom(31);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 1.3 + Math.sqrt(rand()) * 12;
      const a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      positions[i * 3] = x;
      positions[i * 3 + 1] = snowHeight(x, z) + 0.015;
      positions[i * 3 + 2] = z;
      phases[i] = rand() * Math.PI * 2;
    }
    return { positions, colors, phases };
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const arr = ref.current.geometry.attributes.color.array;
    for (let i = 0; i < count; i++) {
      const k = Math.max(0, Math.sin(t * 1.3 + phases[i] * 3)) ** 8;
      arr[i * 3] = k * 0.9;
      arr[i * 3 + 1] = k * 0.95;
      arr[i * 3 + 2] = k;
    }
    ref.current.geometry.attributes.color.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={glowTex}
        size={0.07}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

// Textura redonda e suave, usada nos flocos e nos cristais (evita "quadradinhos")
function makeRoundTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function Snow({ count = 2200 }) {
  const ref = useRef();
  const flakeTex = useMemo(() => makeRoundTexture(), []);
  const { positions, speeds } = useMemo(() => {
    const rand = seededRandom(7);
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 26;
      positions[i * 3 + 1] = rand() * 14;
      positions[i * 3 + 2] = (rand() - 0.5) * 26;
      speeds[i] = 0.25 + rand() * 0.5;
    }
    return { positions, speeds };
  }, [count]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= speeds[i] * delta;
      arr[i * 3] += Math.sin(t * 0.8 + i) * 0.0025;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 14;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={flakeTex}
        color="#ffffff"
        size={0.08}
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  );
}

/* ---------- Cena ---------- */

export default function ChristmasScene() {
  return (
    <div className="scene">
      <Canvas
        shadows
        camera={{ position: [6, 4, 8], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={["#060a1a"]} />
        <fog attach="fog" args={["#060a1a", 14, 38]} />

        {/* reflexos gerados localmente (sem baixar HDR) para as bolas e a estrela */}
        <Environment resolution={256}>
          <Lightformer intensity={2} color="#ffd9a0" position={[0, 4, 5]} scale={[6, 3, 1]} />
          <Lightformer intensity={1} color="#9fb4ff" position={[-5, 3, -3]} scale={[4, 4, 1]} />
          <Lightformer intensity={0.8} color="#ffffff" position={[5, 6, -2]} scale={[3, 3, 1]} />
        </Environment>

        <hemisphereLight args={["#a9b8ff", "#2a2233", 0.35]} />
        <directionalLight
          position={[4, 9, 5]}
          intensity={0.9}
          color="#c9d4ff"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={8}
          shadow-camera-bottom={-2}
          shadow-bias={-0.0005}
        />
        {/* brilho quente do pisca-pisca sobre a árvore */}
        <pointLight position={[0, 2.2, 2.2]} intensity={7} distance={6} color="#ffb565" />
        <pointLight position={[1.8, 1.2, -1.2]} intensity={4} distance={5} color="#ffb565" />
        <pointLight position={[-1.8, 1.4, -0.6]} intensity={4} distance={5} color="#ffb565" />
        <pointLight position={[0, 3.5, -2.5]} intensity={3} distance={6} color="#ffb565" />

        <Stars radius={60} depth={40} count={3000} factor={4} fade speed={0.5} />

        <group position={[0, -2.4, 0]}>
          <Trunk />
          <Branches />
          <TopStar />
          <Ornaments />
          <FairyLights />
          <TreeSkirt />
          <Presents />
          <Ground />
          <SnowGlitter />
          <Snow />
        </group>

        <OrbitControls
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.6}
          minDistance={5}
          maxDistance={18}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.1}
          target={[0, 0.4, 0]}
        />
      </Canvas>
    </div>
  );
}
