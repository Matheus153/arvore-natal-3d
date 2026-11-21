"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Sparkles } from "@react-three/drei";
import * as THREE from "three";

// Gerador pseudoaleatório com semente, para a árvore ficar igual a cada carregamento
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Camadas da árvore: raio da base, altura e altura (y) da base de cada cone
const LAYERS = [
  { radius: 2.2, height: 2.4, base: 0.6 },
  { radius: 1.8, height: 2.1, base: 1.7 },
  { radius: 1.4, height: 1.8, base: 2.7 },
  { radius: 0.95, height: 1.5, base: 3.6 },
];
const TREE_TOP = LAYERS[LAYERS.length - 1].base + LAYERS[LAYERS.length - 1].height;

const ORNAMENT_COLORS = ["#e63946", "#ffd166", "#4cc9f0", "#f72585", "#ffffff", "#c0c0c0"];
const LIGHT_COLORS = ["#ffdd88", "#ff5555", "#66ccff", "#88ff88"];

function Tree() {
  return (
    <group>
      {/* Tronco */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.28, 0.38, 0.9, 16]} />
        <meshStandardMaterial color="#5b3a1e" roughness={0.9} />
      </mesh>

      {/* Copa em camadas */}
      {LAYERS.map((layer, i) => (
        <mesh key={i} position={[0, layer.base + layer.height / 2, 0]}>
          <coneGeometry args={[layer.radius, layer.height, 48, 1]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? "#1b6b3a" : "#1f7a42"}
            roughness={0.75}
            flatShading
          />
        </mesh>
      ))}
    </group>
  );
}

function TopStar() {
  const ref = useRef();

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    const points = 5;
    const outer = 0.42;
    const inner = 0.18;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    geo.center();
    return geo;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.rotation.y = t * 0.8;
    ref.current.material.emissiveIntensity = 1.6 + Math.sin(t * 3) * 0.5;
  });

  return (
    <group position={[0, TREE_TOP + 0.3, 0]}>
      <mesh ref={ref} geometry={geometry}>
        <meshStandardMaterial
          color="#ffd700"
          emissive="#ffb300"
          emissiveIntensity={1.6}
          metalness={0.6}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
      <pointLight color="#ffcc66" intensity={6} distance={6} decay={2} />
    </group>
  );
}

function Ornament({ position, color, phase }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.material.emissiveIntensity = 0.25 + (Math.sin(t * 2 + phase) + 1) * 0.2;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.11, 20, 20]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={0.3}
        metalness={0.8}
        roughness={0.15}
      />
    </mesh>
  );
}

function Ornaments() {
  const ornaments = useMemo(() => {
    const rand = seededRandom(42);
    const list = [];
    LAYERS.forEach((layer, li) => {
      const count = 12 - li * 2;
      for (let i = 0; i < count; i++) {
        const t = 0.08 + rand() * 0.42; // parte inferior visível do cone
        const angle = (i / count) * Math.PI * 2 + rand() * 0.5;
        const r = layer.radius * (1 - t) + 0.06;
        list.push({
          position: [Math.cos(angle) * r, layer.base + t * layer.height, Math.sin(angle) * r],
          color: ORNAMENT_COLORS[Math.floor(rand() * ORNAMENT_COLORS.length)],
          phase: rand() * Math.PI * 2,
        });
      }
    });
    return list;
  }, []);

  return ornaments.map((o, i) => <Ornament key={i} {...o} />);
}

function LightBulb({ position, color, phase }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const on = Math.sin(t * 4 + phase) > -0.2;
    ref.current.material.emissiveIntensity = on ? 2.5 : 0.2;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.045, 10, 10]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.5} toneMapped={false} />
    </mesh>
  );
}

function StringLights() {
  const bulbs = useMemo(() => {
    const list = [];
    const total = 140;
    const turns = 6;
    const bottom = LAYERS[0].base + 0.1;
    for (let i = 0; i < total; i++) {
      const s = i / total;
      const y = bottom + s * (TREE_TOP - bottom - 0.2);
      // raio aproximado do contorno da árvore nessa altura
      const r = (LAYERS[0].radius + 0.05) * (1 - s) * 0.92 + 0.12;
      const angle = s * Math.PI * 2 * turns;
      list.push({
        position: [Math.cos(angle) * r, y, Math.sin(angle) * r],
        color: LIGHT_COLORS[i % LIGHT_COLORS.length],
        phase: i * 0.7,
      });
    }
    return list;
  }, []);

  return bulbs.map((b, i) => <LightBulb key={i} {...b} />);
}

function Present({ position, size, color, ribbon, rotation = 0 }) {
  const [w, h, d] = size;
  return (
    <group position={[position[0], h / 2, position[2]]} rotation={[0, rotation, 0]}>
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh>
        <boxGeometry args={[w * 0.18, h + 0.01, d + 0.01]} />
        <meshStandardMaterial color={ribbon} metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh>
        <boxGeometry args={[w + 0.01, h + 0.01, d * 0.18]} />
        <meshStandardMaterial color={ribbon} metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Presents() {
  return (
    <group>
      <Present position={[1.6, 0, 1.2]} size={[0.6, 0.5, 0.6]} color="#c1121f" ribbon="#ffd166" rotation={0.4} />
      <Present position={[-1.5, 0, 1.4]} size={[0.5, 0.4, 0.5]} color="#1d4ed8" ribbon="#ffffff" rotation={-0.3} />
      <Present position={[0.2, 0, 2.0]} size={[0.45, 0.35, 0.45]} color="#7b2cbf" ribbon="#ffd166" rotation={0.9} />
      <Present position={[-1.9, 0, -0.6]} size={[0.55, 0.6, 0.55]} color="#2a9d8f" ribbon="#e63946" rotation={0.2} />
      <Present position={[1.9, 0, -0.5]} size={[0.4, 0.3, 0.4]} color="#f4a261" ribbon="#1b6b3a" rotation={-0.6} />
    </group>
  );
}

function Snow({ count = 1500 }) {
  const ref = useRef();
  const { positions, speeds } = useMemo(() => {
    const rand = seededRandom(7);
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 24;
      positions[i * 3 + 1] = rand() * 14;
      positions[i * 3 + 2] = (rand() - 0.5) * 24;
      speeds[i] = 0.3 + rand() * 0.6;
    }
    return { positions, speeds };
  }, [count]);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const arr = ref.current.geometry.attributes.position.array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] -= speeds[i] * delta;
      arr[i * 3] += Math.sin(t + i) * 0.002;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 14;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.06} transparent opacity={0.85} depthWrite={false} />
    </points>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <circleGeometry args={[12, 64]} />
      <meshStandardMaterial color="#e8eef7" roughness={1} />
    </mesh>
  );
}

export default function ChristmasScene() {
  return (
    <div className="scene">
      <Canvas camera={{ position: [6, 4.5, 8], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#050816"]} />
        <fog attach="fog" args={["#050816", 12, 30]} />

        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 10, 5]} intensity={0.6} color="#b8c8ff" />
        <pointLight position={[0, 2.5, 3]} intensity={3} distance={8} color="#ffb36b" />

        <Stars radius={60} depth={40} count={3000} factor={4} fade speed={0.6} />

        <group position={[0, -2.2, 0]}>
          <Tree />
          <TopStar />
          <Ornaments />
          <StringLights />
          <Presents />
          <Ground />
          <Sparkles count={60} scale={[5, 5, 5]} position={[0, 3, 0]} size={3} speed={0.4} color="#ffe9a8" />
          <Snow />
        </group>

        <OrbitControls
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.8}
          minDistance={5}
          maxDistance={18}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.1}
          target={[0, 0.3, 0]}
        />
      </Canvas>
    </div>
  );
}
