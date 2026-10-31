import { SIMPLEX_NOISE, STUDIO, SURFACE_DEFORM } from '../../shaders/chunks'

/**
 * Liquid Matter's shaders. The vertex stage displaces a sphere by a field of noise, the pointer's
 * dent and each click's wave (see SURFACE_DEFORM), and in the glass state also snaps the sphere
 * towards a coarse lattice so it becomes a crystal. The fragment stage is one shading model whose
 * parameters (liquidMaterials.ts) turn it into chrome, clay, glass or lava: a procedural studio
 * is reflected, refracted (split into three colours for the glass) or lit through, and the molten
 * state glows along the deformation.
 */

export const LIQUID_VERTEX = /* glsl */ `
  ${SIMPLEX_NOISE}
  ${SURFACE_DEFORM}
  uniform float uQuant;

  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying float vField;
  varying float vHeat;

  void main() {
    vec3 p = normalize(position);
    // The crystal state: the directions snap towards a lattice, which turns the sphere into a polyhedron.
    float lattice = 4.0;
    p = normalize(mix(p, floor(p * lattice + 0.5) / lattice, uQuant));

    float f = surfaceField(p);
    vec3 n = deformedNormal(p);

    vField = f;
    float a = acos(clamp(dot(p, uHit), -1.0, 1.0));
    float heat = uHitAmt * exp(-a * a * 6.0);
    for (int i = 0; i < 4; i++) heat += abs(surfaceRipple(p, uRip[i])) * 1.4;
    vHeat = heat;

    vec4 world = modelMatrix * vec4(p * (1.0 + f), 1.0);
    vWorldPos = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const LIQUID_FRAGMENT = /* glsl */ `
  ${STUDIO}
  uniform vec3 uBase, uLightDir;
  uniform float uMetal, uRough, uFres, uGlass, uDisp, uFacet, uMolten, uSheen, uAdd;

  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying float vField;
  varying float vHeat;

  vec3 moltenRamp(float t) {
    vec3 deep = uRed * 0.18;
    vec3 mid = uRed * 1.25;
    vec3 hot = mix(uRed, vec3(1.0, 0.72, 0.3), 0.8) * 1.6;
    vec3 white = vec3(1.0, 0.92, 0.75) * 1.8;
    vec3 c = mix(vec3(0.0), deep, smoothstep(0.0, 0.3, t));
    c = mix(c, mid, smoothstep(0.28, 0.6, t));
    c = mix(c, hot, smoothstep(0.58, 0.85, t));
    return mix(c, white, smoothstep(0.85, 1.05, t));
  }

  void main() {
    vec3 smoothN = normalize(vNormalW);
    vec3 flatN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
    vec3 N = normalize(mix(smoothN, flatN, uFacet));
    // An open surface (a shell's mouth) shows its inside: turn the normal to face the eye.
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 3.0);
    vec3 R = reflect(-V, N);
    vec3 L = normalize(uLightDir);

    // The room in the surface: blurred towards the normal as the material gets rougher.
    vec3 reflection = studio(normalize(mix(R, N, uRough * uRough * 0.9)));
    reflection = mix(reflection, studio(N) * 0.6, uRough * 0.5);

    // Clay-like diffuse with a soft wrap, tinted by the coloured strips of the room.
    float wrap = clamp((dot(N, L) + 0.5) / 1.5, 0.0, 1.0);
    vec3 diffuse = uBase * (0.14 + wrap * 0.95) + uBase * studio(N) * 0.25;
    diffuse += (uRed * 0.5 + uInk * 0.5) * pow(1.0 - ndv, 2.2) * uSheen * 0.55;
    diffuse += uRed * pow(max(dot(N, -L), 0.0), 2.0) * uSheen * 0.22;

    vec3 dielectric = diffuse + reflection * (0.04 + 0.96 * fres) * uFres;
    vec3 metal = reflection * mix(vec3(1.0), uBase, 0.35);
    vec3 col = mix(dielectric, metal, uMetal);

    // Glass: the room seen through the surface, split into red, green and blue.
    if (uGlass > 0.001) {
      float eta = 1.0 / 1.45;
      vec3 seen = vec3(
        studio(refract(-V, N, eta * (1.0 + uDisp))).r,
        studio(refract(-V, N, eta)).g,
        studio(refract(-V, N, eta * (1.0 - uDisp))).b
      );
      seen *= mix(vec3(1.0), uBase, 0.55);
      vec3 glass = mix(seen * 0.9, reflection, 0.1 + 0.9 * fres);
      // Facet edges light up faintly, like the wires of a digital model.
      float edge = clamp(length(fwidth(flatN)) * 6.0, 0.0, 1.0);
      glass += uBlue * edge * 0.55 + uInk * edge * edge * 0.25;
      col = mix(col, glass, uGlass);
    }

    // Molten: a crust over a glowing core; the hotter the deformation, the brighter it burns.
    if (uMolten > 0.001) {
      float t = clamp(0.36 + vField * 1.7 + vHeat * 0.3, 0.0, 1.05);
      float crust = smoothstep(0.22, 0.62, t);
      vec3 burning = moltenRamp(t);
      vec3 rock = col * 0.55;
      col = mix(col, mix(rock, burning, crust), uMolten);
    }

    // Light the pointer carries across the surface, faint but present.
    col += uBlue * pow(max(dot(N, L), 0.0), 24.0) * 0.1 * (1.0 - uGlass);

    // The studio is brighter than the screen can show: compress it so highlights stay shaped instead of white.
    col = vec3(1.0) - exp(-col * 1.35);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`
