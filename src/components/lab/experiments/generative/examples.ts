// The brief's eight sentences live apart from the vocabulary, so the overview page can show them without loading it.
/** The brief's eight examples, written for each language. The page shows them as one-tap suggestions. */
export interface Example {
  hu: string
  en: string
  nl: string
}

export const EXAMPLES: readonly Example[] = [
  {
    hu: 'Egy izmos banán, aki versenyautót vezet.',
    en: 'A muscular banana driving a racing car.',
    nl: 'Een gespierde banaan die een racewagen bestuurt.',
  },
  {
    hu: 'Egy szomorú robot kávéfőző fejjel.',
    en: 'A sad robot with a coffee machine for a head.',
    nl: 'Een droevige robot met een koffiemachine als hoofd.',
  },
  {
    hu: 'Egy tornacipőből készült luxus űrhajó.',
    en: 'A luxury spaceship made from a sneaker.',
    nl: 'Een luxe ruimteschip gemaakt van een sneaker.',
  },
  {
    hu: 'Egy dühös croissant, aki meg akarja hódítani a világot.',
    en: 'An angry croissant trying to conquer the world.',
    nl: 'Een boze croissant die de wereld wil veroveren.',
  },
  {
    hu: 'Egy arany béka drága napszemüvegben.',
    en: 'A golden frog wearing expensive sunglasses.',
    nl: 'Een gouden kikker met een dure zonnebril.',
  },
  {
    hu: 'Egy apró dinoszaurusz, aki cégvezetőként dolgozik.',
    en: 'A tiny dinosaur working as a corporate manager.',
    nl: 'Een piepkleine dinosaurus die als manager werkt.',
  },
  {
    hu: 'Egy hűtőszekrény, amiből futurisztikus sportautó lett.',
    en: 'A refrigerator transformed into a futuristic sports car.',
    nl: 'Een koelkast omgebouwd tot een futuristische sportwagen.',
  },
  {
    hu: 'Egy táncoló kaktusz bokszkesztyűben.',
    en: 'A dancing cactus wearing boxing gloves.',
    nl: 'Een dansende cactus met bokshandschoenen.',
  },
]
