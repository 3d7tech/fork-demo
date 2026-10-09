'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from './motion';

/**
 * The building animation: a cloud of points that gathers into Fork's mark as each step of the
 * answer completes, then breathes while it waits. Decorative only (hidden from screen readers);
 * the steps list says what is happening. three.js loads only when this shows, and nothing moves
 * for people who ask for less motion.
 */
export function ForkField({ progress, idle = false }: { progress: number; idle?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const target = useRef(progress);
  target.current = progress;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !host.current) return;
    let stop = false;
    let cleanup = () => {};
    void import('three').then((THREE) => {
      const el = host.current;
      if (stop || !el) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      } catch {
        return; // No WebGL: the static mark stays.
      }
      const size = () => [el.clientWidth || 320, el.clientHeight || 168] as const;
      const [w0, h0] = size();
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w0, h0, false);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      el.appendChild(renderer.domElement);
      el.dataset.live = 'true';

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, w0 / h0, 0.1, 100);
      camera.position.set(0, 0, 9.5);

      // Fork's mark: a stem that divides into three tines. Points are spread along it in 3D.
      const N = 1100;
      const home = new Float32Array(N * 3);
      const start = new Float32Array(N * 3);
      const delay = new Float32Array(N);
      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      for (let i = 0; i < N; i++) {
        const r = Math.random();
        let x: number;
        let y: number;
        if (r < 0.3) {
          y = rand(-2.6, -0.3);
          x = 0;
        } else if (r < 0.45) {
          const t = rand(0, 1);
          x = (t * 2 - 1) * 1.15;
          y = -0.3 + Math.pow(t * 2 - 1, 2) * 0.35;
        } else {
          const tine = Math.floor(rand(0, 3)) - 1;
          y = rand(0.05, 2.4);
          x = tine * 1.15 + tine * Math.max(0, y - 1.8) * 0.12;
        }
        home[i * 3] = x + rand(-0.06, 0.06);
        home[i * 3 + 1] = y + rand(-0.06, 0.06);
        home[i * 3 + 2] = rand(-0.18, 0.18);
        const phi = Math.acos(rand(-1, 1));
        const th = rand(0, Math.PI * 2);
        const rad = rand(3.2, 5.5);
        start[i * 3] = rad * Math.sin(phi) * Math.cos(th);
        start[i * 3 + 1] = rad * Math.sin(phi) * Math.sin(th) * 0.6;
        start[i * 3 + 2] = rad * Math.cos(phi);
        delay[i] = Math.random() * 0.35;
      }
      const pos = new Float32Array(start);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

      // A soft round sprite, so points read as light rather than squares.
      const sprite = document.createElement('canvas');
      sprite.width = sprite.height = 64;
      const g = sprite.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      const tex = new THREE.CanvasTexture(sprite);
      const mat = new THREE.PointsMaterial({ size: 0.11, map: tex, transparent: true, depthWrite: false, opacity: 0.95 });
      const points = new THREE.Points(geo, mat);
      const group = new THREE.Group();
      group.add(points);
      scene.add(group);

      const readColour = () => {
        const css = getComputedStyle(document.documentElement).getPropertyValue('--fk-gain').trim() || '#0f6b45';
        mat.color.set(css);
        const dark = (getComputedStyle(document.documentElement).getPropertyValue('color-scheme') || '').includes('dark');
        mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
        mat.needsUpdate = true;
      };
      readColour();

      let shown = 0;
      let raf = 0;
      let frame = 0;
      const t0 = performance.now();
      const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
      const loop = (now: number) => {
        const t = (now - t0) / 1000;
        const goal = idle ? 0.82 + Math.sin(t * 0.6) * 0.06 : target.current;
        shown += (goal - shown) * 0.04;
        for (let i = 0; i < N; i++) {
          const k = ease((shown - delay[i]!) / (1 - 0.35));
          const j = i * 3;
          const drift = (1 - k) * 0.35;
          pos[j] = start[j]! + (home[j]! - start[j]!) * k + Math.sin(t * 0.9 + i) * drift;
          pos[j + 1] = start[j + 1]! + (home[j + 1]! - start[j + 1]!) * k + Math.cos(t * 0.7 + i * 1.3) * drift;
          pos[j + 2] = start[j + 2]! + (home[j + 2]! - start[j + 2]!) * k;
        }
        geo.attributes.position!.needsUpdate = true;
        group.rotation.y = Math.sin(t * 0.35) * 0.55;
        group.rotation.x = Math.sin(t * 0.25) * 0.12;
        if (++frame % 90 === 0) readColour();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const onResize = () => {
        const [w, h] = size();
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', onResize);
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        geo.dispose();
        mat.dispose();
        tex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        delete el.dataset.live;
      };
    });
    return () => {
      stop = true;
      cleanup();
    };
  }, [reduced, idle]);

  return (
    <div className="fk-field" ref={host} aria-hidden="true">
      {reduced && (
        <svg viewBox="0 0 120 120" role="presentation">
          <path d="M60 104V58M60 58c-14 0-24-6-24-16V18M60 58c14 0 24-6 24-16V18M60 58V18" fill="none" stroke="var(--fk-gain)" strokeWidth="5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
