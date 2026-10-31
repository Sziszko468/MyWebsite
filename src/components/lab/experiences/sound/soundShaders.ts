import { SPECTRUM_BINS } from './soundAnalysis'

/**
 * The shaders of the Sound Reactive World. The sound reaches them as a few numbers (bass, mids,
 * highs, level, the beat's afterglow) and the spectrum as a small array of floats, so all the
 * movement is the graphics card's work: the page writes about sixty numbers a frame and nothing else.
 */

const BINS = SPECTRUM_BINS
const LAST = (SPECTRUM_BINS - 1).toFixed(1)

const NOISE = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }
`

/** The particles: a shell of points, each tied to one pitch by its height, pushed out by that pitch's strength. */
export const PARTICLE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSpectrum[${BINS}];
  uniform float uBass;
  uniform float uMid;
  uniform float uHigh;
  uniform float uBeat;
  uniform float uPart;
  uniform float uPixel;
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform vec3 uColC;
  attribute float aBin;
  attribute vec2 aSeed;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float e = uSpectrum[int(clamp(aBin, 0.0, ${LAST}))];
    float r0 = length(position);
    vec3 dir = position / max(r0, 1e-4);

    float push = e * 1.5 * uPart + uBeat * 0.45 * uPart * aSeed.x + uBass * 0.2 * uPart;
    float turn = uTime * (0.08 + 0.25 * aSeed.y) * (0.4 + uMid * 1.5 * uPart) + e * 1.2 * (aSeed.x - 0.5) * uPart;
    float c = cos(turn);
    float s = sin(turn);
    vec3 p = dir * (r0 + push);
    p.xz = mat2(c, -s, s, c) * p.xz;
    // The highs make the points shimmer.
    p += vec3(
      sin(aSeed.x * 91.0 + uTime * 9.0),
      cos(aSeed.y * 57.0 + uTime * 11.0),
      sin((aSeed.x + aSeed.y) * 33.0 + uTime * 7.0)
    ) * uHigh * 0.07 * uPart;

    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    float size = (0.8 + aSeed.x) * (1.0 + e * 2.2 + uBeat * 0.8);
    gl_PointSize = clamp(size * uPixel / max(-view.z, 0.5), 1.0, 36.0);

    float t = aBin / ${LAST};
    vec3 base = t < 0.5 ? mix(uColA, uColC, t * 2.0) : mix(uColC, uColB, (t - 0.5) * 2.0);
    vColor = base * (0.55 + e * 1.4 + uBeat * 0.3);
    vAlpha = 0.45 + 0.5 * e;
  }
`

export const PARTICLE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 1.6);
    gl_FragColor = vec4(pow(vColor, vec3(0.4545)) * (0.55 + 0.9 * a), a * vAlpha);
  }
`

/** The form at the middle: a sphere the bass pushes out, the level roughens and the loud moments make spiky. */
export const ORB_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uLevel;
  uniform float uBeat;
  uniform float uGeo;
  varying vec3 vWorld;
  ${NOISE}

  void main() {
    vec3 dir = normalize(position);
    float n = noise(dir * (1.6 + uMid * 2.0) + vec3(0.0, uTime * 0.35, uTime * 0.2));
    float spike = noise(dir * 5.0 - uTime * 0.6);
    float d = (n - 0.5) * (0.16 + 0.75 * uLevel * uGeo)
            + uBass * 0.42 * uGeo
            + uBeat * 0.16 * uGeo
            + pow(spike, 3.0) * uLevel * 0.55 * uGeo;
    vec3 p = dir * (1.0 + d);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

/** Lit by two lights whose strength is the high notes; the bass lights its rim. */
export const ORB_FRAGMENT = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  uniform vec3 uLightPos[2];
  uniform vec3 uLightCol[2];
  uniform float uLightI[2];
  uniform float uBass;
  uniform float uLevel;
  varying vec3 vWorld;

  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 view = normalize(cameraPosition - vWorld);
    if (dot(n, view) < 0.0) n = -n;
    vec3 col = uBase * (0.5 + 0.5 * uLevel);
    for (int i = 0; i < 2; i++) {
      vec3 toLight = uLightPos[i] - vWorld;
      float dist = length(toLight);
      vec3 l = toLight / dist;
      float attenuation = 1.0 / (1.0 + 0.1 * dist * dist);
      float diffuse = max(dot(n, l), 0.0);
      vec3 h = normalize(l + view);
      float specular = pow(max(dot(n, h), 0.0), 48.0);
      col += uLightCol[i] * uLightI[i] * attenuation * (diffuse * 0.9 + specular * 1.4) * 2.4;
    }
    float rim = pow(1.0 - max(dot(n, view), 0.0), 2.5);
    col += uRim * rim * (0.25 + uBass * 1.6);
    gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
  }
`

/** A soft disc: the glow of a light. */
export const FLARE_VERTEX = /* glsl */ `
  uniform float uPixel;
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(aSize * uPixel / max(-view.z, 0.5), 0.0, 160.0);
  }
`

export const FLARE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c) * 4.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 2.4);
    gl_FragColor = vec4(pow(vColor, vec3(0.4545)) * a, a);
  }
`
