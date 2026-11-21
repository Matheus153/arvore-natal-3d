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

const NEEDLE_COLORS = ["#1d4a2a", "#24583a", "#2c6a42", "#1a3f26", "#326f45", "#22513a"];
const ORNAMENT_COLORS = ["#a4161a", "#c9a227", "#d9d9d9", "#7a0c1e", "#b8860b", "#8d99ae"];

/* ---------- Galhos (milhares de instâncias de "tufos" de agulhas) ---------- */

function Branches() {
  const ref = useRef();

  const instances = useMemo(() => {
    const rand = seededRandom(1234);
    const up = new THREE.Vector3(0, 1, 0);
    const list = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    let whorl = 0;

    for (let y = TREE_BOTTOM; y < TREE_TOP - 0.15; y += 0.11, whorl++) {
      const R = radiusAt(y);
      const s = (y - TREE_BOTTOM) / (TREE_TOP - TREE_BOTTOM);
      const count = Math.max(5, Math.round(R * 7));
      const droop = 0.12 + (1 - s) * 0.35; // galhos de baixo caem mais

      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2 + whorl * golden + (rand() - 0.5) * 0.4;
        const d = droop + (rand() - 0.5) * 0.15;
        const dir = new THREE.Vector3(
          Math.cos(theta) * Math.cos(d),
          -Math.sin(d),
          Math.sin(theta) * Math.cos(d)
        ).normalize();
        const L = R * (0.88 + rand() * 0.2) + 0.15;
        const base = new THREE.Vector3(0, y + (rand() - 0.5) * 0.06, 0);

        // galho principal
        list.push({
          pos: base.clone().addScaledVector(dir, L / 2),
          quat: new THREE.Quaternion().setFromUnitVectors(up, dir),
          scale: new THREE.Vector3(0.07 + L * 0.06, L, 0.07 + L * 0.06),
          color: NEEDLE_COLORS[Math.floor(rand() * NEEDLE_COLORS.length)],
        });

        // ramos laterais com agulhas, que dão volume
        const side = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
        const subs = 3 + Math.round(L * 2);
        for (let k = 0; k < subs; k++) {
          const f = 0.3 + (k / subs) * 0.65 + rand() * 0.05;
          const p = base.clone().addScaledVector(dir, L * f);
          const sign = k % 2 === 0 ? 1 : -1;
          const dir2 = dir
            .clone()
            .multiplyScalar(0.65)
            .addScaledVector(side, sign * (0.6 + rand() * 0.3))
            .add(new THREE.Vector3(0, -0.15 - rand() * 0.2, 0))
            .normalize();
          const L2 = Math.max(0.12, L * 0.38 * (1 - f * 0.45));
          list.push({
            pos: p.addScaledVector(dir2, L2 / 2),
            quat: new THREE.Quaternion().setFromUnitVectors(up, dir2),
            scale: new THREE.Vector3(L2 * 0.32, L2, L2 * 0.32),
            color: NEEDLE_COLORS[Math.floor(rand() * NEEDLE_COLORS.length)],
          });
        }
      }
    }

    // ponta (broto central)
    list.push({
      pos: new THREE.Vector3(0, TREE_TOP - 0.25, 0),
      quat: new THREE.Quaternion(),
      scale: new THREE.Vector3(0.09, 0.6, 0.09),
      color: NEEDLE_COLORS[2],
    });

    return list;
  }, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    instances.forEach((inst, i) => {
      m.compose(inst.pos, inst.quat, inst.scale);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(inst.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.material.needsUpdate = true;
  }, [instances]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, instances.length]} castShadow receiveShadow>
      {/* cone com base em y=-0.5 e ponta em y=+0.5: grosso no tronco, fino na ponta */}
      <coneGeometry args={[1, 1, 7, 1]} />
      <meshStandardMaterial roughness={0.85} metalness={0} />
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

/* ---------- Estrela ---------- */

function TopStar() {
  const ref = useRef();

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const points = 5;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? 0.36 : 0.15;
      const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    geo.center();
    return geo;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.6;
    ref.current.material.emissiveIntensity = 0.9 + Math.sin(t * 2.5) * 0.25;
  });

  return (
    <group position={[0, TREE_TOP + 0.22, 0]}>
      <mesh ref={ref} geometry={geometry} castShadow>
        <meshStandardMaterial
          color="#e8c15a"
          emissive="#ffb84d"
          emissiveIntensity={0.9}
          metalness={1}
          roughness={0.2}
        />
      </mesh>
      <pointLight color="#ffcf80" intensity={4} distance={4} decay={2} />
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
