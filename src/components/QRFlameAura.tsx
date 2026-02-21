'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * QRFlameAura — 鬼火のオーラ
 *
 * QRコードの背後でゆらめく炎のシェーダー。
 * FBMノイズで炎の揺らぎを生成し、中央のQRコード領域を
 * くり抜いて読み取り性を保つ。
 *
 * Raw WebGL（react-three-fiberなし）でモバイル軽量動作。
 * 30fps制限 + lowp精度でバッテリー負荷を抑制。
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

// --- Hash & Noise ---
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

// --- FBM: 5 octaves for rich flame detail ---
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 centeredUV = (uv - 0.5) * vec2(aspect, 1.0);

  float t = u_time;

  // --- Flame shape: rises upward ---
  // Shift y down so flames emerge from below center
  vec2 flameUV = centeredUV;
  flameUV.y += 0.15; // origin slightly below center

  // Distort with noise for organic movement
  float distortion = fbm(flameUV * 3.0 + vec2(0.0, -t * 0.8)) * 0.3;
  flameUV.x += distortion * 0.4;

  // Radial distance for flame envelope
  float r = length(flameUV);

  // Flame noise: moves upward
  float flame1 = fbm(vec2(flameUV.x * 4.0, flameUV.y * 2.5 - t * 1.2));
  float flame2 = fbm(vec2(flameUV.x * 6.0 + 1.7, flameUV.y * 3.0 - t * 1.5));
  float flame3 = fbm(vec2(flameUV.x * 8.0 - 0.9, flameUV.y * 4.0 - t * 2.0));

  // Compose flame intensity with falloff
  float flameShape = flame1 * 0.5 + flame2 * 0.3 + flame3 * 0.2;

  // Flame envelope: strongest near center, fades at edges
  float envelope = smoothstep(0.65, 0.1, r);

  // Upward bias: flames rise
  float upBias = smoothstep(0.4, -0.3, flameUV.y);
  envelope *= upBias;

  float intensity = flameShape * envelope;

  // Boost and shape
  intensity = pow(intensity, 1.2) * 2.2;

  // --- Color: spectral flame (deep red → orange → blue-white core) ---
  // Onibi (鬼火 / ghost fire): blue-violet core with warm edges
  vec3 innerColor = vec3(0.4, 0.5, 1.0);   // 青白い芯 (blue-white core)
  vec3 midColor   = vec3(0.6, 0.2, 0.9);   // 紫の中間 (purple mid)
  vec3 outerColor = vec3(0.2, 0.05, 0.3);  // 暗い紫の外縁 (dark violet edge)

  vec3 flameColor = mix(outerColor, midColor, smoothstep(0.0, 0.5, intensity));
  flameColor = mix(flameColor, innerColor, smoothstep(0.5, 1.0, intensity));

  // Occasional warm flicker (embers)
  float ember = fbm(flameUV * 10.0 + t * 0.5);
  ember = pow(ember, 4.0) * 0.15;
  flameColor += vec3(0.8, 0.3, 0.1) * ember * envelope;

  // --- QR safe zone: mask out the center where QR code sits ---
  // QR occupies roughly 200x200px in the center; canvas is larger
  // Use a soft-edged square mask
  vec2 qrDist = abs(centeredUV) * vec2(1.0 / aspect, 1.0);
  float qrSize = 0.32; // matches QR code area
  float qrMask = smoothstep(qrSize, qrSize + 0.08, max(qrDist.x, qrDist.y));

  // Apply mask: no flame inside QR zone
  vec3 color = flameColor * intensity * qrMask;

  // Subtle glow bleeding into QR border
  float borderGlow = smoothstep(qrSize + 0.08, qrSize - 0.02, max(qrDist.x, qrDist.y));
  borderGlow *= envelope * 0.08;
  color += innerColor * borderGlow;

  // Background: near-black
  vec3 bg = vec3(0.01, 0.005, 0.02);
  color += bg * (1.0 - intensity * qrMask);

  // Film grain for texture
  float grain = hash(gl_FragCoord.xy + u_time * 60.0) * 0.015;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

interface QRFlameAuraProps {
    /** Canvas size in CSS px (square) */
    size?: number;
}

export default function QRFlameAura({ size = 320 }: QRFlameAuraProps) {
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
        const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false });
        if (!gl) return false;

        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error('QRFlameAura shader error:', gl.getShaderInfoLog(s));
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
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('QRFlameAura link error:', gl.getProgramInfoLog(prog));
            return false;
        }
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

        // Use lower DPR on mobile for battery
        const dpr = Math.min(window.devicePixelRatio, 1.5);
        canvas.width = size * dpr;
        canvas.height = size * dpr;

        if (!initGL()) return;

        uniformsRef.current?.gl.viewport(0, 0, canvas.width, canvas.height);

        const render = () => {
            // 30fps cap
            frameToggle.current = !frameToggle.current;
            if (frameToggle.current) {
                rafRef.current = requestAnimationFrame(render);
                return;
            }

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
        };
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
                borderRadius: '16px',
                pointerEvents: 'none',
                zIndex: 0,
            }}
        />
    );
}
