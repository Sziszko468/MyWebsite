import { Quaternion, Ray, Sphere, Vector3, type Camera, type Object3D } from 'three'

/**
 * Finds where the pointer is on a sphere, in the sphere's own space: the direction from its centre
 * to the point under the pointer. When the pointer is outside the silhouette it gives the nearest
 * direction, with `reach` falling from 1 (on the sphere) to 0 (far away), so the surface still
 * leans towards a pointer that is close. Allocation-free after construction; call it once per
 * frame per pointer.
 */
export class SphereProbe {
  /** Unit direction in the object's space. */
  readonly direction = new Vector3(0, 0, 1)
  /** The pointer's ray passes through the sphere. */
  hit = false
  /** 1 on the sphere, falling to 0 as the ray passes further from it. */
  reach = 0

  private readonly ray = new Ray()
  private readonly sphere = new Sphere()
  private readonly point = new Vector3()
  private readonly centre = new Vector3()
  private readonly unprojected = new Vector3()
  private readonly inverse = new Quaternion()

  /**
   * @param ndcX stage x, -1..1
   * @param ndcY stage y, -1..1 (up)
   * @param radius the sphere's radius in world units (include the object's scale)
   * @param falloff how far outside the silhouette (in radii) the pointer still has an effect
   */
  update(ndcX: number, ndcY: number, camera: Camera, object: Object3D, radius: number, falloff = 0.9): void {
    camera.updateMatrixWorld()
    this.ray.origin.setFromMatrixPosition(camera.matrixWorld)
    this.unprojected.set(ndcX, ndcY, 0.5).unproject(camera)
    this.ray.direction.copy(this.unprojected).sub(this.ray.origin).normalize()

    object.getWorldPosition(this.centre)
    this.sphere.set(this.centre, radius)

    const found = this.ray.intersectSphere(this.sphere, this.point)
    this.hit = found !== null
    if (found) {
      this.reach = 1
    } else {
      this.ray.closestPointToPoint(this.centre, this.point)
      const miss = this.point.distanceTo(this.centre) / radius - 1
      this.reach = Math.max(0, 1 - miss / falloff)
    }

    this.point.sub(this.centre)
    if (this.point.lengthSq() < 1e-8) this.point.set(0, 0, 1)
    object.getWorldQuaternion(this.inverse).invert()
    this.direction.copy(this.point).normalize().applyQuaternion(this.inverse)
  }
}
