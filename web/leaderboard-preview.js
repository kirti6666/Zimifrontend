/* Sample hosts and scores are bundled only into the design preview. */
const BOARD_PREVIEW_PROFILES = new Map([
  ['preview-board-naina', {name:'Naina Shah', avatarUrl:PREVIEW_HOSTS[5]}],
  ['preview-board-rhea', {name:'Rhea Kapoor'}],
  ['preview-board-vikram', {name:'Vikram Anand'}],
  ['preview-board-alina', {name:'Alina Roy'}],
]);
const BOARD_PREVIEW_SCORES = [
  // Host ID, daily, weekly, monthly
  ['aanya', 1_300_000, 3_800_000, 12_400_000],
  ['meher', 800_000, 4_200_000, 11_100_000],
  ['ishaan', 645_000, 2_700_000, 8_600_000],
  ['noor', 510_000, 1_900_000, 6_400_000],
  ['kabir', 438_000, 1_400_000, 7_200_000],
  ['tara', 375_000, 1_650_000, 5_100_000],
  ['preview-board-naina', 310_000, 1_200_000, 4_600_000],
  ['rehan', 265_000, 970_000, 3_800_000],
  ['preview-board-rhea', 210_000, 910_000, 3_250_000],
  ['dev', 162_000, 720_000, 2_600_000],
  ['preview-board-vikram', 140_000, 610_000, 2_100_000],
  ['preview-board-alina', 95_000, 480_000, 1_800_000],
];
const boardPreviewNumber = new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1});
function lbPreviewRows(period){
  const rows=BOARD_PREVIEW_SCORES.flatMap(([id,daily,weekly,monthly])=>{
    const known=g(id);
    const profile=known?{name:known.n,avatarUrl:known.avatarUrl}:BOARD_PREVIEW_PROFILES.get(id);
    return profile?[{id,...profile,coins:{daily,weekly,monthly}[period]}]:[];
  });
  return rows.sort((a,b)=>b.coins-a.coins).map((row,index)=>({...row,rank:index+1}));
}
