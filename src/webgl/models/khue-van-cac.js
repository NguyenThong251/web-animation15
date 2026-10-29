// Khuê Văn Các (奎文閣, 1805): square two-level pavilion. Ground level: four square
// brick pillars open on all sides on a stone platform. Upper level: a timber room with a
// round window of radiating bars on each face, a balustraded balcony, and a two-tier
// hipped roof (eight slopes) with upturned corners and hooked ridge ornaments.
// Local frame: centre of the platform footprint at y = 0, passage along Z.
import { GeoBag } from "./util.js";
import { hipRoof } from "./roof.js";

/** Key dimensions in metres (shared with the elevation drawing). */
export const KVC = {
  platform: { half: 4.4, h: 0.4 },
  pillar: { at: 2.45, size: 0.95, top: 3.4 },
  floor: { half: 3.45, y0: 3.4, y1: 3.8 },
  balustrade: { half: 3.33, h: 0.8, bays: 8 },
  room: { half: 2.3, top: 6.6, wall: 0.14 },
  window: { y: 4.9, hole: 0.72, ring0: 0.36, ring1: 0.46, bars: 16 },
  lowerRoof: { half: 3.95, inner: 2.2, eave: 5.95, h: 0.85 },
  band: { half: 2.2, y0: 6.6, y1: 7.25 },
  upperRoof: { half: 3.0, ridge: 0.6, eave: 7.15, h: 1.35 },
  top: 9.25, // tip of the ridge ornaments
};

export function buildKhueVanCacGeometry(THREE, { quality = "high" } = {}) {
  const hi = quality !== "low";
  const bag = new GeoBag(THREE);
  const { platform, pillar, floor, balustrade, room, window: win, lowerRoof, band, upperRoof } = KVC;

  // --- stone platform with a lip and steps front and back
  bag.boxOn(platform.half * 2, platform.h - 0.08, platform.half * 2, 0, 0, 0);
  bag.boxOn(platform.half * 2 - 0.2, 0.08, platform.half * 2 - 0.2, 0, platform.h - 0.08, 0);
  for (const sz of [-1, 1]) {
    bag.boxOn(3.4, 0.2, 0.45, 0, 0, sz * (platform.half + 0.45 / 2 + 0.38));
    bag.boxOn(3.4, 0.4, 0.4, 0, 0, sz * (platform.half + 0.2));
  }

  // --- four square brick pillars, each with a plinth, carved face panels and a cap
  const pillarH = pillar.top - platform.h;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * pillar.at, z = sz * pillar.at;
      bag.boxOn(pillar.size + 0.24, 0.22, pillar.size + 0.24, x, platform.h, z);
      bag.boxOn(pillar.size, pillarH, pillar.size, x, platform.h, z);
      // raised carved panels on the four faces (catch a sliver of light at grazing angles)
      for (let f = 0; f < 4; f++) {
        const a = (f * Math.PI) / 2;
        const off = pillar.size / 2 + 0.012;
        bag.add(new THREE.BoxGeometry(pillar.size * 0.66, pillarH * 0.74, 0.025), {
          x: x + Math.sin(a) * off,
          y: platform.h + 0.3 + (pillarH * 0.74) / 2,
          z: z + Math.cos(a) * off,
          ry: a,
        });
      }
    }
  }
  // lintels joining the pillar heads, just under the floor
  for (const s of [-1, 1]) {
    bag.boxOn(pillar.at * 2, 0.42, 0.5, 0, floor.y0 - 0.42, s * pillar.at);
    bag.boxOn(0.5, 0.42, pillar.at * 2, s * pillar.at, floor.y0 - 0.42, 0);
  }

  // --- upper floor slab (its edge is the carved frieze band)
  bag.boxOn(floor.half * 2, floor.y1 - floor.y0, floor.half * 2, 0, floor.y0, 0);
  bag.boxOn(floor.half * 2 + 0.12, 0.08, floor.half * 2 + 0.12, 0, floor.y1 - 0.08, 0);

  // --- balustrade: posts, rails, turned balusters
  const B = balustrade.half;
  const yb = floor.y1;
  const balSegs = hi ? 5 : 4;
  for (let side = 0; side < 4; side++) {
    const ry = (side * Math.PI) / 2;
    const tf = (x, y, z) => ({ x: x * Math.cos(ry) + z * Math.sin(ry), y, z: -x * Math.sin(ry) + z * Math.cos(ry), ry });
    // rails
    bag.add(new THREE.BoxGeometry(B * 2, 0.08, 0.12), tf(0, yb + balustrade.h - 0.04, B));
    bag.add(new THREE.BoxGeometry(B * 2, 0.1, 0.14), tf(0, yb + 0.12, B));
    // posts (corners + bays)
    for (let i = 0; i < balustrade.bays; i++) {
      const x = -B + (i * 2 * B) / balustrade.bays;
      bag.add(new THREE.BoxGeometry(0.14, balustrade.h + 0.1, 0.14), tf(x, yb + (balustrade.h + 0.1) / 2, B));
      bag.add(new THREE.BoxGeometry(0.2, 0.08, 0.2), tf(x, yb + balustrade.h + 0.14, B));
      // turned balusters in the bay
      const bayW = (2 * B) / balustrade.bays;
      const n = 5;
      for (let j = 1; j <= n; j++) {
        const bx = x + (j * bayW) / (n + 1);
        bag.add(baluster(THREE, balustrade.h - 0.25, balSegs), tf(bx, yb + 0.17, B));
      }
    }
  }

  // --- upper room: four walls with round openings, corner + window columns, boards
  const wallH = room.top - floor.y1;
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-room.half, 0);
  wallShape.lineTo(room.half, 0);
  wallShape.lineTo(room.half, wallH);
  wallShape.lineTo(-room.half, wallH);
  wallShape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, win.y - floor.y1, win.hole, 0, Math.PI * 2, true);
  wallShape.holes.push(hole);
  const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: room.wall, bevelEnabled: false, curveSegments: hi ? 40 : 24 });
  wallGeo.translate(0, 0, -room.wall / 2);

  const ringGeo = (r0, r1, depth) => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, 0, Math.PI * 2, false);
    const h = new THREE.Path();
    h.absarc(0, 0, r0, 0, Math.PI * 2, true);
    s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: hi ? 36 : 20 });
    g.translate(0, 0, -depth / 2);
    return g;
  };

  for (let f = 0; f < 4; f++) {
    const ry = (f * Math.PI) / 2;
    const d = room.half - room.wall / 2;
    const tf = (x, y, z, extra = {}) => ({
      x: x * Math.cos(ry) + z * Math.sin(ry),
      y,
      z: -x * Math.sin(ry) + z * Math.cos(ry),
      ry,
      ...extra,
    });
    bag.add(wallGeo.clone(), tf(0, floor.y1, d));
    // window: proud outer frame, inner ring, radiating bars (the rays of the Khuê star)
    bag.add(ringGeo(win.hole - 0.02, win.hole + 0.09, room.wall + 0.1), tf(0, win.y, d));
    bag.add(ringGeo(win.ring0, win.ring1, 0.12), tf(0, win.y, d));
    for (let i = 0; i < win.bars; i++) {
      const a = (i / win.bars) * Math.PI * 2;
      const r = (win.ring1 + win.hole) / 2;
      const len = win.hole - win.ring1 + 0.04;
      bag.add(new THREE.BoxGeometry(0.05, len, 0.07), tf(Math.cos(a) * r, win.y + Math.sin(a) * r, d, { rz: a - Math.PI / 2 }));
    }
    // columns flanking the window, couplet boards and the name board above
    for (const sx of [-1, 1]) {
      bag.add(new THREE.CylinderGeometry(0.11, 0.11, wallH, 8), tf(sx * 1.2, floor.y1 + wallH / 2, d + 0.05));
      bag.add(new THREE.BoxGeometry(0.34, 1.55, 0.04), tf(sx * 1.72, floor.y1 + 1.15, d + room.wall / 2 + 0.02));
    }
    bag.add(new THREE.BoxGeometry(1.25, 0.3, 0.05), tf(0, win.y + win.hole + 0.22, d + room.wall / 2 + 0.03));
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bag.add(new THREE.CylinderGeometry(0.15, 0.15, wallH, 10), { x: sx * room.half, y: floor.y1 + wallH / 2, z: sz * room.half });
      // diagonal brackets carrying the lower eave corners (con sơn)
      const bx = sx * (room.half + 0.55), bz = sz * (room.half + 0.55);
      bag.add(new THREE.BoxGeometry(0.12, 0.12, 1.75), {
        x: bx,
        y: lowerRoof.eave - 0.3,
        z: bz,
        ry: Math.atan2(sx, sz),
        rx: -0.42,
        order: "YXZ",
      });
    }
  }

  // --- lower (skirt) roof, the band between the tiers (cổ diêm), upper roof
  const tile = hi ? 0.3 : 0;
  bag.add(
    hipRoof(THREE, {
      hx: lowerRoof.half,
      hz: lowerRoof.half,
      ix: lowerRoof.inner,
      iz: lowerRoof.inner,
      height: lowerRoof.h,
      lift: 0.55,
      flare: 0.38,
      reach: 1.9,
      sag: 0.3,
      thickness: 0.2,
      segS: hi ? 20 : 12,
      segT: 6,
      tile,
      tileDepth: 0.045,
      bead: 0.085,
      curl: 0.62,
    }),
    { y: lowerRoof.eave },
  );
  bag.boxOn(band.half * 2, band.y1 - band.y0, band.half * 2, 0, band.y0, 0);
  bag.boxOn(band.half * 2 + 0.12, 0.08, band.half * 2 + 0.12, 0, band.y0 + 0.02, 0);
  bag.boxOn(band.half * 2 + 0.12, 0.08, band.half * 2 + 0.12, 0, band.y1 - 0.1, 0);
  bag.add(
    hipRoof(THREE, {
      hx: upperRoof.half,
      hz: upperRoof.half,
      ix: upperRoof.ridge,
      iz: 0,
      height: upperRoof.h,
      lift: 0.5,
      flare: 0.3,
      reach: 1.6,
      sag: 0.45,
      thickness: 0.2,
      segS: hi ? 20 : 12,
      segT: 8,
      tile,
      tileDepth: 0.045,
      bead: 0.085,
      curl: 0.55,
      ridgeOrnament: 0.85,
    }),
    { y: upperRoof.eave },
  );

  return bag.merge();
}

function baluster(THREE, h, segs) {
  // turned baluster: neck, belly, neck (open-ended lathe, the rails cover both ends)
  const pts = [
    [0.04, 0],
    [0.026, 0.2],
    [0.05, 0.5],
    [0.026, 0.8],
    [0.04, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y * h));
  return new THREE.LatheGeometry(pts, segs);
}
