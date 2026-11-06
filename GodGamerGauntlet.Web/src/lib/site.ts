export const SITE_URL = "https://godgamergauntlet.com";

export const SITE_DESCRIPTION =
  "Ludwig's God Gamer Challenge: win 10 online games in a row. Streamers use a later version to deal with stream sniping.";

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
