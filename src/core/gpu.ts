import type { WebGLRenderingContext } from '@nativescript/canvas';

/**
 * How many pixels per dp a fragment-heavy GL scene should render at.
 *
 * Real GPUs get `max` (screen scale beyond that is invisible behind fog and
 * grain, and costs frame rate). A software rasterizer, like the iOS
 * Simulator's OpenGL ES ("Apple Software Renderer", no Metal behind it),
 * gets half a pixel per dp so the scenes stay animated while you develop.
 */
export function glPixelRatio(gl: WebGLRenderingContext | WebGL2RenderingContext | any, scale: number, max: number): number {
  let renderer = '';
  try {
    renderer = String(gl.getParameter(gl.RENDERER));
  } catch {}
  if (/software|swiftshader|llvmpipe/i.test(renderer)) {
    return Math.min(scale, 0.5);
  }
  return Math.min(scale, max);
}
