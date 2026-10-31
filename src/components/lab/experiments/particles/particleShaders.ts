import { LIGHT_OUT, SPRITE } from '../../shaders/chunks'

/**
 * The particles are points with a soft round sprite. Depth is what makes them read as a space:
 * particles far from the focal plane are drawn larger, flatter and fainter (a bokeh), the ones in
 * front are small, sharp and bright; the back layers lean cobalt, and speed turns a particle from
 * paper-white to Racing Red.
 */

export const PARTICLE_VERTEX = /* glsl */ `
  uniform float uSize, uFocal, uFocusDistance, uFocusRange;
  attribute float aHeat;
  attribute vec4 aSeed;
  varying float vHeat;
  varying float vLayer;
  varying float vTone;
  varying float vBlur;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float depth = max(-mv.z, 4.5);
    float blur = clamp(abs(depth - uFocusDistance) / uFocusRange, 0.0, 1.0);
    float world = uSize * aSeed.x * (1.0 + blur * 1.5 + aHeat * 0.55);
    gl_PointSize = max(world * uFocal / depth, 1.0);
    vHeat = aHeat;
    vLayer = aSeed.y;
    vTone = aSeed.z;
    vBlur = blur;
  }
`

export const PARTICLE_FRAGMENT = /* glsl */ `
  ${SPRITE}
  ${LIGHT_OUT}
  uniform vec3 uRed, uBlue, uInk;
  uniform float uIntensity;
  varying float vHeat;
  varying float vLayer;
  varying float vTone;
  varying float vBlur;

  void main() {
    float core = spriteMask(gl_PointCoord);
    // Out of focus the sprite becomes a flat, soft disc instead of a bright dot.
    float disc = smoothstep(1.0, 0.72, length(gl_PointCoord - 0.5) * 2.0);
    float mask = mix(core * core, disc * 0.55, vBlur);
    if (mask < 0.01) discard;

    float hot = smoothstep(0.08, 0.85, vHeat);
    vec3 colour = mix(uInk, uRed, hot);
    colour = mix(colour, uBlue, (1.0 - vLayer) * 0.7 * (1.0 - hot));
    if (vTone > 0.93) colour = mix(colour, uRed, 0.7);

    float alpha = mask * (0.3 + 0.7 * vLayer) * (1.0 - vBlur * 0.5) * (0.75 + hot * 0.9) * uIntensity;
    gl_FragColor = lightOut(colour, alpha);
    #include <colorspace_fragment>
  }
`
