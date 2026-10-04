// Camera director: a follow camera you can orbit and zoom, a passenger's seat, a cinematic mode that cuts
// between composed shots, and a photo mode that orbits like the follow camera. Always kept above the ground and the water.
import * as THREE from 'three';
import { terrainHeight } from '../world/layout.js';
import { clamp } from '../lib/math.js';

const V = () => new THREE.Vector3();

export class Director {
  constructor(camera, dom) {
    this.camera = camera;
    this.mode = 'follow';
    this.yaw = 0.35; // around the boat, relative to its heading
    this.pitch = 0.2;
    this.dist = 13;
    this.wantYaw = this.yaw; this.wantPitch = this.pitch; this.wantDist = this.dist;
    this.pos = V(); this.look = V();
    this.tPos = V(); this.tLook = V();
    this.shot = null;
    this.shotT = 0;
    this.shotIdx = 0;
    this.idle = 0;
    this.fov = 50;
    this.lookYaw = 0; this.lookPitch = 0;
    this.first = true;
    this._fw = V(); this._rt = V(); this._v = V();
    this.bind(dom);
  }

  bind(dom) {
    let drag = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      this.idle = 0;
      if (this.mode === 'seat') {
        this.lookYaw = clamp(this.lookYaw - dx * 0.004, -2.4, 2.4);
        this.lookPitch = clamp(this.lookPitch - dy * 0.003, -0.5, 0.7);
      } else {
        if (this.mode === 'cinema') this.setMode('follow');
        this.wantYaw -= dx * 0.005;
        this.wantPitch = clamp(this.wantPitch + dy * 0.003, -0.05, 1.25);
      }
    });
    const up = (e) => { if (drag && drag.id === e.pointerId) drag = null; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.idle = 0;
      if (this.mode === 'seat') { this.fov = clamp(this.fov + e.deltaY * 0.02, 22, 70); return; }
      if (this.mode === 'cinema') this.setMode('follow');
      this.wantDist = clamp(this.wantDist * Math.exp(e.deltaY * 0.0012), 4.5, 90);
    }, { passive: false });
    // pinch zoom on touch
    const touches = new Map();
    let pinch0 = 0;
    dom.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) touches.set(t.identifier, t); if (e.touches.length === 2) pinch0 = this.pinchD(e.touches); }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinch0) {
        const d = this.pinchD(e.touches);
        this.wantDist = clamp(this.wantDist * (pinch0 / d), 4.5, 90);
        pinch0 = d;
      }
    }, { passive: true });
    dom.addEventListener('touchend', () => { pinch0 = 0; }, { passive: true });
  }

  pinchD(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1; }

  setMode(m) {
    if (this.mode === m) return;
    this.mode = m;
    this.shot = null;
    this.shotT = 0;
    if (m === 'seat') { this.lookYaw = 0; this.lookPitch = 0.02; this.fov = 50; }
    if (m === 'follow' || m === 'photo') this.fov = 50;
    this.onMode && this.onMode(m);
  }

  // composed shots for cinema mode, relative to the boat
  nextShot(boat) {
    const kinds = ['low', 'crane', 'bank', 'bow', 'aerial', 'beside'];
    const k = kinds[this.shotIdx++ % kinds.length];
    const side = this.shotIdx % 2 ? 1 : -1;
    this.shot = { k, side, t: 0, dur: k === 'bank' ? 11 : 9.5, anchor: null };
    if (k === 'bank') {
      // a fixed camera on the bank ahead; the boat glides past
      const ahead = 34 + boat.speed * 3;
      const a = new THREE.Vector3(boat.x + Math.sin(boat.heading) * ahead + Math.cos(boat.heading) * side * 11, 0, boat.z + Math.cos(boat.heading) * ahead - Math.sin(boat.heading) * side * 11);
      a.y = Math.max(terrainHeight(a.x, a.z), 0) + 1.6;
      this.shot.anchor = a;
    }
  }

  update(dt, boat) {
    const cam = this.camera;
    const h = boat.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const k = 1 - Math.exp(-dt * 3.2);
    this.idle += dt;

    this.yaw += (this.wantYaw - this.yaw) * (1 - Math.exp(-dt * 6));
    this.pitch += (this.wantPitch - this.pitch) * (1 - Math.exp(-dt * 6));
    this.dist += (this.wantDist - this.dist) * (1 - Math.exp(-dt * 5));

    let snap = false;
    if (this.mode === 'follow' || this.mode === 'photo') {
      const a = h + Math.PI + this.yaw;
      const cd = this.dist * Math.cos(this.pitch);
      this.tPos.set(boat.x + Math.sin(a) * cd, 1.4 + this.dist * Math.sin(this.pitch), boat.z + Math.cos(a) * cd);
      this.tLook.set(boat.x + fx * 3.5, 1.6 + this.dist * 0.04, boat.z + fz * 3.5);
    } else if (this.mode === 'seat') {
      const a = h + this.lookYaw;
      this.tPos.set(boat.x + fx * 1.9, 0.86, boat.z + fz * 1.9);
      this.tLook.set(this.tPos.x + Math.sin(a) * 10, 0.86 + Math.tan(this.lookPitch) * 10, this.tPos.z + Math.cos(a) * 10);
      snap = true;
    } else if (this.mode === 'cinema') {
      if (!this.shot || this.shot.t > this.shot.dur) { this.nextShot(boat); snap = true; }
      const s = this.shot;
      s.t += dt;
      const u = s.t / s.dur;
      const sd = s.side;
      const rx = fz, rz = -fx; // boat's right
      switch (s.k) {
        case 'low':
          this.tPos.set(boat.x - fx * (9 - u * 4) + rx * sd * 3.2, 0.55, boat.z - fz * (9 - u * 4) + rz * sd * 3.2);
          this.tLook.set(boat.x + fx * 2, 1.5, boat.z + fz * 2);
          break;
        case 'crane': {
          const y = 4 + u * 16;
          this.tPos.set(boat.x - fx * (6 + u * 12) + rx * sd * 4, y, boat.z - fz * (6 + u * 12) + rz * sd * 4);
          this.tLook.set(boat.x + fx * (4 + u * 25), 1.2 + u * 3, boat.z + fz * (4 + u * 25));
          break;
        }
        case 'bank':
          this.tPos.copy(s.anchor);
          this.tLook.set(boat.x, 1.4, boat.z);
          break;
        case 'bow':
          this.tPos.set(boat.x + fx * 7.5 + rx * sd * 1.5, 1.7, boat.z + fz * 7.5 + rz * sd * 1.5);
          this.tLook.set(boat.x - fx * 1.5, 1.3, boat.z - fz * 1.5);
          break;
        case 'aerial': {
          const a = h + Math.PI + sd * (0.4 + u * 0.8);
          this.tPos.set(boat.x + Math.sin(a) * 34, 26 - u * 6, boat.z + Math.cos(a) * 34);
          this.tLook.set(boat.x + fx * 20, 0, boat.z + fz * 20);
          break;
        }
        case 'beside':
          this.tPos.set(boat.x + rx * sd * 6 + fx * (u * 6 - 3), 1.5, boat.z + rz * sd * 6 + fz * (u * 6 - 3));
          this.tLook.set(boat.x + fx * 1.5, 1.3, boat.z + fz * 1.5);
          break;
      }
      snap = s.t <= dt * 1.5;
    }

    // stay above ground and water
    const g = terrainHeight(this.tPos.x, this.tPos.z);
    this.tPos.y = Math.max(this.tPos.y, Math.max(g, 0) + (this.mode === 'seat' ? 0.6 : 0.45));

    if (this.first || snap) {
      this.pos.copy(this.tPos);
      this.look.copy(this.tLook);
      this.first = false;
    } else {
      const kp = this.mode === 'cinema' ? 1 - Math.exp(-dt * 6) : k;
      this.pos.lerp(this.tPos, this.mode === 'seat' ? 1 : kp);
      this.look.lerp(this.tLook, this.mode === 'seat' ? 1 : 1 - Math.exp(-dt * 5));
    }
    cam.position.copy(this.pos);
    cam.lookAt(this.look);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov += (this.fov - cam.fov) * (1 - Math.exp(-dt * 6));
      cam.updateProjectionMatrix();
    }
  }
}
