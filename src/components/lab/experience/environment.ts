import {
  BackSide,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three'

/**
 * The light the experiences' materials reflect, built from a small scene instead of a picture
 * file: a few bright panels in a dark room (the studio) or a gradient sky with a sun (the track),
 * turned into a prefiltered environment map by three's PMREM generator. Nothing is downloaded, the
 * colours are the brand's, and it is made once per renderer and released with it.
 *
 * `strength` multiplies the panels' brightness, so a lighting rig can be dimmer or harder.
 */
export type EnvironmentKind = 'studio' | 'sky' | 'tunnel'

export interface Environment {
  texture: Texture
  dispose(): void
}

function panel(width: number, height: number, colour: number, strength: number): Mesh {
  const material = new MeshBasicMaterial({ color: new Color(colour).multiplyScalar(strength), side: DoubleSide })
  return new Mesh(new PlaneGeometry(width, height), material)
}

export function createEnvironment(renderer: WebGLRenderer, kind: EnvironmentKind, strength = 1, dark = true): Environment {
  const scene = new Scene()
  const disposables: Array<{ dispose(): void }> = []

  if (kind === 'sky') {
    const dome = new Mesh(
      new SphereGeometry(50, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        uniforms: {
          uTop: { value: new Color(dark ? 0x10142e : 0x7f9ae0) },
          uHorizon: { value: new Color(dark ? 0xff6a4f : 0xf4e8d4) },
          uGround: { value: new Color(dark ? 0x0b0b0d : 0x8a8478) },
        },
        vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 uTop, uHorizon, uGround; varying vec3 vDir; void main() { float h = vDir.y; vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uGround, pow(-h, 0.4)); gl_FragColor = vec4(c, 1.0); }',
      }),
    )
    scene.add(dome)
    const sun = new Mesh(new SphereGeometry(4, 12, 8), new MeshBasicMaterial({ color: new Color(dark ? 0xff9a6b : 0xfff3d6).multiplyScalar(8 * strength) }))
    sun.position.set(-26, 16, -30)
    scene.add(sun)
    disposables.push(dome.geometry, dome.material as ShaderMaterial, sun.geometry, sun.material as MeshBasicMaterial)
  } else {
    const room = new Mesh(new SphereGeometry(30, 24, 12), new MeshBasicMaterial({ color: dark ? 0x1c1c24 : 0xc9c4b8, side: BackSide }))
    scene.add(room)
    disposables.push(room.geometry, room.material as MeshBasicMaterial)

    const top = panel(22, 16, 0xfff6ea, 7 * strength)
    top.position.set(0, 24, 0)
    top.rotation.x = Math.PI / 2
    const red = panel(5, 18, 0xff161f, 6 * strength)
    red.position.set(-22, 6, 4)
    red.rotation.y = Math.PI / 2
    const blue = panel(5, 18, 0x445cff, 6 * strength)
    blue.position.set(22, 6, -2)
    blue.rotation.y = -Math.PI / 2
    const back = panel(16, 4, 0xffffff, 3 * strength)
    back.position.set(0, 8, -24)
    const floor = panel(40, 40, dark ? 0x3a3a44 : 0xe9e4d8, 1.1 * strength)
    floor.position.set(0, -14, 0)
    floor.rotation.x = Math.PI / 2
    // Soft light on the camera's side, where a shiny object's front reflects.
    const front = panel(26, 7, 0xffffff, 2.6 * strength)
    front.position.set(0, 7, 24)
    const frontLeft = panel(7, 16, 0xdfe6ff, 1.8 * strength)
    frontLeft.position.set(-18, 4, 18)
    frontLeft.rotation.y = Math.PI / 3
    scene.add(top, red, blue, back, floor, front, frontLeft)
    for (const mesh of [top, red, blue, back, floor, front, frontLeft]) disposables.push(mesh.geometry, mesh.material as MeshBasicMaterial)
  }

  const generator = new PMREMGenerator(renderer)
  const target = generator.fromScene(scene, 0.03)
  generator.dispose()
  for (const item of disposables) item.dispose()

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  }
}
