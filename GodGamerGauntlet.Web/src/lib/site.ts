export const SITE_URL = "https://godgamergauntlet.com";

export const SITE_DESCRIPTION =
  "Draft 3, 5, or 7 full-game speedruns from a closed 19-game roster. Sprint, Marathon, or Endurance — start to finish.";

export const GAUNTLET_MODES = [
  {
    id: "Sprint",
    games: 3,
    label: "Sprint",
    blurb: "Three full-game speedruns, start to finish.",
    chip: "bg-sprint/15 text-sprint",
  },
  {
    id: "Marathon",
    games: 5,
    label: "Marathon",
    blurb: "Five full-game speedruns. The standard night.",
    chip: "bg-marathon/15 text-marathon",
  },
  {
    id: "Endurance",
    games: 7,
    label: "Endurance",
    blurb: "Seven full-game speedruns. Bring a long VOD.",
    chip: "bg-endurance/15 text-endurance",
  },
] as const;
