// Shows a creature in the browser with three.js: one instanced mesh per kind of shape, with each
// shape's colour, alpha, shine and sharpness carried per instance.

import { toRgb, type LaidShape, type ShapeName, type Value } from "@genocode/core";
import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshPhongMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { creatureBounds, shapeGeometry } from "./geometry.js";
import { backgroundRamp, FIELD_OF_VIEW, frameCamera, LIGHTS } from "./look.js";

/** Adds per-instance shine (x), sharpness (y) and alpha (z) to the Phong material. */
function addInstanceLook(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec3 instanceLook;\nvarying vec3 vLook;",
    )
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLook = instanceLook;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vLook;")
    .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vLook.z;")
    .replace(
      "#include <lights_phong_fragment>",
      [
        "BlinnPhongMaterial material;",
        "material.diffuseColor = diffuseColor.rgb;",
        "material.specularColor = vec3( vLook.x );",
        "material.specularShininess = 4.0 + vLook.y * 124.0;",
        "material.specularStrength = 1.0;",
      ].join("\n"),
    );
}

function makeMaterial(transparent: boolean): MeshPhongMaterial {
  const material = new MeshPhongMaterial({
    color: 0xffffff,
    transparent,
    depthWrite: !transparent,
  });
  material.onBeforeCompile = addInstanceLook;
  // Keeps three from sharing the compiled program with plain Phong materials.
  material.customProgramCacheKey = () => "genocode-instance-look";
  return material;
}

/** Light strengths in three are scaled by π compared with the software renderer's. */
const LIGHT_SCALE = Math.PI;

export class CreatureView {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 1000);
  private readonly scene = new Scene();
  private readonly creature = new Group();
  private readonly controls: OrbitControls;
  private readonly opaque = makeMaterial(false);
  private readonly seeThrough = makeMaterial(true);
  private readonly resizeObserver: ResizeObserver;
  private shapes: readonly LaidShape[] = [];
  private frameRequested = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.scene.add(this.creature);
    this.scene.add(new AmbientLight(0xffffff, LIGHTS.ambient * LIGHT_SCALE));
    for (const l of [LIGHTS.key, LIGHTS.fill]) {
      const light = new DirectionalLight(0xffffff, l.strength * LIGHT_SCALE);
      light.position.set(...l.direction);
      this.scene.add(light);
    }
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener("change", () => this.requestFrame());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.setBackground(undefined);
    this.resize();
  }

  /** Replaces the creature on show. With `keepView`, the camera stays where the viewer left it. */
  setCreature(shapes: readonly LaidShape[], keepView = false): void {
    for (const child of [...this.creature.children]) {
      this.creature.remove(child);
      const mesh = child as InstancedMesh;
      mesh.geometry.dispose(); // each mesh has its own copy, carrying its instance attributes
      mesh.dispose();
    }
    this.shapes = shapes;
    const groups = new Map<string, LaidShape[]>();
    for (const s of shapes) {
      if (s.colour.a <= 0) continue;
      const key = `${s.shape}/${s.mirrored}/${s.colour.a < 0.999}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    const matrix = new Matrix4();
    const colour = new Color();
    for (const [key, members] of groups) {
      const [shape, mirrored, transparent] = key.split("/");
      const mesh = new InstancedMesh(
        shapeGeometry(shape as ShapeName, mirrored === "true"),
        transparent === "true" ? this.seeThrough : this.opaque,
        members.length,
      );
      const look = new Float32Array(members.length * 3);
      members.forEach((s, i) => {
        matrix.fromArray(s.matrix);
        mesh.setMatrixAt(i, matrix);
        const [r, g, b] = toRgb(s.colour);
        mesh.setColorAt(i, colour.setRGB(r, g, b, SRGBColorSpace));
        look[i * 3] = s.shine;
        look[i * 3 + 1] = s.sharpness;
        look[i * 3 + 2] = s.colour.a;
      });
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.setAttribute("instanceLook", new InstancedBufferAttribute(look, 3));
      mesh.computeBoundingSphere();
      this.creature.add(mesh);
    }
    if (!keepView) this.resetView();
    this.requestFrame();
  }

  /** Shows a background's fill: a colour, a gradient, or (until patterns exist) a tinted default. */
  setBackground(fill: Value | undefined): void {
    const rows = 256;
    const ramp = backgroundRamp(fill, rows);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = rows;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(1, rows);
    ramp.forEach((c, i) => {
      const row = rows - 1 - i;
      image.data.set([c[0] * 255, c[1] * 255, c[2] * 255, 255], row * 4);
    });
    ctx.putImageData(image, 0, 0);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const old = this.scene.background;
    this.scene.background = texture;
    if (old && "dispose" in old) old.dispose();
    this.requestFrame();
  }

  /** Frames the whole creature, seen from the front and a little above. */
  resetView(): void {
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const placement = frameCamera(creatureBounds(this.shapes), aspect);
    this.camera.position.set(...placement.position);
    this.camera.near = placement.near / 4;
    this.camera.far = placement.far * 4;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(...placement.target);
    this.controls.minDistance = 0;
    this.controls.maxDistance =
      new Vector3(...placement.position).distanceTo(this.controls.target) * 8;
    this.controls.update();
    this.requestFrame();
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      // Damping keeps the view moving for a moment after the mouse lets go.
      if (this.controls.update()) this.requestFrame();
      this.renderer.render(this.scene, this.camera);
    });
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const child of this.creature.children) (child as InstancedMesh).dispose();
    this.opaque.dispose();
    this.seeThrough.dispose();
    this.renderer.dispose();
  }
}
