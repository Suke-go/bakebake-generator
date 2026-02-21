'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * QRGlow — 鬼火の淡い光
 *
 * QRコードの背後に配置する。
 * FBMノイズで有機的に呼吸する緑のグロー。
 * Raw WebGL, 30fps制限, モバイル軽量。
 */

const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;

uniform float u_time;
uniform vec2 u_resolution;

varying vec2 v_uv;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 centered = uv - 0.5;
  float r = length(centered);
  float t = u_time;

  // Organic breathing glow
  float glow1 = fbm(centered * 3.0 + vec2(t * 0.15, t * 0.1));
  float glow2 = fbm(centered * 5.0 + vec2(-t * 0.2, t * 0.12));

  // Radial falloff: bright center, fading edges
  float radial = smoothstep(0.6, 0.0, r);
  float radialOuter = smoothstep(0.7, 0.3, r);

  // Combine
  float intensity = (glow1 * 0.6 + glow2 * 0.4) * radial;

  // Breathing pulse
  float breathe = sin(t * 0.8) * 0.1 + 0.9;
  intensity *= breathe;

  // Outer wisps
  float wisps = fbm(centered * 8.0 + vec2(t * 0.08, -t * 0.05));
  wisps = pow(wisps, 2.0) * radialOuter * 0.15;

  // Green onibi palette
  vec3 coreColor = vec3(0.5, 1.0, 0.6);
  vec3 midColor = vec3(0.08, 0.5, 0.15);
  vec3 outerColor = vec3(0.02, 0.12, 0.04);

  vec3 color = mix(outerColor, midColor, smoothstep(0.0, 0.3, intensity));
  color = mix(color, coreColor, smoothstep(0.4, 0.8, intensity));

  // Add wisps
  color += vec3(0.03, 0.1, 0.04) * wisps;

  // Overall intensity
  float alpha = intensity * 0.5 + wisps;

  // Grain
  float grain = hash(gl_FragCoord.xy + t * 60.0) * 0.01;
  color += grain;

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

interface QRGlowProps {
    size?: number;
}

export default function QRGlow({ size = 300 }: QRGlowProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);
    const startTime = useRef(0);
    const frameToggle = useRef(false);
    const uniformsRef = useRef<{
        gl: WebGLRenderingContext;
        uTime: WebGLUniformLocation;
        uRes: WebGLUniformLocation;
    } | null>(null);

    const initGL = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
        if (!gl) return false;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error('QRGlow shader:', gl.getShaderInfoLog(s));
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

        const dpr = Math.min(window.devicePixelRatio, 1.5);
        canvas.width = size * dpr;
        canvas.height = size * dpr;

        if (!initGL()) return;
        uniformsRef.current?.gl.viewport(0, 0, canvas.width, canvas.height);

        const render = () => {
            frameToggle.current = !frameToggle.current;
            if (frameToggle.current) {
                rafRef.current = requestAnimationFrame(render);
                return;
            }

            const ref = uniformsRef.current;
            if (!ref) return;
            const t = (performance.now() - startTime.current) / 1000;

            ref.gl.clearColor(0, 0, 0, 0);
            ref.gl.clear(ref.gl.COLOR_BUFFER_BIT);
            ref.gl.uniform1f(ref.uTime, t);
            ref.gl.uniform2f(ref.uRes, canvasRef.current!.width, canvasRef.current!.height);
            ref.gl.drawArrays(ref.gl.TRIANGLE_STRIP, 0, 4);
            rafRef.current = requestAnimationFrame(render);
        };
        render();

        return () => { cancelAnimationFrame(rafRef.current); };
    }, [initGL, size]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: size,
                height: size,
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        />
    );
}
