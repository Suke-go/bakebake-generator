'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import QRCodeLib from 'qrcode';

/**
 * QRFlameAura — 鬼火で描かれたQRコード
 *
 * QRコードのモジュール（ドット）自体をWebGLシェーダーで描画。
 * 各ドットが緑の鬼火のように揺らめき、呼吸する。
 * QRデータはテクスチャとしてシェーダーに渡される。
 *
 * 読み取り性を保つため、各ドットの中心位置は維持しつつ
 * エッジと明るさにノイズを加える。
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
uniform sampler2D u_qrTex;
uniform float u_qrSize;   // number of modules per side

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

  // QR is centered with margin
  float margin = 0.08;
  vec2 qrUV = (uv - margin) / (1.0 - 2.0 * margin);

  // Background: very dark
  vec3 bg = vec3(0.008, 0.015, 0.01);

  if (qrUV.x < 0.0 || qrUV.x > 1.0 || qrUV.y < 0.0 || qrUV.y > 1.0) {
    // Outside QR area: subtle ambient flame wisps
    vec2 centeredUV = uv - 0.5;
    float r = length(centeredUV);
    float wisp = fbm(centeredUV * 6.0 + vec2(0.0, -u_time * 0.3)) * 0.15;
    wisp *= smoothstep(0.5, 0.2, r);
    vec3 wispColor = vec3(0.05, 0.15, 0.06) * wisp;
    gl_FragColor = vec4(bg + wispColor, 1.0);
    return;
  }

  // Sample QR texture (check if this module is dark)
  // Flip Y for correct orientation
  vec2 texCoord = vec2(qrUV.x, 1.0 - qrUV.y);
  float qrVal = texture2D(u_qrTex, texCoord).r;
  bool isDark = qrVal < 0.5;

  // Module grid position
  vec2 modulePos = qrUV * u_qrSize;
  vec2 moduleCenter = (floor(modulePos) + 0.5) / u_qrSize;
  vec2 localUV = fract(modulePos); // 0-1 within current module

  // Distance from module center (for dot shape)
  float distFromCenter = length(localUV - 0.5) * 2.0;

  if (isDark) {
    // --- Dark module: render as glowing flame dot ---

    // Per-module unique seed
    vec2 seed = floor(modulePos);
    float moduleHash = hash(seed);

    // Breathing intensity per module
    float breathe = sin(u_time * (1.5 + moduleHash * 2.0) + moduleHash * 6.28) * 0.15 + 0.85;

    // Flame flicker noise
    float flicker = noise(seed * 3.0 + u_time * 2.0) * 0.2 + 0.8;

    // Dot shape: slightly organic (noise on edge)
    float edgeNoise = noise(localUV * 8.0 + seed + u_time * 0.5) * 0.08;
    float dotRadius = 0.38 + edgeNoise;
    float dot = smoothstep(dotRadius + 0.06, dotRadius - 0.04, distFromCenter);

    // Glow around dot
    float glow = smoothstep(0.7, 0.1, distFromCenter) * 0.25;

    float intensity = (dot + glow) * breathe * flicker;

    // Color: green onibi gradient
    vec3 coreColor = vec3(0.6, 1.0, 0.7);    // 白緑の芯
    vec3 midColor  = vec3(0.1, 0.7, 0.25);   // 緑
    vec3 edgeColor = vec3(0.02, 0.2, 0.06);   // 暗緑

    vec3 dotColor = mix(edgeColor, midColor, smoothstep(0.0, 0.5, intensity));
    dotColor = mix(dotColor, coreColor, smoothstep(0.6, 1.0, intensity));

    // Occasional bright spark
    float spark = pow(noise(seed * 7.0 + u_time * 3.5), 6.0) * 0.3;
    dotColor += vec3(0.4, 0.9, 0.5) * spark;

    gl_FragColor = vec4(bg + dotColor * intensity, 1.0);
  } else {
    // --- Light module: dark background with subtle texture ---
    float grain = hash(gl_FragCoord.xy + u_time * 30.0) * 0.008;
    
    // Very subtle ambient glow from nearby dark modules
    float ambientGlow = 0.0;
    for (int dx = -1; dx <= 1; dx++) {
      for (int dy = -1; dy <= 1; dy++) {
        if (dx == 0 && dy == 0) continue;
        vec2 neighborCoord = (floor(modulePos) + vec2(float(dx), float(dy)) + 0.5) / u_qrSize;
        vec2 neighborTex = vec2(neighborCoord.x, 1.0 - neighborCoord.y);
        if (neighborTex.x >= 0.0 && neighborTex.x <= 1.0 && neighborTex.y >= 0.0 && neighborTex.y <= 1.0) {
          float neighborVal = texture2D(u_qrTex, neighborTex).r;
          if (neighborVal < 0.5) {
            ambientGlow += 0.006;
          }
        }
      }
    }

    vec3 lightColor = bg + vec3(0.02, 0.04, 0.025) * ambientGlow;
    gl_FragColor = vec4(lightColor + grain, 1.0);
  }
}
`;

interface QRFlameAuraProps {
    value: string;
    size?: number;
}

export default function QRFlameAura({ value, size = 280 }: QRFlameAuraProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);
    const startTime = useRef(0);
    const frameToggle = useRef(false);
    const uniformsRef = useRef<{
        gl: WebGLRenderingContext;
        uTime: WebGLUniformLocation;
        uRes: WebGLUniformLocation;
        uQrSize: WebGLUniformLocation;
    } | null>(null);
    const [qrReady, setQrReady] = useState(false);

    const initGL = useCallback((qrModules: boolean[][], moduleCount: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
        if (!gl) return false;

        const compile = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error('QRFlame shader:', gl.getShaderInfoLog(s));
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

        // Full-screen quad
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const pos = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

        // Create QR texture from module data
        const texSize = moduleCount;
        const texData = new Uint8Array(texSize * texSize);
        for (let y = 0; y < texSize; y++) {
            for (let x = 0; x < texSize; x++) {
                texData[y * texSize + x] = qrModules[y]?.[x] ? 0 : 255; // dark=0, light=255
            }
        }

        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, texSize, texSize, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, texData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const uQrTex = gl.getUniformLocation(prog, 'u_qrTex');
        gl.uniform1i(uQrTex, 0);

        uniformsRef.current = {
            gl,
            uTime: gl.getUniformLocation(prog, 'u_time')!,
            uRes: gl.getUniformLocation(prog, 'u_resolution')!,
            uQrSize: gl.getUniformLocation(prog, 'u_qrSize')!,
        };

        gl.uniform1f(uniformsRef.current.uQrSize, moduleCount);
        startTime.current = performance.now();
        return true;
    }, []);

    // Generate QR matrix and init WebGL
    useEffect(() => {
        if (!value) return;

        // Use the create() method to get raw module data
        const qr = (QRCodeLib as any).create(value, { errorCorrectionLevel: 'H' });
        const modules = qr.modules;
        const moduleCount: number = modules.size;

        // modules.data is a Uint8Array of 0/1 values, length = size * size
        // Convert to boolean[][] for initGL
        const rawData: Uint8Array = modules.data;
        const data: boolean[][] = [];
        for (let y = 0; y < moduleCount; y++) {
            const row: boolean[] = [];
            for (let x = 0; x < moduleCount; x++) {
                row.push(rawData[y * moduleCount + x] === 1);
            }
            data.push(row);
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = Math.min(window.devicePixelRatio, 2);
        canvas.width = size * dpr;
        canvas.height = size * dpr;

        if (initGL(data, moduleCount)) {
            setQrReady(true);
            uniformsRef.current?.gl.viewport(0, 0, canvas.width, canvas.height);
        }
    }, [value, size, initGL]);

    // Render loop
    useEffect(() => {
        if (!qrReady) return;

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
            const canvas = canvasRef.current;
            if (!canvas) return;

            ref.gl.uniform1f(ref.uTime, t);
            ref.gl.uniform2f(ref.uRes, canvas.width, canvas.height);
            ref.gl.drawArrays(ref.gl.TRIANGLE_STRIP, 0, 4);
            rafRef.current = requestAnimationFrame(render);
        };
        render();

        return () => { cancelAnimationFrame(rafRef.current); };
    }, [qrReady]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: size,
                height: size,
                borderRadius: '4px',
            }}
        />
    );
}
