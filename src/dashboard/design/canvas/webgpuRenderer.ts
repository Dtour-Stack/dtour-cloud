/// <reference types="@webgpu/types" />
import { ACCENT, CANVAS_BG, IMAGE_PLACEHOLDER, isGpuNode, type Renderer, type Scene, type View } from "./types";

const FLOATS_PER_VERT = 6; // x, y, r, g, b, a
const VERTS_PER_QUAD = 6;

const WGSL = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex
fn vs(@location(0) p: vec2f, @location(1) c: vec4f) -> VSOut {
  var o: VSOut;
  o.pos = vec4f(p, 0.0, 1.0);
  o.color = c;
  return o;
}

@fragment
fn fs(@location(0) c: vec4f) -> @location(0) vec4f {
  // premultiplied alpha (context alphaMode = "premultiplied")
  return vec4f(c.rgb * c.a, c.a);
}
`;

/** Build the GPU rendering backend. Resolves to null when WebGPU is
 *  unavailable so the caller can fall back to Canvas2D. */
export async function createWebGPURenderer(
  canvas: HTMLCanvasElement,
): Promise<Renderer | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter();
  } catch {
    return null;
  }
  if (!adapter) return null;

  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) return null;

  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "premultiplied" });

  const module = device.createShaderModule({ code: WGSL });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: FLOATS_PER_VERT * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 2 * 4, format: "float32x4" },
          ],
        },
      ],
    },
    fragment: {
      module,
      entryPoint: "fs",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  let vbuf: GPUBuffer | null = null;
  let vbufQuads = 0;

  function ensureBuffer(quadCount: number) {
    if (vbuf && vbufQuads >= quadCount) return;
    vbuf?.destroy();
    vbufQuads = Math.max(quadCount, 64);
    vbuf = device.createBuffer({
      size: vbufQuads * VERTS_PER_QUAD * FLOATS_PER_VERT * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  return {
    backend: "webgpu",

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    },

    render(scene: Scene, view: View, selectionId: string | null) {
      const cssW = canvas.clientWidth || 1;
      const cssH = canvas.clientHeight || 1;
      const verts: number[] = [];

      // Convert a screen-space rect into 2 clip-space triangles.
      const pushRect = (
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        c: [number, number, number, number],
      ) => {
        const x0 = (sx / cssW) * 2 - 1;
        const x1 = ((sx + sw) / cssW) * 2 - 1;
        const y0 = 1 - (sy / cssH) * 2;
        const y1 = 1 - ((sy + sh) / cssH) * 2;
        const [r, g, b, a] = c;
        const v = (x: number, y: number) => verts.push(x, y, r, g, b, a);
        v(x0, y0); v(x1, y0); v(x0, y1);
        v(x0, y1); v(x1, y0); v(x1, y1);
      };

      for (const n of scene.nodes) {
        if (!isGpuNode(n.type) && n.type !== "image") continue;
        const sx = n.x * view.zoom + view.panX;
        const sy = n.y * view.zoom + view.panY;
        const fill = n.type === "image" ? IMAGE_PLACEHOLDER : n.fill;
        pushRect(sx, sy, n.w * view.zoom, n.h * view.zoom, fill);
      }

      // Selection outline = four thin border quads.
      const sel = selectionId && scene.nodes.find((n) => n.id === selectionId);
      if (sel) {
        const t = 2;
        const sx = sel.x * view.zoom + view.panX;
        const sy = sel.y * view.zoom + view.panY;
        const sw = sel.w * view.zoom;
        const sh = sel.h * view.zoom;
        pushRect(sx - t, sy - t, sw + 2 * t, t, ACCENT);
        pushRect(sx - t, sy + sh, sw + 2 * t, t, ACCENT);
        pushRect(sx - t, sy, t, sh, ACCENT);
        pushRect(sx + sw, sy, t, sh, ACCENT);
      }

      const quadCount = verts.length / (FLOATS_PER_VERT * VERTS_PER_QUAD);
      const vertCount = verts.length / FLOATS_PER_VERT;
      if (quadCount > 0) {
        ensureBuffer(quadCount);
        device.queue.writeBuffer(vbuf as GPUBuffer, 0, new Float32Array(verts));
      }

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            clearValue: { r: CANVAS_BG[0], g: CANVAS_BG[1], b: CANVAS_BG[2], a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      if (vertCount > 0 && vbuf) {
        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, vbuf);
        pass.draw(vertCount);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    },

    destroy() {
      vbuf?.destroy();
      device.destroy();
    },
  };
}
