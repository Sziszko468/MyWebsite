import { LIGHT_OUT, SPRITE } from '../../shaders/chunks'

/**
 * Infinite Space's shaders. The world is a long tube of depth that rushes towards the camera: each
 * object has a fixed place in it and a depth that is `travel` advancing, wrapped, so nothing is
 * ever created or moved on the CPU. The camera is the only thing the visitor steers; the
 * perspective, the vanishing point and the stretch of the light streaks all follow from that.
 *
 * Four systems share one set of uniforms: light streaks (screen-space lines of constant width),
 * floating planes (thin frames in perspective), rings (circles that mark the tunnel's depth) and
 * dust. A click starts a pulse: a band of light that travels away down the tunnel, brightening and
 * pushing outwards whatever it passes.
 */

const SHARED = /* glsl */ `
  ${LIGHT_OUT}
  uniform float uTravel, uTime, uEnergy, uDepth, uBright, uPulseT, uPulseSpeed, uPulseAmp;
  uniform vec3 uRed, uBlue, uInk;

  /** How strongly the pulse's band is at this depth: 0 away from it, up to 1 in it. */
  float pulseAt(float depth) {
    float age = uTime - uPulseT;
    if (age < 0.0 || age > 7.0) return 0.0;
    float d = (depth - age * uPulseSpeed) / 8.0;
    return exp(-d * d) * exp(-age * 0.55) * uPulseAmp;
  }

  vec3 toneOf(float t) {
    return t < 0.15 ? uRed : (t < 0.36 ? uBlue : uInk);
  }
`

export const STREAK_VERTEX = /* glsl */ `
  ${SHARED}
  uniform float uStretch, uAspect, uPxNdc, uWidth;
  attribute vec4 aSeed;
  varying vec3 vTone;
  varying float vAlpha;
  varying float vAcross;
  varying float vAlong;

  void main() {
    vec2 corner = position.xy;
    float angle = aSeed.x * 6.28318;
    float radius = mix(0.8, 17.0, pow(aSeed.y, 1.7));
    float depth = 0.4 + mod(aSeed.z * uDepth + uTravel, uDepth);
    float w = pulseAt(depth);
    radius *= 1.0 + w * 0.2;

    vec3 head = vec3(cos(angle) * radius, sin(angle) * radius, -depth);
    float len = (0.5 + aSeed.w * 2.4) * (1.0 + uStretch * 6.0 + w * 1.8);
    vec3 tail = head - vec3(0.0, 0.0, len);

    vec4 a = projectionMatrix * viewMatrix * vec4(head, 1.0);
    vec4 b = projectionMatrix * viewMatrix * vec4(tail, 1.0);
    vec2 dir = (b.xy / b.w - a.xy / a.w) * vec2(uAspect, 1.0);
    float l = length(dir);
    dir = l > 1e-5 ? dir / l : vec2(0.0, 1.0);
    vec2 normal = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);

    float close = 1.0 / (1.0 + depth * 0.12);
    float widthPx = uWidth * (0.6 + 1.2 * close) * (1.0 + w * 0.8);
    vec4 clip = mix(a, b, corner.y);
    clip.xy += normal * corner.x * widthPx * uPxNdc * clip.w;
    gl_Position = clip;

    float fogFar = 1.0 - smoothstep(uDepth * 0.45, uDepth, depth);
    float fogNear = smoothstep(0.4, 3.0, depth);
    vAlpha = fogFar * fogNear * (0.95 + 1.1 * uEnergy + 1.4 * w) * (0.55 + 0.45 * aSeed.w) * uBright;
    vTone = toneOf(fract(aSeed.w * 7.31 + aSeed.y * 3.7));
    vAcross = corner.x;
    vAlong = corner.y;
  }
`

export const STREAK_FRAGMENT = /* glsl */ `
  ${LIGHT_OUT}
  varying vec3 vTone;
  varying float vAlpha;
  varying float vAcross;
  varying float vAlong;

  void main() {
    float across = 1.0 - abs(vAcross);
    float along = pow(1.0 - vAlong, 0.75);
    gl_FragColor = lightOut(vTone, vAlpha * across * across * along);
    #include <colorspace_fragment>
  }
`

export const PLANE_VERTEX = /* glsl */ `
  ${SHARED}
  attribute vec4 aPlace;   // angle, radius, depth, spin
  attribute vec4 aShape;   // width, height, turn about y, tone
  varying vec2 vUv;
  varying vec3 vTone;
  varying float vAlpha;

  void main() {
    float angle = aPlace.x * 6.28318;
    float depth = 0.6 + mod(aPlace.z * uDepth + uTravel, uDepth);
    float w = pulseAt(depth);
    float radius = aPlace.y * (1.0 + w * 0.12);

    vec2 q = position.xy * aShape.xy;
    float turnY = aShape.z + sin(uTime * 0.15 + aPlace.w * 6.0) * 0.1;
    q = vec2(q.x * cos(turnY), q.y);
    float spin = aPlace.w * 6.28318 + uTravel * 0.004;
    q = vec2(cos(spin) * q.x - sin(spin) * q.y, sin(spin) * q.x + cos(spin) * q.y);

    vec3 world = vec3(cos(angle) * radius + q.x, sin(angle) * radius + q.y, -depth);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);

    float fogFar = 1.0 - smoothstep(uDepth * 0.5, uDepth, depth);
    float fogNear = smoothstep(0.8, 5.0, depth);
    vAlpha = fogFar * fogNear * (0.5 + 0.5 * uEnergy + 1.1 * w) * uBright;
    vTone = toneOf(fract(aShape.w * 5.7));
    vUv = position.xy + 0.5;
  }
`

export const PLANE_FRAGMENT = /* glsl */ `
  ${LIGHT_OUT}
  varying vec2 vUv;
  varying vec3 vTone;
  varying float vAlpha;

  void main() {
    vec2 edge = min(vUv, 1.0 - vUv);
    float line = 1.0 - smoothstep(0.0, 0.035, min(edge.x, edge.y));
    float fill = 0.025 + 0.05 * vUv.y;
    gl_FragColor = lightOut(vTone, vAlpha * (line * 0.9 + fill));
    #include <colorspace_fragment>
  }
`

export const RING_VERTEX = /* glsl */ `
  ${SHARED}
  attribute vec4 aRing;   // radius, depth, thickness, tone
  varying vec2 vUv;
  varying vec3 vTone;
  varying float vAlpha;
  varying float vThin;
  varying float vRadius;

  void main() {
    float depth = 1.0 + mod(aRing.y * uDepth + uTravel, uDepth);
    float w = pulseAt(depth);
    float radius = aRing.x * (1.0 + w * 0.1);
    float extent = radius * 1.25;
    vec3 world = vec3(position.xy * 2.0 * extent, -depth);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);

    float fogFar = 1.0 - smoothstep(uDepth * 0.5, uDepth, depth);
    float fogNear = smoothstep(1.0, 6.0, depth);
    vAlpha = fogFar * fogNear * (0.22 + 0.4 * uEnergy + 1.0 * w) * uBright;
    vTone = toneOf(fract(aRing.w * 3.3));
    vUv = position.xy * 2.0;
    vThin = aRing.z;
    vRadius = 1.0 / 1.25;
  }
`

export const RING_FRAGMENT = /* glsl */ `
  ${LIGHT_OUT}
  varying vec2 vUv;
  varying vec3 vTone;
  varying float vAlpha;
  varying float vThin;
  varying float vRadius;

  void main() {
    float d = length(vUv);
    float ring = 1.0 - smoothstep(0.0, vThin, abs(d - vRadius));
    gl_FragColor = lightOut(vTone, vAlpha * ring);
    #include <colorspace_fragment>
  }
`

export const DUST_VERTEX = /* glsl */ `
  ${SHARED}
  uniform float uPixelRatio, uSize;
  attribute vec4 aSeed;
  varying vec3 vTone;
  varying float vAlpha;

  void main() {
    float depth = 0.6 + mod(aSeed.z * uDepth + uTravel * (0.55 + aSeed.w * 0.7), uDepth);
    float angle = aSeed.x * 6.28318 + uTime * 0.02 * (aSeed.w - 0.5);
    float radius = mix(0.6, 22.0, pow(aSeed.y, 1.4));
    float w = pulseAt(depth);
    vec3 world = vec3(cos(angle) * radius, sin(angle) * radius, -depth);
    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 + w * 1.5) * uPixelRatio * clamp(14.0 / -mv.z, 0.5, 3.5);
    float fogFar = 1.0 - smoothstep(uDepth * 0.5, uDepth, depth);
    float fogNear = smoothstep(0.6, 4.0, depth);
    vAlpha = fogFar * fogNear * (0.35 + 0.5 * uEnergy + 0.9 * w) * uBright;
    vTone = toneOf(fract(aSeed.w * 9.1));
  }
`

export const DUST_FRAGMENT = /* glsl */ `
  ${SPRITE}
  ${LIGHT_OUT}
  varying vec3 vTone;
  varying float vAlpha;

  void main() {
    float mask = spriteMask(gl_PointCoord);
    if (mask < 0.01) discard;
    gl_FragColor = lightOut(vTone, vAlpha * mask * mask);
    #include <colorspace_fragment>
  }
`

export const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 2.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(position.xy * 120.0, -90.0, 1.0);
  }
`

export const GLOW_FRAGMENT = /* glsl */ `
  ${LIGHT_OUT}
  uniform vec3 uInk, uBlue, uRed;
  uniform float uEnergy, uBright, uPulseGlow;
  varying vec2 vUv;

  void main() {
    float d = length(vUv);
    float core = exp(-d * d * 28.0);
    float halo = exp(-d * d * 4.0);
    vec3 colour = mix(uBlue, uInk, core) + uRed * uPulseGlow * 0.6;
    gl_FragColor = lightOut(colour, (core * 0.5 + halo * 0.12) * (0.45 + 0.8 * uEnergy + uPulseGlow) * uBright);
    #include <colorspace_fragment>
  }
`
