/**
 * Chromatic Distortion is one full-screen fragment shader. A composition of geometric forms is
 * evaluated three times, once per colour channel, each at a slightly different place: red a little
 * one way, blue the other, green in the middle. Where a form is white the three copies add up and
 * the colour fringes appear at its edges; where it is red or cobalt, only the matching channel
 * moves. The forms are signed distance fields, so every edge is exact at any resolution.
 *
 * The offsets are the whole effect, and each is bounded and smooth:
 *   - a global drift that follows the direction and speed of the pointer;
 *   - a local lens around the pointer, pushing the channels apart radially;
 *   - a surge after a click that rises and falls over about a second.
 * The background is warped by slow sine waves and by rings that travel out of the pointer. Nothing
 * here depends on a random or a per-frame flicker, so the image never strobes.
 */

export const CHROMATIC_VERTEX = /* glsl */ `
  uniform float uAspect;
  varying vec2 vP;

  void main() {
    vP = position.xy * vec2(uAspect, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const CHROMATIC_FRAGMENT = /* glsl */ `
  uniform vec2 uRes, uMouse, uVel;
  uniform float uAspect, uPhase, uSep, uLocal, uLensR, uWave, uBoost, uLayers, uEnergy;
  uniform float uGlitch, uNoise, uAngle, uTime;
  uniform vec3 uBg, uInk, uRed, uBlue;
  varying vec2 vP;

  float aa;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  mat2 rot(float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, -s, s, c);
  }

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  float sdTriangle(vec2 p, float r) {
    const float k = 1.7320508;
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }

  float fillOf(float d) { return 1.0 - smoothstep(-aa, aa, d); }
  float strokeOf(float d, float width) { return 1.0 - smoothstep(width - aa, width + aa, abs(d)); }

  /** The composition: x is ink coverage, y red, z cobalt. */
  vec3 forms(vec2 p) {
    float ink = 0.0;
    float red = 0.0;
    float blue = 0.0;

    // Rings spreading from the left, faint, so the whole field has a rhythm.
    vec2 c1 = vec2(-0.3 * uAspect, 0.1);
    float r = length(p - c1);
    float s = abs(fract(r * 3.1 - uPhase * 0.08) - 0.5) * 2.0;
    float w = max(fwidth(r * 3.1) * 2.0, 0.02);
    float ringLine = smoothstep(0.93 - w, 0.93, s);
    ink += ringLine * 0.3 * (1.0 - smoothstep(0.6, 2.4, r));

    // A large red disc with a ring around it.
    vec2 c2 = vec2(0.24 * uAspect, -0.04);
    float discDistance = length(p - c2);
    red += fillOf(discDistance - 0.4);
    ink += strokeOf(discDistance - 0.56, 0.006);

    if (uLayers >= 2.0) {
      // A turned square, outlined in ink.
      vec2 q = rot(0.38 + uPhase * 0.015) * (p - vec2(-0.14, 0.14));
      ink += strokeOf(sdBox(q, vec2(0.36)), 0.007);
    }

    if (uLayers >= 3.0) {
      // A cobalt triangle with a fine ink edge, and a field of bars behind the disc.
      float t = sdTriangle(rot(-0.22) * (p - vec2(0.02, -0.3)), 0.4);
      blue += fillOf(t) * 0.92;
      ink += strokeOf(t - 0.035, 0.004);
      float bars = step(0.5, fract(p.x * 8.0 + 0.2));
      blue += bars * fillOf(abs(p.y - 0.62) - 0.14) * 0.5;
    }

    return clamp(vec3(ink, red, blue), 0.0, 1.0);
  }

  float channel(float bg, float ink, float red, float blue, vec3 f) {
    float c = mix(bg, red, f.y);
    c = mix(c, blue, f.z);
    return mix(c, ink, f.x);
  }

  void main() {
    aa = 2.4 / uRes.y;
    vec2 p = vP;
    float t = uPhase;

    // Waves in the background: a slow sheet and rings that travel out of the pointer.
    vec2 warp = vec2(
      sin(p.y * 4.0 + t * 0.9 + sin(p.x * 2.3 + t * 0.4) * 1.4),
      cos(p.x * 3.4 - t * 0.7 + sin(p.y * 2.1 - t * 0.3) * 1.2)
    );
    p += warp * 0.016 * uWave;

    // Glitch: now and then a few horizontal slices slip sideways, and the next moment they are back. Three changes a second at most,
    // and only the picture moves: nothing flashes.
    float slip = 0.0;
    if (uGlitch > 0.001) {
      float step3 = floor(uTime * 3.0);
      float band = floor((vP.y * 0.5 + 0.5) * 26.0);
      float on = step(0.92, hash(vec2(band, step3)));
      slip = (hash(vec2(band + 7.0, step3)) - 0.5) * 0.07 * uGlitch * on;
      p.x += slip;
    }

    vec2 toMouse = p - uMouse;
    float distanceToMouse = length(toMouse) + 1e-4;
    vec2 radial = toMouse / distanceToMouse;
    float lens = exp(-distanceToMouse * distanceToMouse / (uLensR * uLensR));
    p += radial * sin(distanceToMouse * 16.0 - t * 2.2) * exp(-distanceToMouse * 1.8) * 0.02 * uWave * (0.35 + uEnergy);
    p -= toMouse * lens * 0.07 * uLocal;

    // Where each channel is read: red one way, blue the other.
    float surge = 1.0 + 1.8 * uBoost;
    vec2 drift = normalize(vec2(cos(uAngle), sin(uAngle)) + uVel * 2.0);
    float global = uSep * (0.005 + 0.016 * uEnergy) * surge;
    float local = uSep * uLocal * lens * (0.012 + 0.028 * uEnergy) * surge;
    vec2 offset = drift * global + radial * local + vec2(slip * 0.6, 0.0);

    vec3 fr = forms(p + offset);
    vec3 fg = forms(p);
    vec3 fb = forms(p - offset);

    vec3 bg = uBg + vec3(0.012, 0.0, 0.03) * smoothstep(1.5, 0.0, length(vP));
    vec3 colour = vec3(
      channel(bg.r, uInk.r, uRed.r, uBlue.r, fr),
      channel(bg.g, uInk.g, uRed.g, uBlue.g, fg),
      channel(bg.b, uInk.b, uRed.b, uBlue.b, fb)
    );

    // Film grain, a new pattern about twelve times a second and never brighter than a whisper.
    colour += (hash(gl_FragCoord.xy + floor(uTime * 12.0) * 17.0) - 0.5) * 0.1 * uNoise;

    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
  }
`
