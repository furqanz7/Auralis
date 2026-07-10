import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";

const petalVertex = `
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float lift = sin((pos.x * 2.6) + uTime * 0.48) * 0.08;
    pos.z += lift + cos((pos.y * 3.1) - uTime * 0.35) * 0.05;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const petalFragment = `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  void main() {
    vec2 uv = vUv;
    float blade = smoothstep(0.58, 0.0, abs(uv.y - 0.5));
    float taper = smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.74, uv.x);
    float pulse = 0.72 + sin(uTime * 0.8 + uv.x * 5.0) * 0.18;
    vec3 color = mix(uColorA, uColorB, uv.x);
    gl_FragColor = vec4(color, blade * taper * pulse * 0.52);
  }
`;

function PetalRibbon({ position, rotation, scale, colorA, colorB, speed = 1 }) {
  const material = useRef(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) }
    }),
    [colorA, colorB]
  );

  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime * speed;
    }
  });

  return (
    <mesh position={position} rotation={rotation} scale={scale}>
      <planeGeometry args={[1, 1, 120, 52]} />
      <shaderMaterial
        ref={material}
        vertexShader={petalVertex}
        fragmentShader={petalFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function StarField() {
  const points = useRef(null);
  const positions = useMemo(() => {
    const count = 760;
    const values = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const radius = 1.7 + Math.random() * 5.8;
      const angle = Math.random() * Math.PI * 2;
      const depth = (Math.random() - 0.5) * 5.6;
      values[i * 3] = Math.cos(angle) * radius;
      values[i * 3 + 1] = Math.sin(angle) * radius * 0.52;
      values[i * 3 + 2] = depth;
    }

    return values;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.012;
    points.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.14) * 0.03;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.018}
        color="#f9e1ff"
        transparent
        opacity={0.68}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function SceneContent() {
  return (
    <>
      <color attach="background" args={["#02040a"]} />
      <ambientLight intensity={0.18} />
      <StarField />
      <PetalRibbon
        position={[1.45, 0.48, -1.2]}
        rotation={[0.12, -0.34, -0.55]}
        scale={[4.6, 1.5, 1]}
        colorA="#ff7a9f"
        colorB="#ffd08a"
      />
      <PetalRibbon
        position={[1.55, -0.1, -1.45]}
        rotation={[0.22, 0.22, 0.46]}
        scale={[4.2, 1.3, 1]}
        colorA="#7bf4cf"
        colorB="#8fb4ff"
        speed={0.72}
      />
      <PetalRibbon
        position={[0.58, -0.72, -1.8]}
        rotation={[-0.2, 0.4, 0.08]}
        scale={[5.2, 1.1, 1]}
        colorA="#7d6cff"
        colorB="#ff78b7"
        speed={0.6}
      />
    </>
  );
}

function EtherealScene() {
  return (
    <Canvas
      className="ethereal-canvas"
      camera={{ position: [0, 0, 4.6], fov: 45 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <SceneContent />
    </Canvas>
  );
}

export default memo(EtherealScene);
