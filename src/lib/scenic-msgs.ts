/** Rotating "scenic route" loading messages — replaces boring "Loading…" */

const MSGS = [
  "Watering the cloud garden…",
  "Feeding the ninja squirrel…",
  "Polishing the glass panels…",
  "Taking the scenic route…",
  "Gathering acorns…",
  "Deploying agent vibes…",
  "Tuning the mesh gradient…",
  "Asking the squirrel for directions…",
  "Dusting off the server racks…",
  "Counting $DTOUR in the couch cushions…",
  "Whispering to the agents…",
  "Checking the weather in the cloud…",
  "Untangling the neural paths…",
  "Brewing more ambient code…",
  "Petting the infrastructure…",
];

let i = 0;

export function nextScenicMsg(): string {
  const msg = MSGS[i % MSGS.length];
  i++;
  return msg;
}

export function scenicMsgAt(index: number): string {
  return MSGS[index % MSGS.length];
}
