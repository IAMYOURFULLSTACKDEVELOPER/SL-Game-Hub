/** One way to play a game (e.g. UNO Classic vs Express). The first variant in a list is the default. */
export interface GameVariant<Id extends string = string> {
  id: Id;
  name: string;
  /** One line shown under the name in the picker */
  blurb: string;
}

/** The variant with this id, or the game's default when the id is missing or unknown. */
export function pickVariant<Id extends string>(list: readonly GameVariant<Id>[], id: unknown): Id {
  return (list.find((v) => v.id === id) ?? list[0]).id;
}
