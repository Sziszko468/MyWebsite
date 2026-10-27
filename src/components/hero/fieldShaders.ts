import { CURSOR, FIELD } from './velocityHeroConfig'

// GLSL for the generative field. Four systems (streaks, trails, surfaces, dust) share one set of
// forces, so the same cursor, the same click waves and the same ambient swirl bend all of them.
//
// Everything runs on the GPU: the CPU only updates a few uniforms per frame.
//
// Glows are written as premultiplied colour with
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

/**
 * The shared forces. `fieldOffset` takes a point in view space and returns how far the visitor's
 * input and the ambient swirl push it, in view space. Distances are measured on screen, so the
 * cursor's reach is the same on the near and the far part of the field.
 *
 *   ambient   a slow swirl, so the field is alive when nobody touches it
 *   cursor    the flow parts around the pointer and is dragged along the pointer's motion;
 *             strength follows `uEnergy`, which drains away when the pointer rests
 *   waves     each click sends a ring outward that pushes the field and fades
 *
 * It also leaves `gGlow` set: how strongly this point is lit by that input, for brightening.
 */
const FORCE = /* glsl */ `
  uniform float uTime, uPhase, uEnergy, uPresence, uWarp, uAspect, uRadius;
  uniform vec2 uCursor, uCursorVel;
  uniform vec4 uRipples[${CURSOR.maxRipples}];
  float gGlow;
  float gNear;

  vec2 ndcOf(vec3 v) {
    vec4 c = projectionMatrix * vec4(v, 1.0);
    return c.xy / c.w;
  }

  vec3 fieldOffset(vec3 v, float seed, float reach) {
    vec2 k = vec2(projectionMatrix[0][0], projectionMatrix[1][1]);
    vec2 ndc = ndcOf(v);
    vec2 asp = vec2(uAspect, 1.0);
    float t = uPhase * 0.2;

    vec2 dn = vec2(sin(ndc.y * 2.6 + t + seed * 6.283), cos(ndc.x * 2.2 - t * 1.3 + seed * 4.1)) * 0.012 * uWarp;

    vec2 toCursor = (ndc - uCursor) * asp;
    float d = length(toCursor);
    float near = exp(-(d * d) / (uRadius * uRadius));
    vec2 away = toCursor / (d + 0.03) / asp;
    dn += (away * (0.2 * uEnergy) + uCursorVel * 0.05) * near * reach;

    // A drag leaves a vortex whose sense depends on which side of the path a point is on, so
    // sweeping left-to-right and right-to-left do not give the same picture.
    float curl = away.x * uCursorVel.y - away.y * uCursorVel.x;
    vec2 around = vec2(-away.y, away.x);
    dn += around * curl * 0.04 * near * reach;
    // Slow, careful movement leaves a gentle orbit and a finer, brighter cluster of dust.
    dn += around * 0.02 * near * uPresence * (1.0 - uEnergy) * reach;

    gNear = near;
    float glow = near * uEnergy;

    for (int i = 0; i < ${CURSOR.maxRipples}; i++) {
      vec4 wave = uRipples[i];
      float age = uTime - wave.z;
      if (age > 0.0 && age < ${FIELD.rippleSeconds.toFixed(2)}) {
        vec2 toWave = (ndc - wave.xy) * asp;
        float r = length(toWave);
        float life = 1.0 - age / ${FIELD.rippleSeconds.toFixed(2)};
        float q = (r - age * 1.25) / (0.14 + age * 0.12);
        float ring = exp(-q * q) * life * life * wave.w;
        dn += toWave / (r + 0.03) / asp * ring * 0.16 * reach;
        glow += ring;
      }
    }

    gGlow = glow;
    return vec3(dn / k * (-v.z), 0.0);
  }
`

/**
 * Line segments drawn as screen-space ribbons. A raw GL line is one device pixel wide and not
 * anti-aliased, so thin, dense, moving lines crawl and twinkle (and break up on some drivers); a
 * ribbon of about a pixel and a half with a smooth edge moves smoothly. The arguments are the
 * segment's two ends in view space; the result is the clip-space position of one corner.
 */
const RIBBON = /* glsl */ `
  uniform vec2 uPixel;

  vec4 ribbonCorner(vec3 here, vec3 other, float side, float widthPx) {
    vec4 ch = projectionMatrix * vec4(here, 1.0);
    vec4 co = projectionMatrix * vec4(other, 1.0);
    vec2 asp = vec2(uAspect, 1.0);
    vec2 dir = (ch.xy / ch.w - co.xy / co.w) * asp;
    float dl = length(dir);
    dir = dl > 1e-6 ? dir / dl : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x) / asp;
    vec2 ndc = ch.xy / ch.w + perp * side * widthPx * uPixel.y;
    return vec4(ndc * ch.w, ch.z, ch.w);
  }
`

/** Streaks: instanced quads stretched between a head and a tail point, drawn at constant pixel width. */
export const STREAK_VERT = /* glsl */ `
  ${FORCE}
  attribute vec4 aSeed;
  attribute vec2 aCorner;
  uniform float uTravel, uDepth, uStreak, uGlow, uBright, uSpread;
  // The layer's character: hairlines are thinner, shorter and fainter than the main streaks, and
  // fly apart faster when the intro leaves. A streak thinner than uMinWidth pixels is drawn that
  // wide and dimmed in proportion, so its light stays the same but it no longer twinkles.
  uniform float uWidthScale, uLenScale, uAlphaScale, uLayerSpread, uMinWidth;
  uniform vec2 uPixel;
  uniform vec3 uRed, uBlue, uInk;
  varying vec3 vCol;
  varying float vAcross, vAlong, vAlpha;

  void main() {
    float rnd = aSeed.w;
    float speed = 0.6 + rnd * 0.8;
    float z = -uDepth + mod(aSeed.z + uTravel * speed, uDepth);
    vec2 xy = vec2(cos(aSeed.x) * 1.6, sin(aSeed.x)) * aSeed.y * pow(uSpread, uLayerSpread);
    float len = mix(0.9, 3.4, fract(rnd * 7.3)) * (0.4 + 2.4 * uStreak) * uLenScale;

    vec3 head = (modelViewMatrix * vec4(xy, z, 1.0)).xyz;
    vec3 tail = (modelViewMatrix * vec4(xy, z - len, 1.0)).xyz;
    head += fieldOffset(head, rnd, 1.0);
    float glow = gGlow;
    tail += fieldOffset(tail, rnd, 0.5);
    head.z = min(head.z, -0.35);
    tail.z = min(tail.z, -0.35);

    vec4 ch = projectionMatrix * vec4(head, 1.0);
    vec4 ct = projectionMatrix * vec4(tail, 1.0);
    vec2 asp = vec2(uAspect, 1.0);
    vec2 dir = (ch.xy / ch.w - ct.xy / ct.w) * asp;
    float dl = length(dir);
    dir = dl > 1e-5 ? dir / dl : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x) / asp;

    float dist = -head.z;
    float width = (0.8 + 1.4 * (1.0 - smoothstep(5.0, 90.0, dist))) * (0.7 + 0.6 * fract(rnd * 3.1)) * uWidthScale;
    float thin = width < uMinWidth ? width / max(uMinWidth, 1e-4) : 1.0;
    width = max(width, uMinWidth);
    vec4 c = mix(ct, ch, aCorner.y);
    vec2 ndc = c.xy / c.w + perp * aCorner.x * width * uPixel.y;
    gl_Position = vec4(ndc * c.w, c.z, c.w);

    vCol = rnd < 0.56 ? uRed : (rnd < 0.86 ? uInk * 0.7 : uBlue);
    vAcross = aCorner.x;
    vAlong = aCorner.y;
    float fade = (1.0 - smoothstep(uDepth * 0.5, uDepth, dist)) * smoothstep(2.0, 16.0, dist);
    vAlpha = fade * (0.3 + 0.7 * fract(rnd * 5.7)) * uGlow * uBright * (1.0 + 0.9 * glow) * uAlphaScale * thin;
  }
`
export const STREAK_FRAG = /* glsl */ `
  uniform float uAdd, uTipGain;
  varying vec3 vCol;
  varying float vAcross, vAlong, vAlpha;

  void main() {
    float profile = 1.0 - smoothstep(0.0, 1.0, abs(vAcross));
    // pow() of a negative number is undefined (NaN on most GPUs), and a varying that should be 0 can
    // arrive a hair below it. One NaN pixel in a half-float target is blurred over the whole frame
    // by the bloom and the frame goes black, so every base here is clamped to be non-negative.
    float tail = pow(max(vAlong, 0.0), 1.6);
    // A brighter tip at the head of every streak (the detailed intro only), so each one reads as
    // a moving point of light.
    float tip = smoothstep(0.9, 1.0, vAlong) * uTipGain;
    float a = min(profile * tail * vAlpha * (1.0 + 1.4 * tip), mix(0.96, 4.0, uAdd));
    gl_FragColor = vec4(vCol * a * (1.0 + 0.8 * tail + 0.9 * tip), a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/** Trails: long curved ribbons, expanded on screen, with light pulses that run along them. */
export const TRAIL_VERT = /* glsl */ `
  ${FORCE}
  attribute vec3 aPrev;
  attribute vec3 aNext;
  attribute float aSide;
  attribute float aS;
  attribute float aSeed;
  attribute vec4 aInfo; // rate, pitch, width in px, colour (0 red, 1 ink, 2 blue)
  uniform float uDepth, uGlow, uBright, uWidthScale, uSpread, uMinWidth;
  uniform vec2 uPixel;
  uniform vec3 uRed, uBlue, uInk;
  varying vec3 vCol;
  varying float vAcross, vS, vAlpha, vRate, vPitch;

  void main() {
    vec3 spread = vec3(uSpread, uSpread, 1.0);
    vec3 here = (modelViewMatrix * vec4(position * spread, 1.0)).xyz;
    vec3 before = (modelViewMatrix * vec4(aPrev * spread, 1.0)).xyz;
    vec3 after = (modelViewMatrix * vec4(aNext * spread, 1.0)).xyz;
    here += fieldOffset(here, aSeed, 1.1);
    float glow = gGlow;
    before += fieldOffset(before, aSeed, 1.1);
    after += fieldOffset(after, aSeed, 1.1);
    here.z = min(here.z, -0.35);
    before.z = min(before.z, -0.35);
    after.z = min(after.z, -0.35);

    vec4 ch = projectionMatrix * vec4(here, 1.0);
    vec4 cb = projectionMatrix * vec4(before, 1.0);
    vec4 ca = projectionMatrix * vec4(after, 1.0);
    vec2 asp = vec2(uAspect, 1.0);
    vec2 dir = (ca.xy / ca.w - cb.xy / cb.w) * asp;
    float dl = length(dir);
    dir = dl > 1e-6 ? dir / dl : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x) / asp;

    float dist = -here.z;
    float width = aInfo.z * uWidthScale * (0.7 + 0.9 * (1.0 - smoothstep(6.0, 110.0, dist)));
    // As for streaks: never thinner than uMinWidth pixels, dimmed in proportion instead.
    float thin = width < uMinWidth ? width / max(uMinWidth, 1e-4) : 1.0;
    width = max(width, uMinWidth);
    vec2 ndc = ch.xy / ch.w + perp * aSide * width * uPixel.y;
    gl_Position = vec4(ndc * ch.w, ch.z, ch.w);

    vCol = aInfo.w < 0.5 ? uRed : (aInfo.w < 1.5 ? uInk * 0.7 : uBlue);
    vAcross = aSide;
    vS = aS;
    vRate = aInfo.x;
    vPitch = aInfo.y;
    float fade = (1.0 - smoothstep(uDepth * 0.55, uDepth, dist)) * smoothstep(0.8, 10.0, dist);
    vAlpha = fade * uGlow * uBright * (1.0 + 0.8 * glow) * thin;
  }
`
export const TRAIL_FRAG = /* glsl */ `
  uniform float uTravel, uStreak, uAdd, uIntensity, uSoft, uDepth;
  varying vec3 vCol;
  varying float vAcross, vS, vAlpha, vRate, vPitch;

  void main() {
    float profile = pow(max(1.0 - abs(vAcross), 0.0), uSoft);
    // Pulses run towards the camera; the head is sharp and the tail fades away behind it.
    float f = fract((vS * uDepth + uTravel * vRate) / vPitch);
    // The head fades in over a short distance instead of ending in a hard edge.
    float pulse = pow(1.0 - f, mix(14.0, 4.0, uStreak)) * smoothstep(0.0, 0.05, f);
    float a = min((0.2 + 0.8 * pulse) * profile * vAlpha * uIntensity, mix(0.96, 4.0, uAdd));
    gl_FragColor = vec4(vCol * a * (1.0 + 1.2 * pulse), a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/**
 * Surfaces: wireframe grids on the floor and ceiling, rolling in waves and raised by input. Every
 * line segment is a ribbon (see RIBBON): its two ends are placed by the same function, so they
 * move together.
 */
export const GRID_VERT = /* glsl */ `
  ${FORCE}
  ${RIBBON}
  attribute vec3 aOther; // the segment's other end
  attribute float aSide; // which side of the segment this corner is on: -1 or 1
  attribute float aAxis; // 0: runs along the flow, 1: runs across it
  attribute float aMajor; // 1 for a strong line, 0 for a fine one
  uniform float uTravel, uDepth, uFace, uHeight, uGlow, uBright, uLineWidth;
  varying float vFade, vGlow, vMajor, vAcross;

  // One end of a segment, in view space, with how strongly the input lights it.
  vec3 gridPoint(vec3 p, out float glow) {
    float z = aAxis > 0.5 ? -uDepth + mod(p.z + uTravel, uDepth) : p.z;
    float phase = z - uTravel;
    float wave = sin(p.x * 0.28 + phase * 0.09 + uPhase * 0.35) * 0.45 + sin(p.x * 0.11 - phase * 0.05) * 0.8;
    float y = uFace * (uHeight + wave * (0.6 + 0.4 * uWarp));

    vec3 v = (modelViewMatrix * vec4(p.x, y, z, 1.0)).xyz;
    vec3 push = fieldOffset(v, 0.5, 0.35);
    glow = gGlow;
    // Input raises the surface towards the centre, as a relief that follows the cursor and rides the waves.
    v += push;
    v.y -= uFace * glow * 1.8;
    v.z = min(v.z, -0.35);
    return v;
  }

  void main() {
    float glow;
    float glowOther;
    vec3 here = gridPoint(position, glow);
    vec3 other = gridPoint(aOther, glowOther);

    float dist = -here.z;
    vFade = (1.0 - smoothstep(uDepth * 0.4, uDepth, dist)) * smoothstep(1.0, 10.0, dist) * uGlow * uBright;
    vGlow = glow;
    vMajor = aMajor;
    vAcross = aSide;
    gl_Position = ribbonCorner(here, other, aSide, uLineWidth);
  }
`
export const GRID_FRAG = /* glsl */ `
  uniform vec3 uGrid, uRed;
  uniform float uAdd;
  varying float vFade, vGlow, vMajor, vAcross;

  void main() {
    float lit = clamp(vGlow * 1.3, 0.0, 1.0);
    vec3 col = mix(uGrid, uRed, lit);
    // Fine lines are fainter than major ones, and light up less under the pointer.
    float weight = mix(0.5, 1.0, vMajor);
    float edge = 1.0 - smoothstep(0.0, 1.0, abs(vAcross));
    float a = min((0.16 + 0.7 * lit * weight) * vFade * weight * edge, mix(0.96, 4.0, uAdd));
    gl_FragColor = vec4(col * a, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/**
 * Rings: concentric loops across the flow, in four families, that rush towards the viewer like
 * the gates of a tunnel. They are bent by the same forces as everything else and light up red
 * where the pointer disturbs them; a few are red all the time.
 */
export const RING_VERT = /* glsl */ `
  ${FORCE}
  ${RIBBON}
  attribute vec3 aOther; // the segment's other end
  attribute float aSide; // which side of the segment this corner is on: -1 or 1
  attribute vec2 aRing; // x: family 0..1, y: random per ring
  uniform float uTravel, uDepth, uGlow, uBright, uSpread, uLineWidth;
  varying float vFade, vGlow, vRed, vFamily, vAcross;

  // One end of a segment, in view space, with how strongly the input lights it.
  vec3 ringPoint(vec3 p, out float glow) {
    float z = -uDepth + mod(p.z + uTravel, uDepth);
    vec3 v = (modelViewMatrix * vec4(p.xy * pow(uSpread, 1.3), z, 1.0)).xyz;
    v += fieldOffset(v, aRing.y, 0.7);
    glow = gGlow;
    v.z = min(v.z, -0.35);
    return v;
  }

  void main() {
    float glow;
    float glowOther;
    vec3 here = ringPoint(position, glow);
    vec3 other = ringPoint(aOther, glowOther);

    float dist = -here.z;
    vFade = (1.0 - smoothstep(uDepth * 0.45, uDepth, dist)) * smoothstep(1.0, 12.0, dist) * uGlow * uBright;
    vGlow = glow;
    vRed = step(0.84, aRing.y);
    vFamily = aRing.x;
    vAcross = aSide;
    gl_Position = ribbonCorner(here, other, aSide, uLineWidth);
  }
`
export const RING_FRAG = /* glsl */ `
  uniform vec3 uGrid, uRed, uInk;
  uniform float uAdd;
  varying float vFade, vGlow, vRed, vFamily, vAcross;

  void main() {
    float lit = clamp(max(vGlow * 1.4, vRed), 0.0, 1.0);
    vec3 col = mix(mix(uGrid, uInk * 0.7, 0.25 * vFamily), uRed, lit);
    float edge = 1.0 - smoothstep(0.0, 1.0, abs(vAcross));
    float a = min((0.11 + 0.55 * lit) * vFade * edge, mix(0.96, 4.0, uAdd));
    gl_FragColor = vec4(col * a, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/** Dust: soft points that part around the cursor and scatter on every click wave. */
export const DUST_VERT = /* glsl */ `
  ${FORCE}
  attribute float aSeed;
  uniform float uTravel, uDepth, uSize, uPixelRatio, uGlow, uBright, uSpread;
  // 1 for the detailed intro: many tiny specks and few large motes, instead of an even spread of sizes.
  uniform float uFineDust;
  uniform vec3 uRed, uBlue, uInk;
  varying vec3 vCol;
  varying float vAlpha;

  void main() {
    float speed = 0.25 + aSeed * 0.5;
    float z = -uDepth + mod(position.z + uTravel * speed, uDepth);
    vec3 v = (modelViewMatrix * vec4(position.xy * uSpread, z, 1.0)).xyz;
    v += fieldOffset(v, aSeed, 2.4);
    float glow = gGlow;
    v.z = min(v.z, -0.4);

    float dist = -v.z;
    float fine = gNear * uPresence * (1.0 - uEnergy);
    float sizeK = mix(1.0 + 2.0 * aSeed, 0.5 + 2.8 * aSeed * aSeed * aSeed, uFineDust);
    // A speck smaller than the minimum is drawn at the minimum and dimmed in proportion: a one
    // pixel point crossing the pixel grid flickers, a slightly larger, softer one does not.
    float minSize = mix(1.5, 1.8, uFineDust);
    float rawSize = uSize * uPixelRatio * sizeK * (1.0 + 1.4 * fine) * (26.0 / dist);
    gl_PointSize = clamp(rawSize, minSize, 16.0 * uPixelRatio);
    float thin = mix(1.0, clamp(rawSize / minSize, 0.35, 1.0), uFineDust);
    float tone = mix(aSeed, fract(aSeed * 91.7), uFineDust);
    vCol = tone < 0.5 ? uRed : (tone < 0.8 ? uInk * 0.7 : uBlue);
    float fade = (1.0 - smoothstep(uDepth * 0.5, uDepth, dist)) * smoothstep(2.0, 14.0, dist);
    vAlpha = fade * (0.3 + 0.7 * aSeed) * uGlow * uBright * (1.0 + 1.2 * glow + 2.0 * fine) * thin;
    gl_Position = projectionMatrix * vec4(v, 1.0);
  }
`
export const DUST_FRAG = /* glsl */ `
  uniform float uAdd;
  varying vec3 vCol;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float soft = 1.0 - smoothstep(0.0, 1.0, d);
    float a = min(soft * soft * vAlpha, mix(0.96, 4.0, uAdd));
    gl_FragColor = vec4(vCol * a, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/**
 * The pointer's light beam: one screen-space quad that starts at the (eased) pointer and trails
 * back along its path. Length, width and brightness follow the pointer's speed, the direction
 * follows its heading, and the colour leans red for movement to the right and blue to the left.
 */
export const BEAM_VERT = /* glsl */ `
  attribute vec2 aCorner; // x: side, y: 0 at the pointer, 1 at the tail
  uniform vec2 uCursor, uCursorVel, uPixel;
  uniform float uEnergy, uAspect, uGlow, uBright, uWidth, uBoost;
  uniform vec3 uRed, uBlue, uInk;
  varying vec3 vCol;
  varying float vAlong, vAcross, vAlpha;

  void main() {
    vec2 asp = vec2(uAspect, 1.0);
    vec2 v = uCursorVel * asp;
    float speed = length(v);
    vec2 dir = speed > 1e-3 ? v / speed : vec2(1.0, 0.0);
    float len = 0.04 + 0.62 * uEnergy;
    vec2 base = uCursor * asp - dir * len * aCorner.y;
    vec2 perp = vec2(-dir.y, dir.x);
    float width = (1.6 + 5.0 * uEnergy) * (1.0 - 0.9 * aCorner.y) * uWidth * uPixel.y;
    gl_Position = vec4((base + perp * aCorner.x * width) / asp, 0.0, 1.0);

    float lean = smoothstep(-0.6, 0.6, -dir.x) * 0.55;
    vCol = mix(mix(uRed, uInk, 0.55), uBlue, lean);
    vAlong = aCorner.y;
    vAcross = aCorner.x;
    vAlpha = smoothstep(0.03, 0.3, uEnergy) * uGlow * uBoost * uBright;
  }
`
export const BEAM_FRAG = /* glsl */ `
  uniform float uAdd;
  varying vec3 vCol;
  varying float vAlong, vAcross, vAlpha;

  void main() {
    float profile = 1.0 - smoothstep(0.0, 1.0, abs(vAcross));
    float a = min(profile * pow(max(1.0 - vAlong, 0.0), 1.5) * vAlpha, mix(0.96, 4.0, uAdd));
    gl_FragColor = vec4(vCol * a * 1.3, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`

/**
 * The overlay: one full-screen quad, drawn last, that adds the fine line work no particle system
 * can: the pointer's reticle, the shock rings that travel out of every click, and the starburst
 * of the intro's exit. Everything is a function of the same uniforms the field uses, so it costs
 * nothing at rest, and it is hidden (not drawn) whenever none of the three is active.
 */
export const HUD_VERT = /* glsl */ `
  varying vec2 vNdc;

  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`
export const HUD_FRAG = /* glsl */ `
  uniform float uTime, uEnergy, uPresence, uAspect, uExit, uGlow, uBright, uAdd;
  uniform vec2 uCursor, uCursorVel, uPixel, uOrigin;
  uniform vec4 uRipples[${CURSOR.maxRipples}];
  uniform vec3 uRed, uBlue, uInk;
  varying vec2 vNdc;

  const float TAU = 6.2831853;

  // 1 on the line, falling to 0 within w: a line is about 2w across.
  float stroke(float d, float w) {
    return 1.0 - smoothstep(0.0, w, abs(d));
  }

  // The turn of a vector in 0..1, defined (as 0.5) for the zero vector, where atan(0.0, 0.0) is not.
  float turnOf(vec2 v) {
    return abs(v.x) + abs(v.y) < 1e-7 ? 0.5 : atan(v.y, v.x) / TAU + 0.5;
  }

  void main() {
    vec2 asp = vec2(uAspect, 1.0);
    float px = uPixel.y;
    float w = px * 1.1;
    vec3 acc = vec3(0.0);
    float alpha = 0.0;

    // The pointer's reticle: dashed rings, ticks and a gapped cross around the eased pointer. It
    // swells with speed, is brightest on the side the pointer is travelling towards, and fades
    // away with the pointer's presence.
    vec2 p = (vNdc - uCursor) * asp;
    float r = length(p);
    if (uPresence > 0.04 && r < 0.5) {
      float turn = turnOf(p);
      vec2 heading = uCursorVel * asp;
      float speed = length(heading);
      vec2 dir = speed > 1e-3 ? heading / speed : vec2(1.0, 0.0);
      float facing = speed > 1e-3 && r > 1e-4 ? pow(max(dot(p / r, dir), 0.0), 6.0) : 0.0;
      float radius = 0.055 + 0.08 * uEnergy;
      float shown = smoothstep(0.04, 0.5, uPresence) * (0.35 + 0.65 * smoothstep(0.0, 0.4, uEnergy + 0.25));

      float ringA = stroke(r - radius, w) * step(fract(turn * 24.0), 0.62);
      float ringB = stroke(r - radius * 1.75, w * 0.8) * 0.5;
      float ringC = stroke(r - radius * 2.7, w * 0.8) * step(fract(turn * 48.0), 0.3) * 0.8;
      float ticks = smoothstep(0.42, 0.5, abs(fract(turn * 36.0) - 0.5)) * step(radius * 1.12, r) * step(r, radius * 1.3);
      float hair = max(
        stroke(p.y, w) * step(abs(p.x), radius * 0.6) * step(radius * 0.2, abs(p.x)),
        stroke(p.x, w) * step(abs(p.y), radius * 0.6) * step(radius * 0.2, abs(p.y))
      );
      float centre = 1.0 - smoothstep(0.0, px * 2.2, r);
      float a = (ringA * (0.7 + 1.1 * facing) + ringB + ringC + ticks * 0.6 + hair * 0.6 + centre) * shown * 1.15;
      acc += mix(uInk * 0.8, uRed, 0.55 + 0.4 * facing) * a;
      alpha += a;
    }

    // Shock rings: each click sends a bright ring and three fainter echoes outwards, broken into
    // dashes, with short spokes riding the front. The ring travels with the push that the field
    // itself feels (see fieldOffset), so the picture and the physics agree.
    for (int i = 0; i < ${CURSOR.maxRipples}; i++) {
      vec4 wave = uRipples[i];
      float age = uTime - wave.z;
      if (age > 0.0 && age < ${FIELD.rippleSeconds.toFixed(2)}) {
        vec2 q = (vNdc - wave.xy) * asp;
        float rr = length(q);
        float front = age * 1.25;
        // Only the thin band the rings and spokes occupy does any work.
        if (rr > front - 0.2 * (1.0 + age) && rr < front + 0.1) {
          float turn = turnOf(q);
          float life = 1.0 - age / ${FIELD.rippleSeconds.toFixed(2)};
          float rings = 0.0;
          for (int e = 0; e < 4; e++) {
            float fe = float(e);
            rings += stroke(rr - (front - fe * 0.05 * (1.0 + age)), w * (1.0 + fe * 0.35)) * (1.0 - fe * 0.24);
          }
          float broken = 0.5 + 0.5 * step(fract(turn * 64.0 + wave.z * 5.0), 0.72);
          float spokes = smoothstep(0.42, 0.5, abs(fract(turn * 96.0) - 0.5)) * stroke(rr - front - 0.025, 0.03);
          float a = (rings * broken + spokes * 0.9) * life * life * min(wave.w, 2.5) * 0.7;
          acc += mix(uInk * 0.8, uRed, 0.5 + 0.5 * sin(turn * TAU * 2.0 + wave.z)) * a;
          alpha += a;
        }
      }
    }

    // The exit: fine spokes radiate from the click point in three densities, with a bright band at
    // their front and rings in its wake. The envelope is zero at both ends, so nothing flashes.
    if (uExit > 0.001) {
      vec2 q = (vNdc - uOrigin) * asp;
      float rr = length(q);
      float an = turnOf(q) * TAU - 3.14159265;
      float env = sin(3.14159265 * clamp(uExit, 0.0, 1.0));
      float front = uExit * 2.6;
      float spokes = pow(abs(sin(an * 18.0 + 0.7)), 36.0) * 0.9 + pow(abs(sin(an * 47.0 + 2.1)), 70.0) * 0.7 + pow(abs(sin(an * 131.0)), 120.0) * 0.5;
      float bandX = (rr - front * 0.85) / 0.55;
      float band = exp(-bandX * bandX);
      float behind = (1.0 - smoothstep(front - 1.4, front, rr)) * smoothstep(0.02, 0.35, rr);
      float rings = 0.0;
      for (int k = 0; k < 3; k++) {
        rings += stroke(rr - front * (1.0 - float(k) * 0.16), w * 1.4) * (1.0 - float(k) * 0.3);
      }
      float a = (spokes * (band + 0.22 * behind) * 0.55 + rings * 0.5) * env;
      vec3 c = mix(uRed, uBlue, 0.5 + 0.5 * sin(an * 3.0 + 1.0));
      acc += mix(c, uInk * 0.8, 0.35) * a;
      alpha += a;
    }

    float level = uGlow * uBright;
    vec3 colour = acc / max(alpha, 1e-4);
    float a = min(alpha * level, mix(0.9, 3.0, uAdd));
    gl_FragColor = vec4(colour * a, a * (1.0 - uAdd));
    ${OUTPUT}
  }
`
