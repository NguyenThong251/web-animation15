// Scene 4 · paper (style 3): a flat #edede9 sheet behind ~25 screens of DOM (typeface wheel,
// poster deck, glyph set). It exists so the transitions into and out of the DOM chapter push a
// real image like every other chapter.
import * as THREE from "three";
import { BaseScene } from "./base.js";
import { STYLE, PALETTE } from "../config.js";

export class PaperScene extends BaseScene {
  constructor(engine) {
    super(engine, { id: "paper", style: STYLE.paper });
  }

  async load() {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(PALETTE.paper),
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
}
