import { HASH, LIGHT_OUT, SIMPLEX_NOISE, SPRITE, SURFACE_DEFORM } from '../shaders/chunks'

/**
 * The Lab hero's two shaders. The core is a sphere whose surface is a function of direction (see
 * SURFACE_DEFORM) drawn as contour lines: the stripes are cut through the shape along one axis and
 * bend with the deformation, so the lines show exactly how the surface is being pushed. Red heat
 * runs along them where the pointer presses and where a click's wave passes; cobalt and red rim
 * light come from opposite sides. The dust is a halo of points that parts around the pointer and
 * is thrown outward by a click.
 */

export const CORE_VERTEX = /* glsl */ `
  ${SIMPLEX_NOISE}
  ${SURFACE_DEFORM}

  varying vec3 vNormalV;
  varying vec3 vDir;
  varying vec3 vViewPos;
  varying float vField;
  varying float vHeat;

  void main() {
    vec3 p = normalize(position);
    float f = surfaceField(p);
    vec3 n = deformedNormal(p);

    float a = acos(clamp(dot(p, uHit), -1.0, 1.0));
    float heat = uHitAmt * exp(-a * a * 6.0);
    for (int i = 0; i < 4; i++) heat += abs(surfaceRipple(p, uRip[i])) * 1.6;

    vDir = p;
    vField = f;
    vHeat = heat;
    vNormalV = normalize(normalMatrix * n);
    vec4 mv = modelViewMatrix * vec4(p * (1.0 + f), 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`

export const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uBase, uLine, uRed, uBlue, uLightDir;
  uniform float uStripes, uContour, uEnergy, uAdd;

  varying vec3 vNormalV;
  varying vec3 vDir;
  varying vec3 vViewPos;
  varying float vField;
  varying float vHeat;

  void main() {
    vec3 N = normalize(vNormalV);
    vec3 V = normalize(-vViewPos);
    float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    float diff = max(dot(N, normalize(uLightDir)), 0.0);

    // Stripes cut through the shape along one axis, bent by the deformation.
    float h = dot(vDir, normalize(vec3(0.35, 1.0, 0.2))) * uStripes + vField * uContour;
    float w = fwidth(h);
    float f = abs(fract(h) - 0.5);
    float line = 1.0 - smoothstep(0.0, max(w * 1.5, 0.012), 0.5 - f);
    line *= 1.0 - smoothstep(0.4, 0.95, w);

    float heat = clamp(vHeat, 0.0, 1.0);
    vec3 lineColour = mix(uLine, uRed * 1.5, heat);

    vec3 col = uBase * (0.3 + 0.7 * diff);
    float strength = clamp(line * (0.3 + 0.55 * diff + 0.8 * fres + 1.3 * heat), 0.0, 1.0);
    col = mix(col, lineColour, strength);

    float rimGain = mix(0.35, 1.0, uAdd) * (0.9 + uEnergy);
    vec3 rim = fres * (uBlue * smoothstep(-0.3, 1.0, N.x * 0.7 + N.y * 0.5) + uRed * smoothstep(-0.3, 1.0, -N.x * 0.7 - N.y * 0.3));
    col += rim * rimGain;
    col += uRed * heat * heat * 0.28;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export const DUST_VERTEX = /* glsl */ `
  ${HASH}
  uniform float uTime, uPhase, uBurst, uBurstAmt, uSize, uPixelRatio, uAspect, uPointerAmt;
  uniform vec2 uPointer;
  attribute vec4 aSeed;
  varying float vTone;
  varying float vNear;
  varying float vBlink;

  void main() {
    vec3 p = position;
    float ang = uPhase * (0.04 + aSeed.y * 0.1) + aSeed.z * 6.28318;
    float c = cos(ang);
    float s = sin(ang);
    p = vec3(c * p.x + s * p.z, p.y + sin(uPhase * 0.6 + aSeed.z * 9.0) * 0.06, -s * p.x + c * p.z);

    float age = uTime - uBurst;
    float shock = exp(-age * 1.3) * smoothstep(0.0, 0.2, age);
    p *= 1.0 + shock * uBurstAmt * (0.3 + aSeed.x);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vec4 clip = projectionMatrix * mv;

    vec2 ndc = clip.xy / clip.w;
    vec2 d = (ndc - uPointer) * vec2(uAspect, 1.0);
    float near = exp(-dot(d, d) * 6.0) * uPointerAmt;
    vec2 push = d / (length(d) + 0.02) * near * 0.15;
    clip.xy += vec2(push.x / uAspect, push.y) * clip.w;

    gl_Position = clip;
    gl_PointSize = uSize * (0.55 + aSeed.x) * (1.0 + near * 1.1) * (7.0 / -mv.z) * uPixelRatio;
    vTone = aSeed.w;
    vNear = near;
    vBlink = 0.55 + 0.45 * sin(uPhase * (0.8 + aSeed.y) + aSeed.z * 20.0);
  }
`

export const DUST_FRAGMENT = /* glsl */ `
  ${SPRITE}
  ${LIGHT_OUT}
  uniform vec3 uRed, uBlue, uInk;
  uniform float uBright;
  varying float vTone;
  varying float vNear;
  varying float vBlink;

  void main() {
    float mask = spriteMask(gl_PointCoord);
    if (mask < 0.01) discard;
    vec3 colour = vTone < 0.14 ? uRed : vTone < 0.3 ? uBlue : uInk;
    float intensity = mask * mask * (0.2 + 0.45 * vBlink) * uBright * (1.0 + vNear * 1.6);
    gl_FragColor = lightOut(colour, intensity);
    #include <colorspace_fragment>
  }
`
