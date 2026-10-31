/**
 * Type in Motion's shaders. Every letter is a stack of identical quads, one per layer, that all
 * show the same cut of one glyph texture; the stack's depth is what gives the letter a side. The
 * vertex stage turns each quad by its letter's pose (so a letter tilts as one body, side walls
 * and all), pulls the layers apart when the sentence is broken, and bends the whole sentence under
 * a lens that follows the pointer. The front layer is the ink; the layers behind it run from
 * Racing Red into shadow.
 */

export const TYPE_VERTEX = /* glsl */ `
  attribute vec4 aRect;
  attribute vec4 aUv;
  attribute vec4 aMeta;
  attribute vec4 aPose;
  attribute vec4 aPose2;

  uniform float uExtrude;
  uniform vec2 uPointer;
  uniform float uLens, uLensRadius;

  varying vec2 vUv;
  varying float vLayer;
  varying float vLift;

  vec3 turn(vec3 p, vec3 r) {
    float cx = cos(r.x), sx = sin(r.x);
    float cy = cos(r.y), sy = sin(r.y);
    float cz = cos(r.z), sz = sin(r.z);
    p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
    p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
    return vec3(cz * p.x - sz * p.y, sz * p.x + cz * p.y, p.z);
  }

  void main() {
    vec2 corner = position.xy;
    float layer = aMeta.x;
    float split = aPose2.w;

    // The letter's own space: its quad, and its layers stacked behind it.
    vec3 local = vec3(corner * aRect.zw * 2.0, -layer * uExtrude * (1.0 + split * 2.0));
    vec3 p = turn(local, aPose2.xyz) * aPose.w;
    vec3 world = vec3(aRect.xy, 0.0) + aPose.xyz + p;

    // The lens: the sentence bulges towards the pointer and bends out of its plane there.
    vec2 d = world.xy - uPointer;
    float k = exp(-dot(d, d) / (uLensRadius * uLensRadius));
    world.xy += d * k * uLens;
    world.z += k * uLens * uLensRadius * 1.1;

    vUv = mix(aUv.xy, aUv.zw, corner + 0.5);
    vLayer = layer;
    vLift = k;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(world, 1.0);
  }
`

export const TYPE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uInk, uRed, uShadow;
  uniform float uOpacity;

  varying vec2 vUv;
  varying float vLayer;
  varying float vLift;

  void main() {
    float a = texture2D(uMap, vUv).a;
    if (a < 0.02) discard;

    vec3 side = mix(uRed, uShadow, smoothstep(0.0, 1.0, vLayer));
    vec3 col = vLayer < 0.001 ? uInk * (0.94 + 0.06 * vLift) : side * (1.0 - vLayer * 0.35);
    gl_FragColor = vec4(col, a * uOpacity);
    #include <colorspace_fragment>
  }
`
