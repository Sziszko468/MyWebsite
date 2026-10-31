/**
 * GLSL shared by the Lab's shaders, kept as strings so each experiment composes only what it uses.
 *
 * Colour output: every fragment shader ends with OUTPUT so the same colours come out in the page's
 * colour space (the brand hex values are sRGB) whatever the renderer's settings.
 */

export const OUTPUT = /* glsl */ `
  #include <colorspace_fragment>
`

/** 3D simplex noise (Ian McEwan and Stefan Gustavson, MIT licence). Returns -1..1. */
export const SIMPLEX_NOISE = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`

/** A cheap hash, for a per-instance or per-vertex random in 0..1. */
export const HASH = /* glsl */ `
  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
`

/** How many click pulses a deforming surface keeps in flight. */
export const SURFACE_PULSES = 4

/**
 * A sphere whose surface is a function of its direction: noise, a dent under the pointer and
 * waves that travel from each click. `uPhase` is the noise's own clock, integrated on the CPU so its
 * speed can change without the pattern jumping. `displaced(p)` takes a unit direction and gives the point;
 * `deformedNormal(p)` measures the normal on the deformed surface from the surface itself, so the
 * lighting is right however far the shape is pushed.
 *
 * Pulses are vec4(direction * strength, start time). A pulse is a travelling ring plus a dent that
 * lingers under the click and fades, so the part of the form that was hit behaves differently for
 * a while.
 */
export const SURFACE_DEFORM = /* glsl */ `
  uniform float uTime, uPhase, uAmp, uFreq, uHitAmt, uRipSpeed, uRipDecay, uPulseGain;
  uniform vec3 uHit;
  uniform vec4 uRip[${SURFACE_PULSES}];

  float surfaceRipple(vec3 p, vec4 r) {
    float s = length(r.xyz);
    if (s < 0.001) return 0.0;
    float age = uTime - r.w;
    if (age < 0.0 || age > 7.0) return 0.0;
    float ang = acos(clamp(dot(p, r.xyz / s), -1.0, 1.0));
    float d = ang - age * uRipSpeed;
    float ring = cos(d * 8.0) * exp(-d * d * 9.0);
    float dent = -exp(-ang * ang * 16.0) * exp(-age * 1.1);
    return (ring * 0.8 + dent * 0.7) * s * exp(-age * uRipDecay) * 0.2;
  }

  float surfaceField(vec3 p) {
    float t = uPhase;
    float n = snoise(p * uFreq + vec3(0.0, t, 0.0));
    n += 0.5 * snoise(p * uFreq * 2.03 - vec3(t * 1.3, 0.0, 0.0));
    float d = n * uAmp;

    float a = acos(clamp(dot(p, uHit), -1.0, 1.0));
    d += uHitAmt * (exp(-a * a * 7.0) * 0.16 + 0.03 * sin(a * 15.0 - uTime * 5.0) * exp(-a * a * 4.0));

    for (int i = 0; i < ${SURFACE_PULSES}; i++) d += surfaceRipple(p, uRip[i]) * uPulseGain;
    return d;
  }

  vec3 displaced(vec3 p) {
    return p * (1.0 + surfaceField(p));
  }

  vec3 deformedNormal(vec3 p) {
    vec3 up = abs(p.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 t = normalize(cross(up, p));
    vec3 b = cross(p, t);
    float e = 0.02;
    vec3 p0 = displaced(p);
    vec3 p1 = displaced(normalize(p + t * e));
    vec3 p2 = displaced(normalize(p + b * e));
    return normalize(cross(p1 - p0, p2 - p0));
  }
`

/**
 * Premultiplied light: `lightOut(colour, intensity)` is written so that, drawn with
 * One / OneMinusSrcAlpha blending, `uAdd` = 1 adds the light to the image (dark theme) and
 * `uAdd` = 0 paints it over the image with ordinary alpha (light theme, where an additive glow
 * would only wash out). `uAdd` is eased, so a theme change cross-fades.
 */
export const LIGHT_OUT = /* glsl */ `
  uniform float uAdd;
  vec4 lightOut(vec3 colour, float intensity) {
    return vec4(colour * intensity, intensity * (1.0 - uAdd));
  }
`

/** Soft round sprite profile for points: 1 in the middle, 0 at the rim. */
export const SPRITE = /* glsl */ `
  float spriteMask(vec2 uv) {
    float d = length(uv - 0.5) * 2.0;
    return smoothstep(1.0, 0.0, d);
  }
`

/**
 * A procedural studio, for metals and glass to reflect: a dark room with a big soft top light, a
 * red strip on one side and a cobalt strip on the other, a thin horizon line. `studio(dir)` takes
 * a world direction. The strips slide with `uStudioTurn`, which the pointer drives, so moving the
 * pointer sweeps the light across the surface. `uAmbient` lifts the room (more on the light theme).
 */
export const STUDIO = /* glsl */ `
  uniform vec3 uRed, uBlue, uInk;
  uniform float uStudioTurn, uAmbient, uLightGain;

  vec3 studio(vec3 d) {
    float c = cos(uStudioTurn);
    float s = sin(uStudioTurn);
    d = vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);

    float up = d.y * 0.5 + 0.5;
    vec3 col = mix(vec3(0.010, 0.010, 0.014), vec3(0.055, 0.06, 0.085), up) + uAmbient;

    // The big softbox overhead, with a crisp edge, and a thin white band round the room.
    float top = smoothstep(0.5, 0.56, d.y) * (0.7 + 0.5 * smoothstep(0.56, 1.0, d.y));
    col += vec3(1.0, 0.97, 0.92) * top * 1.5 * uLightGain;
    float band = smoothstep(0.05, 0.0, abs(d.y - 0.2)) * smoothstep(-0.3, 0.5, d.z);
    col += vec3(1.0, 0.98, 0.95) * band * 0.9 * uLightGain;

    // A red strip on the left and a cobalt strip on the right, tall and narrow with crisp edges.
    float tall = smoothstep(-0.65, -0.5, d.y) * (1.0 - smoothstep(0.4, 0.5, d.y));
    float left = (1.0 - smoothstep(0.07, 0.14, abs(d.x + 0.8))) * tall;
    float right = (1.0 - smoothstep(0.07, 0.14, abs(d.x - 0.84))) * tall;
    col += uRed * left * 2.4 * uLightGain;
    col += uBlue * right * 2.2 * uLightGain;

    // A thin, bright line where the floor meets the walls, and a faint floor bounce.
    col += uInk * exp(-abs(d.y + 0.08) * 38.0) * 0.55 * uLightGain;
    col += uRed * 0.06 * smoothstep(0.0, -1.0, d.y);

    // A pin light behind, so edges facing away still catch something.
    col += uInk * pow(max(dot(d, normalize(vec3(-0.3, 0.2, -1.0))), 0.0), 36.0) * 1.2 * uLightGain;
    return col;
  }
`
