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

const ORNAMENT_COLORS = ["#a4161a", "#c9a227", "#d9d9d9", "#7a0c1e", "#b8860b", "#8d99ae"];

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

  const instances = useMemo(() => {
    const rand = seededRandom(1234);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const list = [];

    const addFrond = (base, dir, length, roll, width = 0.62) => {
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
    };

    let whorl = 0;
    for (let y = TREE_BOTTOM; y < TREE_TOP - 0.2; y += 0.13, whorl++) {
      const R = radiusAt(y);
      const s = (y - TREE_BOTTOM) / (TREE_TOP - TREE_BOTTOM);
      const count = Math.max(5, Math.round(R * 6.5));
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
        addFrond(base, dir, L, (rand() - 0.5) * 0.4);

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
        addFrond(new THREE.Vector3(0, y + 0.06, 0), dir, R * 0.65 + 0.15, (rand() - 0.5) * 0.6);
      }
    }

    // ponta da árvore: alguns ramos apontando para cima
    for (let i = 0; i < 5; i++) {
      const theta = (i / 5) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(theta) * 0.35, 1, Math.sin(theta) * 0.35).normalize();
      addFrond(new THREE.Vector3(0, TREE_TOP - 0.55, 0), dir, 0.55, 0, 0.5);
    }

    return list;
  }, []);

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
        <coneGeometry args={[MAX_RADIUS * 0.62, TREE_TOP - TREE_BOTTOM, 24]} />
        <meshStandardMaterial color="#0f2a18" roughness={1} />
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
  const ornaments = useMemo(() => {
    const rand = seededRandom(42);
    const list = [];
    const total = 46;
    for (let i = 0; i < total; i++) {
      const y = TREE_BOTTOM + 0.2 + rand() * (TREE_TOP - TREE_BOTTOM - 0.9);
      const angle = i * 2.399 + rand() * 0.4; // ângulo de ouro: espalha bem
      const r = radiusAt(y) * 0.92;
      const size = 0.08 + rand() * 0.05;
      list.push({
        position: [Math.cos(angle) * r, y - 0.08, Math.sin(angle) * r],
        color: ORNAMENT_COLORS[Math.floor(rand() * ORNAMENT_COLORS.length)],
        size,
      });
    }
    return list;
  }, []);

  return ornaments.map((o, i) => <Ornament key={i} {...o} />);
}

/* ---------- Pisca-pisca de luz quente ---------- */

function FairyLights() {
  const ref = useRef();
  const count = 220;

  const { positions, phases } = useMemo(() => {
    const rand = seededRandom(99);
    const positions = [];
    const phases = new Float32Array(count);
    const turns = 7.5;
    for (let i = 0; i < count; i++) {
      const s = i / count;
      const y = TREE_BOTTOM + 0.05 + s * (TREE_TOP - TREE_BOTTOM - 0.35);
      const angle = s * Math.PI * 2 * turns;
      // leve "barriga" do fio entre os galhos
      const sag = Math.sin(s * Math.PI * 2 * turns * 3) * 0.04;
      const r = radiusAt(y) * 0.93 + 0.02;
      positions.push(new THREE.Vector3(Math.cos(angle) * r, y + sag, Math.sin(angle) * r));
      phases[i] = rand() * Math.PI * 2;
    }
    return { positions, phases };
  }, []);

  const warm = useMemo(() => new THREE.Color("#ffd28a"), []);
  const tmp = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => {
      m.makeTranslation(p.x, p.y, p.z);
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, warm);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.material.needsUpdate = true;
  }, [positions, warm]);

  // cintilar suave, como lâmpadas de verdade
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const k = 0.65 + 0.35 * Math.sin(t * 1.8 + phases[i]) * Math.sin(t * 0.7 + phases[i] * 2);
      ref.current.setColorAt(i, tmp.copy(warm).multiplyScalar(2.2 * k));
    }
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.028, 8, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
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

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[14, 64]} />
      <meshStandardMaterial color="#dfe6f0" roughness={1} />
    </mesh>
  );
}

function Snow({ count = 1800 }) {
  const ref = useRef();
  const { positions, speeds } = useMemo(() => {
    const rand = seededRandom(7);
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 24;
      positions[i * 3 + 1] = rand() * 14;
      positions[i * 3 + 2] = (rand() - 0.5) * 24;
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
      <pointsMaterial color="#ffffff" size={0.05} transparent opacity={0.8} depthWrite={false} />
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
        <fog attach="fog" args={["#060a1a", 13, 32]} />

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
        <pointLight position={[0, 2.5, 2.5]} intensity={5} distance={7} color="#ffb565" />
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
