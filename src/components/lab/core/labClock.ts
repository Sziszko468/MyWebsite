/** The Lab's clock: seconds of drawn time, and the last frame's length. Shared by the page's events and the scene. */
export interface LabClock {
  t: number
  dt: number
  frame: number
}

export function createLabClock(): LabClock {
  return { t: 0, dt: 0, frame: 0 }
}
