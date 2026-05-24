import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Preload } from '@react-three/drei';

const PHASES = [
  'Compiling shaders',
  'Priming post-processing',
  'Warming materials',
];

function ProcessingScene() {
  const coreRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;

    if (coreRef.current) {
      coreRef.current.rotation.y += delta * 0.55;
      coreRef.current.rotation.x = Math.sin(elapsed * 0.4) * 0.22;
      coreRef.current.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.035);
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.3;
      ringRef.current.rotation.x = Math.sin(elapsed * 0.25) * 0.12;
    }

    if (haloRef.current) {
      const pulse = 1 + Math.sin(elapsed * 1.8) * 0.05;
      haloRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} color="#85f7c9" />
      <directionalLight position={[4, 5, 4]} intensity={2.2} color="#ffffff" />
      <pointLight position={[-3, -2, 3]} intensity={3.4} color="#22c55e" />

      <Float speed={1.2} rotationIntensity={0.7} floatIntensity={0.8}>
        <mesh ref={coreRef}>
          <icosahedronGeometry args={[1.35, 2]} />
          <meshStandardMaterial
            color="#0a1018"
            emissive="#22c55e"
            emissiveIntensity={1.9}
            roughness={0.15}
            metalness={0.38}
          />
        </mesh>
      </Float>

      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.05, 0.09, 16, 128]} />
        <meshBasicMaterial
          color="#67e8f9"
          transparent
          opacity={0.82}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <mesh ref={haloRef} position={[0, -0.9, 0]}>
        <ringGeometry args={[1.7, 2.7, 64]} />
        <meshBasicMaterial
          color="#22c55e"
          transparent
          opacity={0.18}
          toneMapped={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <Preload all />
    </>
  );
}

interface ShaderProcessingScreenProps {
  visible: boolean;
}

const ShaderProcessingScreen = ({ visible }: ShaderProcessingScreenProps) => {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    if (!visible) return;

    setPhaseIndex(0);
    const intervalId = window.setInterval(() => {
      setPhaseIndex((current) => (current + 1) % PHASES.length);
    }, 900);

    return () => window.clearInterval(intervalId);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-[#02050a]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(34,197,94,0.15) 0%, rgba(2,5,10,0.95) 65%, rgba(2,5,10,1) 100%)',
        }}
      />

      <Canvas
        className="absolute inset-0"
        dpr={[1, 1.5]}
        frameloop="always"
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 0, 7], fov: 45 }}
      >
        <color attach="background" args={['#02050a']} />
        <fog attach="fog" args={['#02050a', 8, 20]} />
        <ProcessingScene />
      </Canvas>

      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-black/35 px-6 py-5 backdrop-blur-xl"
          style={{ boxShadow: '0 20px 80px rgba(0,0,0,0.45)' }}
        >
          <p className="text-[10px] font-bold tracking-[0.45em] text-emerald-300/90 uppercase">
            Shader Processing
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
            Preparing the battlefield
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-300/90">
            Compiling bloom, lighting, and combat materials so the first frame lands cleanly.
          </p>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="shader-load-bar h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-emerald-300 to-cyan-300"
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-[10px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
            <span>{PHASES[phaseIndex]}</span>
            <span>R3F + WebGL</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shaderLoad {
          0% { transform: translateX(-120%); opacity: 0.55; }
          50% { opacity: 1; }
          100% { transform: translateX(220%); opacity: 0.55; }
        }
        .shader-load-bar {
          animation: shaderLoad 1.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default ShaderProcessingScreen;