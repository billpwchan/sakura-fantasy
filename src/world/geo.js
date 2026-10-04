// Small geometry builder for procedural trees and buildings: tubes with parallel-transported frames, cards, boxes.
import * as THREE from 'three';

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();

export class Builder {
  constructor(auxSize = 0) {
    this.pos = []; this.nrm = []; this.uv = []; this.idx = []; this.aux = []; this.col = [];
    this.auxSize = auxSize;
    this.withColor = false;
    // leaf builders can record each card's centre per vertex, so a shader can grow cards about it with distance
    this.withCtr = false; this.ctr = []; this._c = null;
    // wood for trees only ever seen from afar: tubes thinner than minR are left out, slender ones get fewer sides
    this.minR = 0; this.lodSides = false;
  }
  get count() { return this.pos.length / 3; }
  vert(p, n, u, v, aux, c) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    if (this.auxSize) for (let i = 0; i < this.auxSize; i++) this.aux.push(aux ? aux[i] ?? 0 : 0);
    if (this.withColor) this.col.push(c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1);
    if (this.withCtr) { const q = this._c || p; this.ctr.push(q.x, q.y, q.z); }
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  // tapered tube along points; radii per point; u wraps once per circumference metre count
  tube(pts, radii, sides = 6, vScale = 1.5, aux = null, cap = false) {
    if (radii[0] < this.minR) return;
    if (this.lodSides && radii[0] < 0.15) sides = Math.max(3, Math.round(sides * 0.6));
    // a twig's end is too fine to see open
    cap = cap && radii[radii.length - 1] > 0.015;
    let prevN = null;
    let len = 0;
    const base = this.count;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i < pts.length - 1) _t.subVectors(pts[i + 1], p).normalize();
      else _t.subVectors(p, pts[i - 1]).normalize();
      if (!prevN) {
        _n.set(0, 1, 0);
        if (Math.abs(_t.y) > 0.9) _n.set(1, 0, 0);
        _n.sub(_t.clone().multiplyScalar(_n.dot(_t))).normalize();
      } else {
        _n.copy(prevN).sub(_t.clone().multiplyScalar(prevN.dot(_t))).normalize();
      }
      prevN = _n.clone();
      _b.crossVectors(_t, _n).normalize();
      if (i > 0) len += p.distanceTo(pts[i - 1]);
      const r = radii[i];
      const circ = Math.max(1, Math.round((2 * Math.PI * r) / 0.6));
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = _n.x * ca + _b.x * sa, ny = _n.y * ca + _b.y * sa, nz = _n.z * ca + _b.z * sa;
        _p.set(p.x + nx * r, p.y + ny * r, p.z + nz * r);
        this.vert(_p, { x: nx, y: ny, z: nz }, (s / sides) * circ, len / vScale, typeof aux === 'function' ? aux(i, p) : aux);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const a = base + i * (sides + 1) + s, b = a + 1, c = a + sides + 1, d = c + 1;
        this.quad(a, c, d, b);
      }
    }
    if (cap) {
      const last = pts[pts.length - 1];
      const ci = this.vert(last, _t, 0.5, len / vScale, typeof aux === 'function' ? aux(pts.length - 1, last) : aux);
      const ring = base + (pts.length - 1) * (sides + 1);
      for (let s = 0; s < sides; s++) this.tri(ring + s, ring + s + 1, ci);
    }
  }

  // a square card centred on c with axes T, B (unit) and half-size h; normal supplied (for soft crown shading)
  card(c, T, B, h, n, aux, c0) {
    this._c = c;
    const a = this.vert(_p.set(c.x - T.x * h - B.x * h, c.y - T.y * h - B.y * h, c.z - T.z * h - B.z * h), n, 0, 0, aux, c0);
    const b = this.vert(_p.set(c.x + T.x * h - B.x * h, c.y + T.y * h - B.y * h, c.z + T.z * h - B.z * h), n, 1, 0, aux, c0);
    const d = this.vert(_p.set(c.x + T.x * h + B.x * h, c.y + T.y * h + B.y * h, c.z + T.z * h + B.z * h), n, 1, 1, aux, c0);
    const e = this.vert(_p.set(c.x - T.x * h + B.x * h, c.y - T.y * h + B.y * h, c.z - T.z * h + B.z * h), n, 0, 1, aux, c0);
    this.quad(a, b, d, e);
    this._c = null;
  }

  // axis-aligned box (before transform) with per-face normals; m = optional Matrix4
  box(sx, sy, sz, m, uvScale = 1, aux, c0) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (m) g.applyMatrix4(m);
    this.addGeometry(g, uvScale, aux, c0);
  }

  addGeometry(g, uvScale = 1, aux, c0) {
    const gi = g.index ? g : null;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      this.vert({ x: p.getX(i), y: p.getY(i), z: p.getZ(i) }, { x: n.getX(i), y: n.getY(i), z: n.getZ(i) }, uv ? uv.getX(i) * uvScale : 0, uv ? uv.getY(i) * uvScale : 0, aux, c0);
    }
    if (gi) for (let i = 0; i < gi.index.count; i++) this.idx.push(base + gi.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  build(auxName = 'aAux') {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.auxSize) g.setAttribute(auxName, new THREE.Float32BufferAttribute(this.aux, this.auxSize));
    if (this.withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.withCtr) g.setAttribute('aCtr', new THREE.Float32BufferAttribute(this.ctr, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
