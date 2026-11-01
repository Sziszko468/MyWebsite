/**
 * A work that is about to be opened. Digital Artifacts opens a kept work by putting its settings
 * here and sending the visitor to the experience; the experience, which keeps its controls in a
 * mutable object of its own, starts from them if there are any. One slot: whatever is put in is
 * what the next page picks up, and the page clears it once it has.
 *
 * Reading does not empty the slot, because React may build a page's first render twice; the page
 * empties it afterwards, in an effect.
 */
export interface Handoff<T> {
  put(value: T): void
  peek(): T | null
  clear(): void
}

export function createHandoff<T>(): Handoff<T> {
  let slot: T | null = null
  return {
    put(value) {
      slot = value
    },
    peek: () => slot,
    clear() {
      slot = null
    },
  }
}
