/* Sample hosts and scores are bundled only into the design preview. */
const BOARD_PREVIEW_PROFILES = new Map([
  ['preview-board-naina', {name:'Naina Shah', avatarUrl:PREVIEW_HOSTS[5]}],
  ['preview-board-rhea', {name:'Rhea Kapoor'}],
  ['preview-board-vikram', {name:'Vikram Anand'}],
  ['preview-board-alina', {name:'Alina Roy'}],
  ['preview-board-pihu-mishra', {name:'Pihu Mishra'}],
  ['preview-board-simran-kaur', {name:'Simran Kaur'}],
  ['preview-board-ishita-verma', {name:'Ishita Verma'}],
  ['preview-board-sana-khan', {name:'Sana Khan'}],
  ['preview-board-aarohi-sharma', {name:'Aarohi Sharma'}],
]);
const BOARD_PREVIEW_BASES = [
  ['aanya', 1_300_000],
  ['meher', 800_000],
  ['ishaan', 645_000],
  ['noor', 510_000],
  ['kabir', 438_000],
  ['tara', 375_000],
  ['preview-board-naina', 310_000],
  ['rehan', 265_000],
  ['preview-board-rhea', 210_000],
  ['dev', 162_000],
  ['preview-board-vikram', 140_000],
  ['preview-board-alina', 95_000],
  ['preview-board-pihu-mishra', 1_450_000],
  ['preview-board-simran-kaur', 800_000],
  ['preview-board-ishita-verma', 525_000],
  ['preview-board-sana-khan', 205_000],
  ['preview-board-aarohi-sharma', 68_000],
];
const BOARD_PREVIEW_DAY = 86_400_000;
function lbPreviewRows(period,now=new Date()){
  const today=Math.floor(now.getTime()/BOARD_PREVIEW_DAY), start=new Date(today*BOARD_PREVIEW_DAY);
  if(period==='weekly')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
  if(period==='monthly')start.setUTCDate(1);
  const firstDay=start.getTime()/BOARD_PREVIEW_DAY;
  const rows=BOARD_PREVIEW_BASES.flatMap(([id,base],index)=>{
    const known=g(id);
    const profile=known?{name:known.n,avatarUrl:known.avatarUrl}:BOARD_PREVIEW_PROFILES.get(id);
    if(!profile)return [];
    // The same date always gives the same sample score, in every period.
    let coins=0;
    for(let day=firstDay;day<=today;day++)coins+=Math.round(base*(88+(day*11+index*13)%25)/100);
    return [{id,...profile,coins}];
  });
  return rows.sort((a,b)=>b.coins-a.coins).map((row,index)=>({...row,rank:index+1}));
}
