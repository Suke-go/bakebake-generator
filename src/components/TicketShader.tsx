"use client";

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const fragmentShader = `
uniform float uTime;
varying vec2 vUv;

// Simplex 2D noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
    vec2 pos = vUv * 3.0;
    
    // FBM (fBm) style noise composition
    float n = snoise(pos + uTime * 0.1);
    n += 0.5 * snoise(pos * 2.1 - uTime * 0.15);
    n += 0.25 * snoise(pos * 4.3 + uTime * 0.05);
    n = n * 0.5 + 0.5; // map to 0-1
    
    // Vignette
    float dist = distance(vUv, vec2(0.5));
    float vignette = smoothstep(0.8, 0.1, dist);
    
    // Color palettes
    vec3 colorBase = vec3(0.02, 0.01, 0.04);
    vec3 highlight1 = vec3(0.35, 0.1, 0.5);
    vec3 highlight2 = vec3(0.1, 0.05, 0.2);
    
    vec3 color = mix(mix(colorBase, highlight2, n), highlight1, pow(n, 2.0));
    color *= vignette;
    
    gl_FragColor = vec4(color, 1.0);
}
`;

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function TicketShaderMaterial() {
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 }
    }), []);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
        }
    });

    return (
        <shaderMaterial
            ref={materialRef}
            fragmentShader={fragmentShader}
            vertexShader={vertexShader}
            uniforms={uniforms}
            depthWrite={false}
        />
    );
}

export function TicketShaderBackground() {
    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
            <Canvas camera={{ position: [0, 0, 1] }}>
                <mesh>
                    <planeGeometry args={[2, 2]} />
                    <TicketShaderMaterial />
                </mesh>
            </Canvas>
        </div>
    );
}
