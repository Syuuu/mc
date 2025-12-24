import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  Float,
  OrbitControls,
  Stars,
  Text,
} from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { MutableRefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type TreeMode = "CHAOS" | "FORMED";

const CHAOS_RADIUS = 4.5;
const TREE_HEIGHT = 5.2;
const TREE_RADIUS = 2.2;
const FOLIAGE_COUNT = 12000;

const COLORS = {
  emerald: new THREE.Color("#0b3d2e"),
  gold: new THREE.Color("#d7b56d"),
  champagne: new THREE.Color("#f4e4c1"),
  ruby: new THREE.Color("#a40c2d"),
  pearl: new THREE.Color("#f5f5f5"),
};

const ornamentColors = {
  gifts: ["#d7b56d", "#0b3d2e", "#7a1f2d", "#f4e4c1"],
  globes: ["#f5d989", "#e0c08f", "#fff1c7", "#9c0b2a"],
  lights: ["#ffd98a", "#fff1c7", "#ffcf6b"],
};

function randomPointInSphere(radius: number) {
  const u = Math.random();
  const v = Math.random();
  const theta = u * 2 * Math.PI;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(Math.random()) * radius;
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  );
}

function randomPointOnCone(height: number, baseRadius: number) {
  const y = Math.random() * height;
  const radius = (1 - y / height) * baseRadius;
  const angle = Math.random() * Math.PI * 2;
  const jitter = (Math.random() - 0.5) * 0.15;
  return new THREE.Vector3(
    (radius + jitter) * Math.cos(angle),
    y - height * 0.45,
    (radius + jitter) * Math.sin(angle)
  );
}

function FoliagePoints({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const chaos = new Float32Array(FOLIAGE_COUNT * 3);
    const target = new Float32Array(FOLIAGE_COUNT * 3);
    const sparkle = new Float32Array(FOLIAGE_COUNT);

    for (let i = 0; i < FOLIAGE_COUNT; i += 1) {
      const chaosPoint = randomPointInSphere(CHAOS_RADIUS);
      const targetPoint = randomPointOnCone(TREE_HEIGHT, TREE_RADIUS);

      chaos.set([chaosPoint.x, chaosPoint.y, chaosPoint.z], i * 3);
      target.set([targetPoint.x, targetPoint.y, targetPoint.z], i * 3);
      sparkle[i] = Math.random();
    }

    geo.setAttribute("position", new THREE.BufferAttribute(chaos, 3));
    geo.setAttribute("target", new THREE.BufferAttribute(target, 3));
    geo.setAttribute("sparkle", new THREE.BufferAttribute(sparkle, 1));
    return geo;
  }, []);

  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uProgress.value = progressRef.current;
    materialRef.current.uniforms.uTime.value = clock.elapsedTime;
  });

  const shaderMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: progressRef.current },
          uTime: { value: 0 },
          uColorA: { value: COLORS.emerald },
          uColorB: { value: COLORS.gold },
        },
        vertexShader: `
          uniform float uProgress;
          uniform float uTime;
          attribute vec3 target;
          attribute float sparkle;
          varying float vSparkle;
          void main() {
            vec3 mixedPosition = mix(position, target, uProgress);
            float wave = sin(uTime * 1.5 + sparkle * 12.0) * 0.05;
            mixedPosition += normalize(mixedPosition) * wave;
            vSparkle = sparkle;
            vec4 mvPosition = modelViewMatrix * vec4(mixedPosition, 1.0);
            gl_PointSize = 6.5 + sparkle * 6.0;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying float vSparkle;
          void main() {
            float dist = length(gl_PointCoord - 0.5);
            float alpha = smoothstep(0.5, 0.1, dist);
            vec3 color = mix(uColorA, uColorB, vSparkle);
          gl_FragColor = vec4(color, alpha * 0.9);
          }
        `,
      }),
    []
  );

  return (
    <points geometry={geometry}>
      <primitive ref={materialRef} object={shaderMaterial} attach="material" />
    </points>
  );
}

type OrnamentDefinition = {
  chaos: THREE.Vector3[];
  target: THREE.Vector3[];
  colors: THREE.Color[];
  weight: number;
};

function useOrnamentSet(
  count: number,
  palette: string[],
  weight: number,
  spread: number
): OrnamentDefinition {
  return useMemo(() => {
    const chaos: THREE.Vector3[] = [];
    const target: THREE.Vector3[] = [];
    const colors: THREE.Color[] = [];

    for (let i = 0; i < count; i += 1) {
      chaos.push(randomPointInSphere(CHAOS_RADIUS + spread));
      target.push(randomPointOnCone(TREE_HEIGHT, TREE_RADIUS * 0.85));
      colors.push(new THREE.Color(palette[i % palette.length]));
    }

    return { chaos, target, colors, weight };
  }, [count, palette, weight, spread]);
}

function OrnamentInstances({
  definition,
  progressRef,
  geometry,
  emissiveBoost,
}: {
  definition: OrnamentDefinition;
  progressRef: MutableRefObject<number>;
  geometry: THREE.BufferGeometry;
  emissiveBoost?: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    if (!meshRef.current) return;

    for (let i = 0; i < definition.chaos.length; i += 1) {
      const weight = definition.weight;
      const easedProgress = THREE.MathUtils.smoothstep(
        progressRef.current,
        0,
        1
      );
      const t = easedProgress ** (1 / weight);
      const position = definition.chaos[i]
        .clone()
        .lerp(definition.target[i], t);
      dummy.position.copy(position);
      dummy.rotation.set(t * Math.PI * 1.4, t * Math.PI * 2.2, 0);
      const scale = 0.12 + (1 - t) * 0.04;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      meshRef.current.setColorAt(i, definition.colors[i]);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, definition.chaos.length]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        attach="material"
        roughness={0.2}
        metalness={0.8}
        color={COLORS.gold}
        emissive={COLORS.gold}
        emissiveIntensity={emissiveBoost ?? 0.6}
        vertexColors
      />
    </instancedMesh>
  );
}

function GrandTree({ progressRef }: { progressRef: MutableRefObject<number> }) {
  const giftDefinition = useOrnamentSet(60, ornamentColors.gifts, 1.35, 0.4);
  const globeDefinition = useOrnamentSet(180, ornamentColors.globes, 0.9, 0.2);
  const lightDefinition = useOrnamentSet(260, ornamentColors.lights, 0.6, 0.1);

  const giftGeometry = useMemo(() => new THREE.BoxGeometry(0.18, 0.18, 0.18), []);
  const globeGeometry = useMemo(
    () => new THREE.SphereGeometry(0.13, 24, 24),
    []
  );
  const lightGeometry = useMemo(
    () => new THREE.IcosahedronGeometry(0.08, 0),
    []
  );

  return (
    <group>
      <FoliagePoints progressRef={progressRef} />
      <OrnamentInstances
        definition={giftDefinition}
        progressRef={progressRef}
        geometry={giftGeometry}
        emissiveBoost={0.5}
      />
      <OrnamentInstances
        definition={globeDefinition}
        progressRef={progressRef}
        geometry={globeGeometry}
        emissiveBoost={0.8}
      />
      <OrnamentInstances
        definition={lightDefinition}
        progressRef={progressRef}
        geometry={lightGeometry}
        emissiveBoost={1.4}
      />
      <Float floatIntensity={0.5} rotationIntensity={0.35} speed={1.2}>
        <mesh position={[0, -2.6, 0]}>
          <cylinderGeometry args={[0.6, 0.95, 0.45, 32]} />
          <meshStandardMaterial
            color={COLORS.gold}
            metalness={0.9}
            roughness={0.2}
            emissive={COLORS.gold}
            emissiveIntensity={0.4}
          />
        </mesh>
      </Float>
      <Text
        position={[0, 2.6, 0]}
        fontSize={0.5}
        color={COLORS.gold.getStyle()}
        anchorX="center"
        anchorY="middle"
      >
        GRAND LUXURY
      </Text>
    </group>
  );
}

function LuxuryScene({ mode }: { mode: TreeMode }) {
  const progressRef = useRef(mode === "FORMED" ? 1 : 0);

  useFrame((_, delta) => {
    const target = mode === "FORMED" ? 1 : 0;
    const speed = 0.65;
    progressRef.current = THREE.MathUtils.damp(
      progressRef.current,
      target,
      speed,
      delta
    );
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[5, 6, 4]}
        intensity={1.2}
        color={COLORS.gold}
        castShadow
      />
      <pointLight
        position={[-4, 2, -3]}
        intensity={1.1}
        color={COLORS.champagne}
      />
      <Stars radius={40} depth={20} count={800} factor={2.5} />
      <GrandTree progressRef={progressRef} />
      <mesh position={[0, -3.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 64]} />
        <meshStandardMaterial
          color={COLORS.emerald}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <Environment preset="sunset" />
    </>
  );
}

export default function App() {
  const [mode, setMode] = useState<TreeMode>("FORMED");
  const [autoShift, setAutoShift] = useState(true);

  useEffect(() => {
    if (!autoShift) return undefined;
    const interval = window.setInterval(() => {
      setMode((prev) => (prev === "FORMED" ? "CHAOS" : "FORMED"));
    }, 6500);
    return () => window.clearInterval(interval);
  }, [autoShift]);

  return (
    <div className="relative min-h-screen bg-nightVelvet text-white">
      <Canvas
        shadows
        camera={{ position: [0, 1.2, 8], fov: 45 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <LuxuryScene mode={mode} />
        <OrbitControls
          enablePan={false}
          minPolarAngle={0.4}
          maxPolarAngle={1.6}
          minDistance={6}
          maxDistance={10}
          autoRotate
          autoRotateSpeed={0.5}
        />
        <EffectComposer>
          <Bloom
            intensity={1.2}
            luminanceThreshold={0.8}
            luminanceSmoothing={0.1}
          />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60" />

      <div className="absolute left-8 top-8 max-w-xl space-y-4">
        <p className="text-xs uppercase tracking-[0.4em] text-goldLux/80">
          Grand Luxury Interactive Christmas Tree
        </p>
        <h1 className="text-4xl font-semibold text-goldLux drop-shadow-[0_0_18px_rgba(215,181,109,0.5)]">
          Trump-Style Opulence, Emerald Majesty
        </h1>
        <p className="text-sm text-white/70">
          Witness a cinematic morph between CHAOS and FORMED states as golden
          ornaments converge into a towering emerald icon.
        </p>
      </div>

      <div className="absolute bottom-8 left-8 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setMode((prev) => (prev === "FORMED" ? "CHAOS" : "FORMED"))}
          className="pointer-events-auto rounded-full border border-goldLux/60 bg-black/50 px-5 py-2 text-xs uppercase tracking-[0.3em] text-goldLux shadow-glow transition hover:bg-goldLux/20"
        >
          Toggle {mode === "FORMED" ? "Chaos" : "Formed"}
        </button>
        <button
          type="button"
          onClick={() => setAutoShift((prev) => !prev)}
          className="pointer-events-auto rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70 transition hover:text-white"
        >
          Auto Shift: {autoShift ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}
