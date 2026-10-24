// GLSL for the hero's glowing surfaces. Glows are written as premultiplied colour with
//   alpha = intensity * (1 - uAdd)
// and drawn with One / OneMinusSrcAlpha blending. With uAdd = 1 that adds light to the image
// (dark theme); with uAdd = 0 it is ordinary alpha painting (light theme), where an additive
// glow would just wash out. The uniform is eased, so a theme change cross-fades.
//
// The two includes at the end of every fragment shader apply tone mapping and colour-space
// conversion only when drawing straight to the screen, so the same shader works with and
// without the bloom composer.

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

const RIBBON_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

/** A light streak: a soft cross-section with pulses that run along the track and trail off behind. */
export const LINE_VERT = RIBBON_VERT
export const LINE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTravel, uRate, uPitch, uTail, uBase, uIntensity, uSoft;
  uniform float uStreak, uPulse, uAdd, uGlow, uBright, uFogNear, uFogFar;
  varying vec2 vUv;
  varying float vDist;

  void main() {
    float across = abs(vUv.x - 0.5) * 2.0;
    float profile = pow(1.0 - across, uSoft);

    // Pulses travel towards the camera; the head is sharp and the tail fades away from it.
    float f = fract((vUv.y + uTravel * uRate) / uPitch);
    float tail = mix(uTail * 2.6, uTail, uStreak);
    float pulse = pow(1.0 - f, tail);

    float fade = smoothstep(uFogFar, uFogNear, vDist) * smoothstep(0.4, 6.0, vDist);
    float a = (uBase + pulse * (1.0 - uBase)) * profile * fade * uIntensity * uGlow * uBright * (1.0 + uPulse * 1.2);

    vec3 hot = uColor * (1.0 + 1.6 * pulse * profile);
    gl_FragColor = vec4(hot * a, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/** Muted lane markings: edge lines and dashes that slide towards the camera. */
export const MARKING_VERT = RIBBON_VERT
export const MARKING_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTravel, uPitch, uAlpha, uFogNear, uFogFar, uBright;
  varying vec2 vUv;
  varying float vDist;

  float band(float x, float a, float b, float aa) {
    return smoothstep(a - aa, a, x) - smoothstep(b, b + aa, x);
  }

  void main() {
    float aa = fwidth(vUv.x) * 1.5 + 0.0005;
    float edges = band(vUv.x, 0.04, 0.054, aa) + band(vUv.x, 0.946, 0.96, aa);
    float phase = fract((vUv.y + uTravel) / uPitch);
    float dash = 1.0 - smoothstep(0.4, 0.45, phase);
    float centre = band(vUv.x, 0.4965, 0.5035, aa) * dash;

    float fade = smoothstep(uFogFar, uFogNear, vDist);
    float a = clamp(edges * 0.55 + centre, 0.0, 1.0) * uAlpha * fade * uBright;
    gl_FragColor = vec4(uColor, a);
    ${OUTPUT}
  }
`

/** Dust motes that rush past the camera and wrap around, adding depth and a sense of speed. */
export const PARTICLE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTravel, uDepth, uSize, uPixelRatio, uFogNear, uFogFar;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    float speed = 0.55 + aSeed * 0.9;
    float z = mod(position.z + uTravel * speed, uDepth) - (uDepth - 12.0);
    vec4 mv = modelViewMatrix * vec4(position.x, position.y, z, 1.0);
    float dist = -mv.z;

    vAlpha = smoothstep(uFogFar, uFogNear, dist) * smoothstep(1.0, 7.0, dist) * (0.35 + 0.65 * aSeed);
    vSeed = aSeed;
    gl_PointSize = max(1.6, uSize * uPixelRatio * (14.0 / max(dist, 1.0)));
    gl_Position = projectionMatrix * mv;
  }
`
export const PARTICLE_FRAG = /* glsl */ `
  uniform vec3 uRed, uBlue;
  uniform float uAdd, uGlow, uBright, uPulse;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.0, 1.0, d);
    vec3 col = vSeed < 0.42 ? uRed : (vSeed < 0.78 ? uBlue : vec3(0.9, 0.92, 1.0));
    float a = soft * soft * vAlpha * uGlow * uBright * (0.8 + uPulse * 1.4);
    gl_FragColor = vec4(col * a, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/** A soft radial glow on a quad: tail-light halos and the horizon glow. */
export const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
export const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity, uAdd, uGlow, uBright, uPulse, uPower;
  varying vec2 vUv;

  void main() {
    float d = length((vUv - 0.5) * 2.0);
    float a = pow(clamp(1.0 - d, 0.0, 1.0), uPower) * uIntensity * uGlow * uBright * (1.0 + uPulse * 0.8);
    gl_FragColor = vec4(uColor * a, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`
