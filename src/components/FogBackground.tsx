'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * 侘び寂びの霧 — 引き算の美学
 * 
 * fbm 4オクターブ × 2レイヤー（計8回のノイズ評価）
 * フェーズに応じて霧の速度・濃度が呼吸するように変化
 * 30fps制限で計算量を抑制
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
uniform float u_phase;

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

// 4オクターブ fbm（6 → 4 に削減）
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
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  // フェーズに応じた時間の速さ
  // 0: 静寂  1-1.5: ゆるやか  2: わずかに濃く  3.5: 速い  reveal: 晴れ
  float timeScale = 0.05;  // Phase 0: ほぼ停止
  timeScale = mix(timeScale, 0.14, smoothstep(0.5, 1.5, u_phase));   // Phase 1
  timeScale = mix(timeScale, 0.18, smoothstep(1.5, 2.5, u_phase));   // Phase 2
  timeScale = mix(timeScale, 0.25, smoothstep(3.0, 3.5, u_phase));   // Phase 3.5 生成中
  timeScale = mix(timeScale, 0.08, smoothstep(3.5, 4.0, u_phase));   // Reveal: 静かに

  float t = u_time * timeScale;
  vec2 p = vec2(uv.x * aspect, uv.y);

  // レイヤー1: 大きなうねり（墨の広がり）
  float f1 = fbm(p * 1.4 + vec2(t * 0.3, t * 0.1));
  f1 = smoothstep(0.30, 0.70, f1);

  // レイヤー2: 細かい気配（かすかな揺らぎ）
  float f2 = fbm(p * 4.0 + vec2(-t * 0.4, t * 0.25));
  f2 = smoothstep(0.35, 0.65, f2) * 0.35;

  float fog = f1 * 0.65 + f2;

  // 下方に溜まる霧（地面に這う霧気）
  float bottom = smoothstep(0.0, 0.65, 1.0 - uv.y);
  fog *= mix(0.35, 1.2, bottom);

  // 深いビネット（画面端を闇に沈める）
  float vig = 1.0 - length((uv - 0.5) * 1.3);
  vig = smoothstep(0.0, 0.85, vig);
  fog *= vig;

  // フェーズに応じた霧の濃度
  float fogIntensity = 0.10;   // Phase 0: ほのか
  fogIntensity = mix(fogIntensity, 0.12, smoothstep(0.5, 1.5, u_phase));
  fogIntensity = mix(fogIntensity, 0.15, smoothstep(1.5, 2.5, u_phase));
  fogIntensity = mix(fogIntensity, 0.18, smoothstep(3.0, 3.5, u_phase));
  fogIntensity = mix(fogIntensity, 0.06, smoothstep(3.5, 4.0, u_phase));  // Reveal: 晴れ

  fog *= fogIntensity;

  // 背景: 深い虚（ほぼ黒、わずかに青みがかった墨色）
  vec3 bg = vec3(0.010, 0.012, 0.025);

  // 霧: 墨のにじみ（暖灰 + 僅かな赤茶 = 枯葉の色）
  vec3 fogCol = vec3(0.48, 0.44, 0.38);

  vec3 color = bg + fogCol * fog;

  // 和紙の粒（ごく微細なグレイン）
  float grain = hash(gl_FragCoord.xy + u_time * 60.0) * 0.006;
  color += grain;

  gl_FragColor = vec4(color, 1.0);
}
`;

export default function FogBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const startTime = useRef(0);
  const frameToggle = useRef(false);
  const uniformsRef = useRef<{
    gl: WebGLRenderingContext;
    uTime: WebGLUniformLocation;
    uRes: WebGLUniformLocation;
    uPhase: WebGLUniformLocation;
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
      uPhase: gl.getUniformLocation(prog, 'u_phase')!,
    };
    startTime.current = performance.now();
    return true;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.0);
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
      // 30fps制限: 1フレーム置きに描画
      frameToggle.current = !frameToggle.current;
      if (frameToggle.current) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const ref = uniformsRef.current;
      if (!ref) return;
      const t = (performance.now() - startTime.current) / 1000;

      // data-phase 属性からフェーズを読み取り
      const phaseStr = document.documentElement.dataset.phase;
      const phase = phaseStr ? parseFloat(phaseStr) : 0;

      ref.gl.uniform1f(ref.uTime, t);
      ref.gl.uniform2f(ref.uRes, canvas.width, canvas.height);
      ref.gl.uniform1f(ref.uPhase, phase);
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
