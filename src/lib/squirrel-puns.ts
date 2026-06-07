/** Rotating squirrel puns for empty states */

const PUNS = [
  "Your squirrel is still gathering acorns.",
  "Nothing here yet — the ninja is on patrol.",
  "This area is quieter than a sleeping squirrel.",
  "The squirrel was here. It left no traces.",
  "Even squirrels have to start somewhere.",
  "Acorn stash is empty. Check back later.",
  "The ninja squirrel is off on a secret mission.",
  "This space is currently under squirrel surveillance.",
  "Not even a squirrel could find anything here.",
  "The squirrel recommends building something awesome.",
];

let i = 0;

export function nextSquirrelPun(): string {
  const pun = PUNS[i % PUNS.length];
  i++;
  return pun;
}
