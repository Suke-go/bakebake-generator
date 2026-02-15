'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Autonomous fog — stronger, always moving, no mouse dependency
 * Inspired by ink diffusing in still water
 */

const VERT = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;
  float t = u_time * 0.18;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // Layer 1: large slow undulations
  float f1 = fbm(p * 1.2 + vec2(t * 0.3, t * 0.12));
  f1 = smoothstep(0.28, 0.72, f1);

  // Layer 2: medium drift (different direction)
  float f2 = fbm(p * 2.5 + vec2(-t * 0.4, t * 0.25));
  f2 = smoothstep(0.30, 0.70, f2) * 0.6;

  // Layer 3: fine detail
  float f3 = fbm(p * 5.0 + vec2(t * 0.5, -t * 0.3));
  f3 = smoothstep(0.35, 0.65, f3) * 0.3;

  // Layer 4: very fine wisps
  float f4 = fbm(p * 9.0 + vec2(-t * 0.2, t * 0.6));
  f4 = smoothstep(0.4, 0.6, f4) * 0.15;

  float fog = f1 * 0.6 + f2 + f3 + f4;

  // Bottom-heavy (ground mist pooling)
  float bottom = smoothstep(0.0, 0.7, 1.0 - uv.y);
  fog *= mix(0.3, 1.3, bottom);

  // Soft vignette
  float vig = 1.0 - length((uv - 0.5) * 1.1);
  vig = smoothstep(0.0, 0.9, vig);
  fog *= vig;

  // Strong enough to see clearly
  fog *= 0.22;

  // Background: deep void
  vec3 bg = vec3(0.012, 0.015, 0.028);

  // Fog: warm gray (like old paper smoke)
  vec3 fogCol = vec3(0.50, 0.46, 0.40);

  vec3 color = bg + fogCol * fog;

  // Subtle grain
  float grain = hash(gl_FragCoord.xy + u_time * 80.0) * 0.008;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function FogBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const startTime = useRef(0);
  const uniformsRef = useRef<{
    gl: WebGLRenderingContext;
    uTime: WebGLUniformLocation;
    uRes: WebGLUniformLocation;
  } | null>(null);

  const initGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) return false;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    uniformsRef.current = {
      gl,
      uTime: gl.getUniformLocation(prog, 'u_time')!,
      uRes: gl.getUniformLocation(prog, 'u_resolution')!,
    };
    startTime.current = performance.now();
    return true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.5);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      uniformsRef.current?.gl.viewport(0, 0, canvas.width, canvas.height);
    };

    if (!initGL()) return;
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      const ref = uniformsRef.current;
      if (!ref) return;
      const t = (performance.now() - startTime.current) / 1000;
      ref.gl.uniform1f(ref.uTime, t);
      ref.gl.uniform2f(ref.uRes, canvas.width, canvas.height);
      ref.gl.drawArrays(ref.gl.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [initGL]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: -2,
        pointerEvents: 'none',
      }}
    />
  );
}
