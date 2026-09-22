const H=[
 {id:"aanya",n:"Aanya Kapoor",c:"Mumbai",cat:"Dance",tag:"Dancing",age:26,rate:34,fee:60,on:1,live:1,seed:12,v:"2.4K",pk:1,top:0,fol:1,nw:0},
 {id:"ishaan",n:"Ishaan Verma",c:"Bengaluru",cat:"Gaming",tag:"Esports",age:24,rate:22,fee:40,on:1,live:1,seed:47,v:"1.1K",pk:0,top:1,fol:1,nw:0},
 {id:"meher",n:"Meher Singh",c:"Chandigarh",cat:"Music",tag:"Singing",age:29,rate:45,fee:80,on:1,live:0,seed:91,v:"4.7K",pk:1,top:0,fol:1,nw:0},
 {id:"rehan",n:"Rehan Qureshi",c:"Lucknow",cat:"Talk",tag:"Chatting",age:31,rate:18,fee:30,on:1,live:0,seed:23,v:"1.3K",pk:0,top:0,fol:0,nw:1},
 {id:"tara",n:"Tara Iyer",c:"Chennai",cat:"Astrology",tag:"Readings",age:38,rate:60,fee:120,on:1,live:1,seed:68,v:"3.2K",pk:0,top:1,fol:1,nw:0},
 {id:"dev",n:"Dev Malhotra",c:"Delhi",cat:"Fitness",tag:"Training",age:27,rate:28,fee:50,on:1,live:0,seed:34,v:"860",pk:0,top:0,fol:0,nw:1},
 {id:"noor",n:"Noor Sheikh",c:"Hyderabad",cat:"Comedy",tag:"Make Friends",age:25,rate:26,fee:45,on:1,live:1,seed:55,v:"5.1K",pk:1,top:1,fol:1,nw:0},
 {id:"kabir",n:"Kabir Das",c:"Kolkata",cat:"Music",tag:"Chatting",age:33,rate:38,fee:70,on:0,live:0,seed:79,v:"640",pk:0,top:0,fol:0,nw:1}
];
const CH=[["aanya","that request list is getting long","6:02 pm",2],["noor","going live in ten","5:54 pm",1],
 ["tara","send your birth time when you can","5:31 pm",0],["ishaan","you: gg, rough last round","4:12 pm",0],
 ["meher","recording the folk set tonight","2:47 pm",0],["dev","you: form check tomorrow?","Yesterday",0]];
const TH=[["t","hey, you caught the end of the set?","5:48 pm"],["m","only the last two songs","5:49 pm"],
 ["t","wrote it last week, bridge still rough","5:50 pm"],["m","bridge was the best part honestly","5:52 pm"]];
const GIFTS=[
 ["Rose","&#127801;",99],["Kiss","&#128139;",199],["Berry","&#127827;",299],["Bear","&#128059;",399],
 ["Cheers","&#129346;",499],["Party","&#127881;",699],["Tulip","&#127799;",899],["Bunny","&#128048;",999],
 ["Blossom","&#127800;",1299],["Bouquet","&#128144;",1599],["Hibiscus","&#127802;",1999],["Champagne","&#127870;",2499],
 ["Fireworks","&#127878;",2999],["Golden key","&#128273;",3999],["Cash drop","&#128181;",4999],["Pearl shell","&#128026;",5999],
 ["Perfume","&#129530;",7999],["Crown","&#128081;",9999],["Diamond","&#128142;",12999],["Lion","&#129409;",15999],
 ["Sports car","&#128663;",19999],["Yacht","&#128676;",24999],["Private jet","&#9992;&#65039;",29999],["Castle","&#127983;",39999],
 ["Galaxy","&#127756;",49999],["Phoenix","&#128293;",69999],["Crown jewels","&#128142;&#128081;",99999]
];
const PAL=[["#3c3437","#231e20"],["#332d2b","#1e1a19"],["#453a3c","#282124"],
 ["#372f2d","#211c1b"],["#403639","#251f21"],["#2e2a29","#1b1817"]];

const GOALS=[[100000,"100K"],[500000,"500K"],[1000000,"1M"],[5000000,"5M"],[10000000,"10M"]];
const TIERS=[1000,3000,5000,9000,12000,18000];
const FAVN=[5,10,20,50];
const BEAUTY={
 "Beauty":[["Original","&#9711;",0],["Smooth","&#128167;",1],["Tone","&#9680;",1],["Clearness","&#9678;",1],["Face","&#9723;",1],["Slim","&#9724;",1]],
 "Makeup":[["None","&#9711;",0],["Honey pink","&#128139;",1],["Orange soda","&#128139;",1],["Grapefruit","&#128139;",1],["Watermelon","&#128139;",1],["Red velvet","&#128139;",1]],
 "Sticker":[["None","&#9711;",0],["Reindeer","&#129418;",0],["Ski goggles","&#127958;",0],["Bunny ears","&#128048;",0],["Love","&#128150;",0],["Crown","&#128081;",0]],
 "Filters":[["Original","&#9711;",0],["CT","&#127912;",1],["Warm yellow","&#127774;",1],["Journey","&#127756;",1],["Film","&#127909;",1],["Blue","&#127756;",1]],
 "Image quality":[["Original","&#9711;",0],["Temperature","&#127777;",1],["Tints","&#127912;",1],["Luminance","&#9728;",1],["Saturation","&#9681;",1],["Contrast","&#9680;",1]]
};
const TASKS=[["Stream 60 minutes","0 / 60 min","5,000"],["Receive 20 gifts","0 / 20","2,000"],["Reach 500 viewers","0 / 500","1,500"]];
const me={n:"Rohit Sharma",seed:5,live:0,on:1,c:"Mumbai",tag:"Creator",about:"Here for good conversations, live sessions and a little everyday chaos."};
const EXTRA=[
 {id:"osama",n:"OSAMA",c:"Dubai",cat:"Gaming",tag:"Esports",lang:"Arabic, English",age:28,rate:52,fee:95,on:1,live:0,seed:3,v:"9.0K"},
 {id:"evangeline",n:"Evangeline",c:"Manila",cat:"Music",tag:"Singing",lang:"Filipino, English",age:24,rate:41,fee:75,on:1,live:0,seed:17,v:"8.6K"},
 {id:"jelly",n:"JELLY RTR",c:"Pune",cat:"Comedy",tag:"Make Friends",lang:"Hindi, Marathi",age:26,rate:33,fee:60,on:1,live:1,seed:29,v:"2.7K"},
 {id:"rapidlion",n:"Rapid Lion",c:"Nagpur",cat:"Talk",tag:"Chatting",lang:"Hindi",age:30,rate:24,fee:45,on:0,live:0,seed:41,v:"774"},
 {id:"apsara",n:"APSARA",c:"Indore",cat:"Dance",tag:"Dancing",lang:"Hindi",age:23,rate:37,fee:65,on:1,live:0,seed:53,v:"1.1K"},
 {id:"mehak",n:"Mehak Dhillon",c:"Ludhiana",cat:"Dance",tag:"Dancing",lang:"Punjabi, Hindi",age:25,rate:29,fee:52,on:1,live:1,seed:64,v:"424"}];
const SENDERS=["Rohit S.","Arnav M.","Kunal T.","Faisal R.","Devika N.","Yash P.","Imran Q.","Sahil B.",
 "Nikhil A.","Zoya K."];
const CAPS=["late night set","practice run, be kind","new routine, day one","backstage before going live",
 "thank you for last night","testing a new sound","rehearsal cut","this one took a while",
 "same song, slower","one take, no edits","sunday morning","from the last stream"];
const PACKS=[[200,97.99,100],[625,249.99,150],[1125,499.99,125],[2500,989.99,150],[3750,1499.99,150],[5000,1999.99,150]];
const METHODS=["UPI","Card","Net banking"];
const PERIODS=[["daily","Daily",1],["weekly","Weekly",6.4],["all","All time",41]];

/* Deterministic totals so the ordering is stable between renders. */
function boardRows(){
 const mult=PERIODS.find(x=>x[0]===S.per)[2];
 return H.concat(EXTRA)
  .map(h=>({id:h.id,n:h.n,seed:h.seed,live:!!h.live,
   c:Math.round((((h.seed*613)%780+120)*1000)*mult)}))
  .sort((a,b)=>b.c-a.c);
}

const S={v:"home",tab:"explore",ht:"posts",pi:0,likes:{},pack:2,meth:"UPI",mic:1,cam:1,bt:"creators",per:"weekly",rmsgs:[],h:null,bal:52400,sec:0,t:null,msgs:null,tray:0,
 title:"",goal:1000000,fav:21,favn:10,favGot:0,gifted:0,
 sh:0,cmp:0,cache:{},btab:"Beauty",bsel:{Beauty:1,Makeup:0,Sticker:0,Filters:0,"Image quality":0},lvmode:"Live",
 txf:"all",faq:-1,safe:{discover:1,requests:1,activity:0},blocked:[],
 editName:me.n,editCity:me.c,editAbout:me.about,coverData:"",avatarData:"",postData:[],following:{}};
const g=id=>H.find(x=>x.id===id)||EXTRA.find(x=>x.id===id);
const n=v=>v.toLocaleString("en-IN");

function art(s,r){const[a,b]=PAL[s%6];
 return `<svg class="art" viewBox="0 0 300 400" preserveAspectRatio="none" style="border-radius:${r||0}">
 <defs><linearGradient id="s${s}" x1="0" y1="0" x2="0" y2="1">
 <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></linearGradient></defs>
 <rect width="300" height="400" fill="url(#s${s})"/></svg>`}
const HUES=[
 ["#ff4da2","#7d3f5c","#2a0a1c"],["#ffc02e","#a4653f","#2b1a12"],["#ff5cae","#8a1c5a","#2a0a1c"],
 ["#1bc5a4","#3f7d63","#122a1f"],["#a45bf0","#5c3f7d","#1e122a"],["#ff8a5b","#a05c3f","#2a1712"]];

/* Colour-forward artwork for profile covers and post tiles. */
function artC(sd,r){const[a,b,c]=HUES[sd%HUES.length],x=25+(sd%5)*12,y=20+(sd%4)*13,rot=(sd*53)%360;
 return `<svg class="art" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" style="border-radius:${r||0}">
 <defs><linearGradient id="c${sd}" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="${b}"/><stop offset="100%" stop-color="${c}"/></linearGradient>
 <radialGradient id="d${sd}" cx="${x}%" cy="${y}%" r="70%">
  <stop offset="0%" stop-color="${a}" stop-opacity=".95"/><stop offset="55%" stop-color="${a}" stop-opacity=".22"/>
  <stop offset="100%" stop-color="${a}" stop-opacity="0"/></radialGradient>
 <radialGradient id="e${sd}" cx="${100-x}%" cy="${100-y}%" r="55%">
  <stop offset="0%" stop-color="#fff" stop-opacity=".28"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
 <rect width="300" height="400" fill="url(#c${sd})"/>
 <rect width="300" height="400" fill="url(#d${sd})"/>
 <rect width="300" height="400" fill="url(#e${sd})"/>
 <g transform="rotate(${rot} 150 200)" opacity=".3">
  <ellipse cx="150" cy="200" rx="160" ry="62" fill="none" stroke="${a}" stroke-width="1.4"/>
  <ellipse cx="150" cy="200" rx="104" ry="38" fill="none" stroke="#fff" stroke-opacity=".35"/></g></svg>`}

/* Colour-forward avatar, for lists where the faces carry the page. */
function avc(h,s){const i=h.n.split(" ").map(w=>w[0]).slice(0,2).join("");
 return `<span class="av" style="width:${s}px;height:${s}px">${artC(h.seed,"99px")}
 <span class="disp" style="position:relative;color:#fff;font-weight:700;font-size:${Math.round(s*.36)}px;
  text-shadow:0 1px 4px rgba(0,0,0,.5)">${i}</span></span>`}

function av(h,s,ring){const i=h.n.split(" ").map(w=>w[0]).slice(0,2).join("");
 const pres=ring==="none"?"":`<span class="pres ${h.live?"live":h.on?"on":""}"></span>`;
 return `<span class="avw"><span class="av ${h.live?"red":"gold"}" style="width:${s}px;height:${s}px">${art(h.seed,"99px")}
 <span class="disp" style="position:relative;color:rgba(255,255,255,.92);font-weight:600;font-size:${Math.round(s*.36)}px">${i}</span></span>${pres}</span>`}
const P={home:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/>',
 chat:'<path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H10l-4.4 3.3A1 1 0 014 18.5z" stroke-linejoin="round"/>',
 user:'<circle cx="12" cy="8.5" r="3.7"/><path d="M4.5 19.5c1.3-3.8 4-5.7 7.5-5.7s6.2 1.9 7.5 5.7" stroke-linecap="round"/>',
 vid:'<rect x="3" y="6" width="12.5" height="12" rx="3"/><path d="M15.5 11l4.2-2.7a.8.8 0 011.3.7v6a.8.8 0 01-1.3.7L15.5 13z" stroke-linejoin="round"/>',
 ph:'<path d="M6.2 4h2.6l1.5 3.8-1.9 1.4a11 11 0 004.9 4.9l1.4-1.9L18.5 14v2.6a2 2 0 01-2.2 2A14.4 14.4 0 014 7.2 2 2 0 016.2 4z" stroke-linejoin="round"/>',
 vol:'<path d="M5 10h3l4-3.5v11L8 14H5z" stroke-linejoin="round"/><path d="M15 9a4 4 0 010 6M17.5 6.5a7.5 7.5 0 010 11" stroke-linecap="round"/>',
 back:'<path d="M14.5 5.5L8 12l6.5 6.5" stroke-linecap="round" stroke-linejoin="round"/>',
 send:'<path d="M4.4 11.3l14.4-6.2a.7.7 0 01.9.9l-6.2 14.4a.7.7 0 01-1.3-.1l-1.7-5.4-5.4-1.7a.7.7 0 01-.7-1.9z" stroke-linejoin="round"/>',
 wal:'<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/>',
 doc:'<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 shield:'<path d="M12 3.5l7 2.5v5.5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6z" stroke-linejoin="round"/>',
 pow:'<path d="M12 3v9" stroke-linecap="round"/><path d="M7.5 6.5a7 7 0 109 0" stroke-linecap="round"/>',
 gift:'<rect x="3.5" y="9" width="17" height="11" rx="2.5"/><path d="M3.5 13h17M12 9v11"/>',
 copy:'<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 6.5A2.5 2.5 0 0012.5 4h-6A2.5 2.5 0 004 6.5v6A2.5 2.5 0 006.5 15"/>',
 srch:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4" stroke-linecap="round"/>',
 mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" stroke-linecap="round"/>',
 micoff:'<path d="M9 4.6A3 3 0 0115 6v5.2M9 9.4V13a3 3 0 004.5 2.6" stroke-linecap="round"/><path d="M5.5 11.5a6.5 6.5 0 009.8 5.6M18.5 11.5a6.5 6.5 0 01-.4 2.2M12 18v3" stroke-linecap="round"/><path d="M4 3.5l16 17" stroke-linecap="round"/>',
 camoff:'<path d="M4 8.5A2.5 2.5 0 016.5 6H9l1.5-2h4L16 6h1.5A2.5 2.5 0 0120 8.5v8a2.5 2.5 0 01-1.2 2.1M16.5 19H6.5A2.5 2.5 0 014 16.5v-8" stroke-linejoin="round"/><path d="M9.9 9.9a3.2 3.2 0 004.3 4.3" stroke-linecap="round"/><path d="M4 3.5l16 17" stroke-linecap="round"/>',
 flip:'<path d="M4 8.5A2.5 2.5 0 016.5 6h2L10 4h4l1.5 2h2A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5z" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2"/>',
 cup:'<path d="M7 4h10v4a5 5 0 01-10 0z" stroke-linejoin="round"/><path d="M7 5.5H4.5V7a3 3 0 003 3M17 5.5h2.5V7a3 3 0 01-3 3M9.5 20h5M12 13v7" stroke-linecap="round"/>',
 grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/>',
 heart:'<path d="M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0112 8.3a4.1 4.1 0 017.5 2.3C19.5 15.4 12 20 12 20z" stroke-linejoin="round"/>',
 globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.3-3.3-8.5s1.1-6.1 3.3-8.5z"/>',
 chev:'<path d="M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/>',
 star:'<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8z" stroke-linejoin="round"/>',
 check:'<path d="M6.8 12.3l3.2 3.2 7.2-7.2" stroke-linecap="round" stroke-linejoin="round"/>',
 set:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6 1.7 1.7 0 00-.4 1.1H9.6a1.7 1.7 0 00-.4-1.1 1.7 1.7 0 00-1-.6 1.7 1.7 0 00-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 003.8 15a1.7 1.7 0 00-.6-1 1.7 1.7 0 00-1.1-.4V9.6A1.7 1.7 0 003.2 9a1.7 1.7 0 00.6-1 1.7 1.7 0 00-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 008.2 3.6a1.7 1.7 0 001-.6 1.7 1.7 0 00.4-1.1h4a1.7 1.7 0 00.4 1.1 1.7 1.7 0 001 .6 1.7 1.7 0 001.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0019.4 8c.13.39.34.73.6 1 .3.29.67.43 1.1.4v4c-.43-.03-.8.11-1.1.4-.26.27-.47.61-.6 1.2z" stroke-linejoin="round"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" stroke-linecap="round"/>',
 moon:'<path d="M20 14.2A8.2 8.2 0 019.8 4a8.4 8.4 0 102 10.4 8.2 8.2 0 008.2-.2z" stroke-linejoin="round"/>'};
const I=(k,s)=>`<svg viewBox="0 0 24 24" width="${s||20}" height="${s||20}" fill="none" stroke="currentColor" stroke-width="1.6">${P[k]}</svg>`;
const coin=`<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffc400" stroke="#ef9f00" stroke-width="1.3"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#fff178" stroke-width="1.2"/><path d="M12 7.4l1.35 2.73 3.02.44-2.18 2.12.52 3-2.71-1.43-2.71 1.43.52-3-2.18-2.12 3.02-.44z" fill="#fff3a1"/></svg>`;
/* One currency mark everywhere: balances, gifts, targets, calls and purchases. */
const gem=coin;
const th=()=>"";
function setTheme(m){document.documentElement.dataset.theme=m;r()}
function toggleTheme(){setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark")}
function toggleFollow(id,e){if(e)e.stopPropagation();S.following[id]=!S.following[id];r()}
function go(v,id){if(S.t){clearInterval(S.t);S.t=null}if(S.rt){clearTimeout(S.rt);S.rt=null}
 if(v==='host'&&id!==S.h)S.ht='posts';
 if(v==='user'){S.back='host';S.backId=S.h;S.u=id;id=null}
 if(v==='search')S.sq='';
 if(v==='editprofile')S.editBack=S.v==='settings'?'settings':'profile';
 S.v=v;if(id)S.h=id;S.tray=0;
 if(v==="call"||v==="voice"){S.sec=0;S.gifted=0;S.favGot=0;S.cmp=0;
  S.rmsgs=[["host",g(S.h).n.split(" ")[0],"hey, you made it"]];S.bal-=g(S.h).fee;S.t=setInterval(()=>{S.sec++;if(S.sec%60===0)S.bal=Math.max(0,S.bal-g(S.h).rate);tick()},1000)}
 if(v==="thread")S.msgs=TH.map(m=>m.slice());
 r();document.getElementById("screen").scrollTop=0;document.dispatchEvent(new CustomEvent("aurora:navigate"))}

/* Each surface shimmers once, then is remembered for the session. */
function loading(key,ms){
 if(S.cache[key])return false;
 setTimeout(()=>{S.cache[key]=1;r()},ms||480);
 return true}
function skCards(k){return `<div class="grid">${Array.from({length:k},()=>
 `<div class="sk skcard"></div>`).join("")}</div>`}
function skRows(k){return Array.from({length:k},()=>
 `<div class="skrow"><div class="sk" style="width:42px;height:42px;border-radius:99px"></div>
  <div style="flex:1"><div class="sk" style="height:11px;width:52%;border-radius:5px"></div>
  <div class="sk" style="height:10px;width:76%;border-radius:5px;margin-top:7px"></div></div></div>`).join("")}
function skGifts(k){return `<div class="ggrid">${Array.from({length:k},()=>
 `<div class="sk dark" style="height:78px;border-radius:15px"></div>`).join("")}</div>`}

function nav(){const el=document.getElementById("nav");
 if(["host","call","voice","thread","setup","board","search","post","user","coins","wallet","transactions","calls","blocked","safety","help","editprofile"].includes(S.v)){el.style.display="none";return}el.style.display="flex";
 el.innerHTML=[["home","Home","home"],["chats","Chats","chat"],["profile","Profile","user"],["settings","Settings","set"]]
  .map(([v,l,i])=>`<button class="${S.v===v?"on":""}" onclick="go('${v}')"><span class="ic">${I(i)}</span>${l}</button>`).join("")}

function card(h){
 return `<div class="card" role="button" tabindex="0" aria-label="Open ${h.n} profile" onclick="go('host','${h.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();go('host','${h.id}')} ">${art(h.seed)}<span class="scrim"></span>
 ${h.top?`<span class="top10">TOP 10 &middot; Hourly</span>`:`<span class="cat">${h.tag}</span>`}
 <button class="lv" aria-label="Join ${h.n} live" onclick="event.stopPropagation();go('call','${h.id}')">${I("vid",11)}LIVE</button>
 <span class="cbot"><span class="cnm">${h.n} &#127470;&#127475;</span></span></div>`}

function vHome(){
 const T=[["following","Following"],["explore","Explore"],["foryou","For You"],["new","New"]];
 let L=H.slice();
 if(S.tab==="following")L=L.filter(h=>h.fol);
 else if(S.tab==="new")L=L.filter(h=>h.nw);
 else if(S.tab==="foryou")L=L.sort((a,b)=>parseFloat(b.v)-parseFloat(a.v));
 L=L.sort((a,b)=>b.live-a.live||b.on-a.on);
 const cards=L.map(card);
 return ` ${loading("home")?skCards(8):cards.length?`<div class="grid fade">${cards.join("")}</div>`:
  `<div class="s13 muted" style="text-align:center;padding:48px 20px">Nobody here yet. Try another tab or filter.</div>`}
 <div style="height:10px"></div>`}
function setTab(t){S.tab=t;r()}

/* One source of truth for a host's posts, shared by the grid and the viewer. */
/* Senders who spend on a host. Stable ids so their profiles are linkable. */
function sid(nm){return "u_"+nm.toLowerCase().replace(/[^a-z]/g,"")}
const SCITY=["Delhi","Pune","Kolkata","Jaipur","Surat","Kochi","Bhopal","Nagpur","Patna","Indore"];
function sender(id){
 const nm=SENDERS.find(x=>sid(x)===id);
 if(!nm)return null;
 const i=SENDERS.indexOf(nm);
 return {id,n:nm,seed:(i*37)%60+3,live:0,on:1,host:0,
  tag:"Supporter",c:SCITY[i%SCITY.length],
  lvl:(i*7)%28+6,
  sent:((i*613)%740+160)*1000,
  recv:((i*271)%120+8)*1000,
  v:((i*83)%900+40)+"",
  hosts:(i%6)+3,
  joined:["Jan","Mar","May","Aug","Oct"][i%5]+" 2026"};
}

/* Hosts and senders render through the same profile shape. */
function asProfile(x,isHost){
 return isHost
  ? {id:x.id,n:x.n,seed:x.seed,on:x.on,tag:x.tag,c:x.c,host:1,
     lvl:(x.seed%40)+8,recv:lifetime(x),sent:((x.seed*409)%260+18)*1000,
     fol:x.v,following:(x.seed%400)+90}
  : {id:x.id,n:x.n,seed:x.seed,on:1,tag:x.tag,c:x.c,host:0,
     lvl:x.lvl,recv:x.recv,sent:x.sent,fol:x.v,following:x.hosts*7};
}
function mvpsFor(h){
 return SENDERS.map((nm,i)=>({id:sid(nm),n:nm,seed:(h.seed*3+i*29)%60+2,live:0,on:1,
  c:Math.round(((h.seed*197+i*911)%520+80)*1000/(i*0.55+1))}))
  .sort((a,b)=>b.c-a.c);
}

function postsFor(h){
 return Array.from({length:12},(_,i)=>({
  i,
  seed:(h.seed*7+i*13)%42+i,
  vid:(h.seed+i)%3===0,
  likes:((h.seed*31+i*137)%480)+14,
  cap:CAPS[(h.seed+i)%CAPS.length]}));
}

function vHost(){return profilePage(asProfile(g(S.h),true),g(S.h))}
function vUser(){
 const u=sender(S.u);
 if(!u)return `<div class="empty">That supporter is no longer here.</div>`;
 return profilePage(asProfile(u,false),u);
}

/* One page for hosts, supporters and the signed-in user's own profile. */
function profilePage(p,raw,self){
 const t=S.ht||"posts";
 let posts=postsFor(raw);
 if(self&&S.postData.length)posts=S.postData.map((src,i)=>({i,custom:src,vid:0,likes:0})).concat(posts).slice(0,12);
 const list=p.host?mvpsFor(raw):backedFor(raw);
 const back=p.host?"go('home')":"history_back()";
 const followed=!!S.following[p.id];
 const cover=self&&S.coverData?`<img src="${S.coverData}" alt="Your cover">`:artC(p.seed);
 const avatar=self&&S.avatarData?`<span class="av" style="width:54px;height:54px"><img src="${S.avatarData}" alt="Your profile photo"></span>`:av(p,54,"none");

 return `<div class="hp">
  <div class="hpcover">
   ${cover}
   ${self?"":`<button class="hpc" aria-label="Back" onclick="${back}">${I("back",19)}</button>`}
   ${p.on?`<span class="hplive">Online</span>`:""}
  </div>

  <div class="hpid">
   <span class="hpav">${avatar}</span>

   <div class="hpname"><span class="nm">${p.n}</span>
    ${p.host?`<span class="hpverified" role="img" aria-label="Verified user" title="Verified user">${I("check",13)}</span>`:""}
    ${self?`<button class="hpfollow" onclick="go('editprofile')">Edit profile</button>`:p.host?`<button class="hpfollow ${followed?'on':''}" onclick="toggleFollow('${p.id}',event)">${followed?'Following':'+ Follow'}</button>`:""}</div>

   <div class="hpmeta">
    <span class="hpchip">Lv ${p.lvl}</span>
    <span class="hpchip">${p.tag}</span>
    <span class="hpchip">ID ${66200000+p.seed*137} ${I("copy",11)}</span></div>

   <div class="hpfol"><b>${p.following}</b> Following <span class="faint">&middot;</span>
    <b>${p.fol}</b> Followers <span class="faint">&middot;</span> ${p.c}</div>

   <div class="hpcards">
    <button class="hpcard"><span class="t">${I("gift",13)} Gift gallery</span>
     <span class="v">${gem}${n(p.recv)}</span></button>
    <button class="hpcard"><span class="t">${I("send",13)} Coins sent</span>
     <span class="v">${gem}${n(p.sent)}</span></button>
    <button class="hpcard"><span class="t">${I("heart",13)} Followers</span>
     <span class="v">${p.fol}</span></button></div>
  </div>

  <div class="hptabs">
   ${[["posts","grid","Posts"],["mvp","cup",p.host?"MVPs":"Backing"]].map(([k,ic,lb])=>
    `<button class="${t===k?"on":""}" onclick="S.ht='${k}';r()">${I(ic,17)}<span>${lb}</span></button>`).join("")}</div>

  ${t==="mvp"
   ? `<div class="mvp">${list.map((m,i)=>`<button class="mrow ${i<3?"p"+(i+1):""}" onclick="${m.host?`go('host','${m.id}')`:`go('user','${m.id}')`}">
       <span class="mrank r${i<3?i+1:0}">${i+1}</span>
       <span class="bav">${avc(m,40)}</span>
       <span class="mname">${m.n}${i===0?`<span class="mtag">${p.host?"TOP MVP":"TOP HOST"}</span>`:""}</span>
       <span class="mcoin">${gem}${n(m.c)}</span></button>`).join("")}</div>`
   : `<div class="hpgrid">${posts.map(x=>`<button class="post" ${self?'':`onclick="openPost(${x.i})"`}>
       ${x.custom?`<img src="${x.custom}" alt="Your post">`:artC(x.seed)}
       ${x.vid?`<span class="pl">&#9654;</span>`:""}
       <span class="lk">${I("heart",11)}${x.likes}</span></button>`).join("")}</div>`}
 </div>

 ${self?'':`<div class="hpbar">
  <button class="msg" aria-label="Message" onclick="go('thread','${p.host?p.id:S.backId||"aanya"}')">${I("chat",20)}</button>
  ${p.host
   ? `<button class="msg" aria-label="Start voice call" onclick="go('voice','${p.id}')">${I("ph",20)}</button>
      <button class="cta" onclick="go('setup','${p.id}')">${I("vid",19)} Start video call</button>`
   : `<button class="cta" style="background:var(--raised);color:var(--ink)">${I("heart",18)} Follow</button>`}
 </div>`}`}

/* The hosts a sender backs, biggest first. */
function backedFor(u){
 return H.concat(EXTRA).map((h,i)=>({id:h.id,n:h.n,seed:h.seed,on:h.on,live:h.live,host:1,
  c:Math.round(((u.seed*173+i*577)%420+60)*1000/(i*0.4+1))}))
  .sort((a,b)=>b.c-a.c).slice(0,8);
}

function vSetup(){
 const h=g(S.h), tierIdx=1;
 return `<div class="setup">
 <div class="stage">
  ${S.cam?art(h.seed):`<div class="camoff"><span>${I("camoff",26)}</span><b>Camera is off</b>
    <i>Viewers will see your profile photo</i></div>`}
  <div class="guide"></div>
  <div class="stopbar">
   <button class="sicon" aria-label="Cancel" onclick="go('host','${h.id}')">${I("back",19)}</button>
   <span style="flex:1"></span>
   <button class="sicon ${S.mic?"":"off"}" aria-pressed="${S.mic?"false":"true"}"
    aria-label="${S.mic?"Mute microphone":"Unmute microphone"}"
    onclick="S.mic=S.mic?0:1;r()">${I(S.mic?"mic":"micoff",18)}</button>
   <button class="sicon ${S.cam?"":"off"}" aria-pressed="${S.cam?"false":"true"}"
    aria-label="${S.cam?"Turn camera off":"Turn camera on"}"
    onclick="S.cam=S.cam?0:1;r()">${I(S.cam?"flip":"camoff",18)}</button></div>

  <div class="scard">
   <div style="display:flex;align-items:center;gap:7px">
    <span style="font-size:12.5px;font-weight:700;color:#ff5cae;font-variant-numeric:tabular-nums">${n(TIERS[tierIdx])}/h</span>
    <span style="font-size:10.5px;color:rgba(255,255,255,.45)">${n(150000)} left to upgrade</span></div>
   <div class="gchip" style="margin-top:7px">${TIERS.map((t,i)=>`<button class="${i===tierIdx?"on":""}">${n(t)}/h</button>`).join("")}</div>
  </div>

  <div class="hint">Keep centred, head and shoulders in frame</div>
 </div>

 <div class="actbar">
  <button class="rnd" aria-label="Beauty and effects" onclick="S.sh='fx';r()">${I("star",19)}</button>
  <button class="gb" onclick="go('call','${h.id}')">${S.cam?"Go live":"Go live · camera off"}</button>
  <button class="rnd" aria-label="Mission" onclick="S.sh='mission';r()">${I("cup",19)}</button>
  <button class="rnd" aria-label="Gift target" onclick="S.sh='gift';r()">${I("gift",19)}</button></div>
 ${S.sh==="fx"?fxSheet():S.sh==="mission"?missionSheet():S.sh==="gift"?giftSheet():""}
</div>`}

function shWrap(title,sub,inner){
 return `<div class="tray"><div class="veil" onclick="S.sh=0;r()"></div>
  <div class="panel">
   <div class="thead"><span><span class="tt">${title}</span><br><span class="sub">${sub}</span></span>
    <button class="xbtn" aria-label="Close" onclick="S.sh=0;r()">&times;</button></div>
   <div class="shbody">${inner}</div></div></div>`}

function fxSheet(){
 const opts=BEAUTY[S.btab], sel=S.bsel[S.btab], adj=opts[sel]&&opts[sel][2];
 return shWrap("Beauty and effects","Applies to your camera before you go live",
 `<div class="dtabs">${Object.keys(BEAUTY).map(k=>`<button class="${S.btab===k?"on":""}" onclick="S.btab='${k}';r()">${k}</button>`).join("")}
   <button class="rst" onclick="resetFx()">Reset</button></div>
  <div class="dopts">${opts.map(([l,e],i)=>`<button class="dopt ${sel===i?"on":""}" onclick="pickFx(${i})">
    <span class="dcirc">${e}</span><span class="dlab">${l}</span></button>`).join("")}</div>
  ${adj?`<div class="slid"><input type="range" min="0" max="100" value="60" aria-label="${opts[sel][0]} strength"></div>`:""}`)}

function missionSheet(){
 const goal=S.goal, prog=S.gifted||0, pct=Math.min(100,goal?prog/goal*100:0);
 const gl=GOALS.find(x=>x[0]===goal)[1];
 return shWrap("Mission","Your target rises as coins come in",
 `<div class="gchip">${GOALS.map(([v,l])=>`<button class="${S.goal===v?"on":""}" onclick="S.goal=${v};r()">${l}</button>`).join("")}</div>
  <div class="msum"><span class="big">${n(prog)}</span><span class="of">of ${gl} &middot; ${pct.toFixed(1)}%</span></div>
  <div class="mbar"><i style="width:${pct}%"></i></div>
  <div class="sech" style="margin-top:18px"><b>Tasks</b><span>resets at midnight</span></div>
  ${TASKS.map(([t,d,rw],i)=>{const done=[0,0,0][i],tot=[60,20,500][i];
   return `<div class="task">
    <span class="ti">${I(["cup","gift","star"][i],17)}</span>
    <span class="tx"><span class="tn">${t}</span><span class="td">${d}</span>
     <span class="tb"><i style="width:${(done/tot*100).toFixed(0)}%"></i></span></span>
    <span class="rw">${gem}${rw}</span></div>`}).join("")}`)}

function giftSheet(){
 const f=GIFTS[S.fav];
 return shWrap("Gift target","Pick the gift you'll ask viewers for",
 `<div class="favrow">${GIFTS.map(([l,e,v],i)=>`<button class="${S.fav===i?"on":""}" onclick="S.fav=${i};r()" aria-label="${l}">
    <span class="gl">${e}</span><span class="gc">${n(v)}</span></button>`).join("")}</div>
  <div class="gchip" style="margin-top:10px">${FAVN.map(c=>`<button class="${S.favn===c?"on":""}" onclick="S.favn=${c};r()">${c} &times;</button>`).join("")}</div>
  <div class="pnum" style="margin-top:9px"><span>${f[1]} ${f[0]}</span><span>${S.favGot||0} / ${S.favn} &middot; ${n(f[2]*S.favn)} coins</span></div>`)}

function pickFx(i){S.bsel[S.btab]=i;r()}
function resetFx(){S.bsel={Beauty:0,Makeup:0,Sticker:0,Filters:0,"Image quality":0};r()}

function vCall(){const h=g(S.h);
 return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;background:#000;overflow:hidden">
 <div style="position:absolute;inset:0">${art(h.seed)}<div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.5),transparent 40%,rgba(0,0,0,.9))"></div></div>
 <div class="lvrow">
  <button class="lvback" aria-label="Leave call" onclick="go('host','${h.id}')">${I("back",14)}</button>
  <div class="goalchip" id="gch"></div></div>
 <div class="fx" id="fl"></div>
 <div id="wn" style="position:relative;margin-top:auto;padding:0 14px"></div>
 <div class="lvfeed" id="rfeed"></div>
 <div class="lvstrip">${GIFTS.map(([l,e,v])=>`<button ${S.bal<v?"disabled":""} aria-label="Send ${l}"
   onclick="sendGift('${l}','${e}',${v})"><span class="em">${e}</span><span class="pr">${gem}${n(v)}</span></button>`).join("")}</div>

 ${S.cmp?"":`<div class="lvbar">
  <button class="rndb" aria-label="Chat" onclick="S.cmp=!S.cmp;r()">${I("chat",21)}</button>
  <div class="idpill" role="button" tabindex="0" aria-label="Open ${h.n}'s profile" onclick="go('host','${h.id}')" onkeydown="if(event.key==='Enter')go('host','${h.id}')">
   ${av(h,38,"none")}
   <span class="tx"><span class="nm">${h.n}</span>
    <span class="co">${gem}${n(lifetime(h))}</span></span>
   <button class="quickfollow ${S.following[h.id]?'on':''}" aria-label="${S.following[h.id]?'Unfollow':'Follow'} ${h.n}" onclick="toggleFollow('${h.id}',event)">${S.following[h.id]?'✓':'+'}</button>
   <span style="color:rgba(255,255,255,.35);font-size:17px">&rsaquo;</span></div>
  <button class="rndb giftb" aria-label="All gifts" onclick="S.tray=1;r()">${I("gift",21)}</button></div>`}
 ${S.cmp?`<div class="lvcomp">
   ${av(me,34,"none")}
   <input id="rmsg" placeholder="Say something..." onkeydown="if(event.key==='Enter')rsay()">
   <button class="csend" onclick="rsay()" aria-label="Send">${I("send",19)}</button>
   <button class="cclose" onclick="S.cmp=0;r()" aria-label="Close">&times;</button></div>`:""}
 ${S.tray?giftTray():S.sh==="gift"?giftSheet():""}</div>`}

function vVoice(){const h=g(S.h);
 return `<div class="voicecall">
  <button class="voiceback" aria-label="Back to ${h.n}'s profile" onclick="go('host','${h.id}')">${I("back",18)}</button>
  <div class="voiceorb">${avc(h,104)}</div>
  <h2>${h.n}</h2>
  <p>Voice call</p>
  <strong id="ck">00:00</strong>
  <div class="voiceactions">
   <button class="voiceaction ${S.spk?'on':''}" aria-label="${S.spk?'Turn speaker off':'Turn speaker on'}" onclick="S.spk=S.spk?0:1;r()">${I("vol",22)}<span>Speaker</span></button>
   <button class="voiceend" aria-label="End voice call" onclick="go('host','${h.id}')">${I("ph",25)}</button>
   <button class="voiceaction ${S.mic?'':'on'}" aria-label="${S.mic?'Mute microphone':'Unmute microphone'}" onclick="S.mic=S.mic?0:1;r()">${I(S.mic?"mic":"micoff",22)}<span>Mute</span></button>
  </div>
 </div>`}

/* coins the host has taken in, all time */
function lifetime(h){return ((h.seed*97531)%8600000)+920000+(S.gifted||0)}

/* Room chat. Painted on its own so typing never loses focus. */
const REPLIES=["haha okay","yes, one second","tell me more","that's a good one",
 "you're too kind","let me try that next","I hear you","noted, coming up"];

function rsay(){
 const i=document.getElementById("rmsg");
 if(!i||!i.value.trim())return;
 S.rmsgs.push(["me","You",i.value.trim()]);
 i.value=""; paintFeed(); i.focus();
 hostReply();
}

/* the host answers so the feed reads as a conversation, not a monologue */
function hostReply(){
 clearTimeout(S.rt);
 S.rt=setTimeout(()=>{
  if(S.v!=="call")return;
  const h=g(S.h);
  S.rmsgs.push(["host",h.n.split(" ")[0],REPLIES[Math.floor(Math.random()*REPLIES.length)]]);
  paintFeed();
 },1100+Math.random()*900);
}
function paintFeed(){
 const f=document.getElementById("rfeed");
 if(!f)return;
 f.innerHTML=S.rmsgs.map(([k,w,t])=>`<div class="lvmsg ${k}">
  ${w?`<span class="who">${w}</span>`:""}<span class="txt">${t}</span></div>`).join("");
 f.scrollTop=f.scrollHeight;
}

function giftTray(){
 const tier=v=>v>=19999?"epic":v>=5999?"rare":"";
 const lab=v=>v>=19999?"LGD":v>=5999?"RARE":"";
 return `<div class="tray"><div class="veil" onclick="S.tray=0;r()"></div>
  <div class="panel">
   <div class="thead">
    <span><span class="tt">Send a gift</span><br><span class="sub">Coins go straight to the host</span></span>
    <button class="addc" onclick="go('coins')">${gem}${n(S.bal)} &nbsp;+</button>
    <button class="xbtn" aria-label="Close" onclick="S.tray=0;r()">&times;</button></div>
   ${loading("gifts",420)?skGifts(12):`<div class="ggrid fade">${GIFTS.map(([l,e,v])=>`<button class="gi ${tier(v)}" ${S.bal<v?"disabled":""} onclick="sendGift('${l}','${e}',${v})">
     ${lab(v)?`<span class="tier">${lab(v)}</span>`:""}
     <span class="gl">${e}</span><span class="gn">${l}</span><span class="gc">${gem}${n(v)}</span></button>`).join("")}</div>`}
  </div></div>`}

function sendGift(l,e,v){
 if(S.bal<v)return;
 S.bal-=v; S.tray=0; S.sh=0;
 if(S.v==="thread"){
  S.msgs.push(["g",e,n(v),new Date().toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})]);
  r(); paint(); playGift(l,e,v); return}
 S.gifted=(S.gifted||0)+v;
 if(GIFTS[S.fav] && GIFTS[S.fav][0]===l)S.favGot=(S.favGot||0)+1;
 S.rmsgs.push(["gift","You",`sent ${e} ${l} &middot; ${n(v)}`]);
 r(); playGift(l,e,v); hostReply();
}

/* Centre-stage gift animation. Cheap gifts get a quick rise; the top tiers
   take over the frame with a flash, rotating rays and a spark burst. */
function playGift(l,e,v){
 const f=document.getElementById("fl"); if(!f)return;
 const big=v>=19999, mid=v>=5999, life=big?3000:2000;
 const frag=document.createElement("div");
 frag.style.cssText="position:absolute;inset:0";
 const add=(cls,style)=>{const d=document.createElement("div");d.className=cls;
  if(style)d.style.cssText=style;frag.appendChild(d);return d};

 /* every gift gets a shockwave and a halo; they are what read as "shiny" */
 add("fxhalo");
 add("fxring");
 if(mid||big)add("fxring two");
 if(mid||big)add("fxflash");
 if(big){add("fxbeam");add("fxrays")}

 /* gold dust: more, smaller and twinkling for the top tier */
 const dust=big?22:mid?12:6;
 for(let i=0;i<dust;i++){
  const sp=document.createElement("span"); sp.className="fxsp";
  const a=Math.random()*Math.PI*2, d=(big?110:70)+Math.random()*(big?150:90);
  const sz=(big?4:3)+Math.random()*5;
  sp.style.width=sp.style.height=sz.toFixed(1)+"px";
  sp.style.setProperty("--dx",(Math.cos(a)*d).toFixed(0)+"px");
  sp.style.setProperty("--dy",(Math.sin(a)*d).toFixed(0)+"px");
  sp.style.animationDelay=(Math.random()*0.5).toFixed(2)+"s";
  frag.appendChild(sp);
 }

 const gl=document.createElement("div");
 gl.className="fxg"+(big?" big":"");
 gl.innerHTML=`<span class="em">${e}</span>`;
 frag.appendChild(gl);

 const tag=document.createElement("div");
 tag.className="fxtag";
 tag.innerHTML=`You sent ${l} &middot; ${n(v)}`;
 if(big){tag.style.animationDuration="3s, 2.2s";tag.style.fontSize="13px"}
 frag.appendChild(tag);

 f.appendChild(frag);
 setTimeout(()=>frag.remove(),life+300);
}

function tick(){if(!["call","voice"].includes(S.v))return;const h=g(S.h);
 const c=document.getElementById("ck");if(c)c.textContent=String(Math.floor(S.sec/60)).padStart(2,"0")+":"+String(S.sec%60).padStart(2,"0");
 const b=document.getElementById("bl");if(b)b.innerHTML=gem+n(S.bal);
 const gc=document.getElementById("gch");
 if(gc){const goal=S.goal,prog=S.gifted||0,pct=Math.min(100,goal?prog/goal*100:0),f=GIFTS[S.fav];
  const gl=GOALS.find(x=>x[0]===goal)[1];
  const fpct=Math.min(100,(S.favGot||0)/S.favn*100);
  const lc=document.querySelector(".idpill .co");
  if(lc)lc.innerHTML=gem+n(lifetime(g(S.h)));
  gc.innerHTML=`<span class="askcard" onclick="S.sh='gift';r()">
    <span class="ttl">Ask what<br>u want</span>
    <span class="em">${f[1]}</span>
    <span class="pr">${gem}${n(f[2])}</span>
    <span class="bar"><i style="width:${fpct}%"></i></span>
    <span class="ct">${S.favGot||0} / ${S.favn}</span></span>
   <span class="gpill">
    <span class="ttl">Coin target</span>
    <span class="amt">${gem}${n(prog)}<em>/ ${gl}</em></span>
    <span class="bar"><i style="width:${pct}%;background-position:${100-pct}% 0;
     box-shadow:0 0 ${(6+pct*0.16).toFixed(0)}px rgba(255,192,46,${(0.25+pct*0.006).toFixed(2)})"></i></span></span>`}
 const w=document.getElementById("wn");
 if(w)w.innerHTML=S.bal<h.rate?`<div style="background:rgba(0,0,0,.65);border:1px solid var(--live);border-radius:16px;padding:12px;margin-bottom:10px">
  <div style="color:#fff;font-size:13.5px;font-weight:600">Balance runs out next minute</div>
  <div class="s12" style="color:rgba(255,255,255,.65);margin-top:2px">The line drops automatically at zero.</div></div>`:""}

function vChats(){
 const q=(S.q||"").toLowerCase();
 const L=CH.filter(([id,l])=>{const h=g(id);return !q||h.n.toLowerCase().includes(q)||l.toLowerCase().includes(q)});
 const unread=CH.reduce((a,c)=>a+c[3],0);
 return `<div class="srch"><div>${I("srch",17)}<input id="cq" placeholder="Search conversations" value="${S.q||""}" oninput="S.q=this.value;paintList()"></div></div>
 ${unread?`<div class="s12 muted" style="max-width:720px;margin:0 auto;padding:8px 16px 2px">${unread} unread</div>`:""}
 <div class="clist" id="clist">${loading("chats")?skRows(6):
   L.length?`<div class="fade">${L.map(row).join("")}</div>`:`<div class="empty">No conversations match that search.</div>`}</div>
 <div style="height:12px"></div>`}
function row([id,l,t,u]){const h=g(id);
 return `<button class="rowlink" onclick="go('thread','${id}')">
  ${av(h,44)}
  <span style="flex:1;min-width:0">
   <span style="display:flex;align-items:baseline;gap:8px">
    <span class="s15" style="flex:1;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.n}</span>
    <span class="s11" style="color:${u?"var(--accent-ink)":"var(--faint)"};font-weight:${u?600:400}">${t}</span></span>
   <span style="display:flex;align-items:center;gap:8px;margin-top:2px">
    <span class="s13" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${u?"var(--ink)":"var(--muted)"};font-weight:${u?500:400}">${l}</span>
    ${u?`<span class="tab" style="background:var(--accent);color:var(--cta-ink);border-radius:99px;min-width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;padding:0 5px">${u}</span>`:""}</span>
  </span></button>`}
function paintList(){S.cache.chats=1;const q=(S.q||"").toLowerCase();
 const L=CH.filter(([id,l])=>{const h=g(id);return !q||h.n.toLowerCase().includes(q)||l.toLowerCase().includes(q)});
 const el=document.getElementById("clist");
 if(el)el.innerHTML=L.length?L.map(row).join(""):`<div class="empty">No conversations match that search.</div>`}

function vThread(){const h=g(S.h);
 return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden">
 <div class="hdr" style="padding:10px 12px">
  <button onclick="go('chats')" aria-label="Back" style="color:var(--muted);display:flex">${I("back",21)}</button>
  <button class="threadperson" onclick="go('host','${h.id}')" aria-label="Open ${h.n} profile">
   ${av(h,34)}
   <span style="min-width:0"><span class="s15" style="display:block;font-weight:600;line-height:1.2">${h.n}</span>
   <span class="s11 muted" style="display:flex;align-items:center;gap:5px">${h.on?"Online":"Away"} · ${h.c}</span></span>
  </button>
  <button onclick="go('setup','${h.id}')" aria-label="Video call" style="color:var(--muted);display:flex">${I("vid",21)}</button></div>
 <div class="pat" id="tf"></div>
 <div class="fx" id="fl"></div>
 <div class="qs">${GIFTS.slice(0,8).map(([l,e,v])=>`
   <button onclick="sendGift('${l}','${e}',${v})" ${S.bal<v?"disabled":""} aria-label="Send ${l}">
    <span class="gl">${e}</span><span class="gc">${n(v)}</span></button>`).join("")}</div>
 <div class="comp">
  <button class="send" style="background:var(--raised);color:var(--accent-ink)" onclick="S.tray=1;r()" aria-label="Open gifts">${I("gift",20)}</button>
  <span class="field"><input id="ti" placeholder="Message" onkeydown="if(event.key==='Enter')snd()"></span>
  <button class="send" onclick="snd()" aria-label="Send">${I("send",20)}</button></div>
 ${S.tray?giftTray():""}</div>`}
function focusField(id){const i=document.getElementById(id);
 if(i){i.focus();setTimeout(()=>i.scrollIntoView({block:"nearest"}),260)}}
function snd(){const i=document.getElementById("ti");if(!i||!i.value.trim())return;
 S.msgs.push(["m",i.value.trim(),new Date().toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"})]);i.value="";paint()}
function paint(){const f=document.getElementById("tf");if(!f)return;
 f.innerHTML=S.msgs.map(([w,t,a,tm])=>w==="g"
  ?`<div class="gbub"><span class="gl">${t}</span><span class="gc">${gem}${a}</span>
     <span class="gt2">${tm||""}</span></div>`
  :`<div class="bub ${w==="m"?"me":"them"}">${t}<span style="font-size:10.5px;margin-left:7px;opacity:.6">${a}</span></div>`).join("");
 f.scrollTop=f.scrollHeight}

function vBoard(){
 const rows=boardRows();
 return `  ${S.bt==="family"
   ? `<div class="empty">Family boards start once you join or create one.</div>`
   : `<div class="blist">${rows.map((x,i)=>`<button class="brow ${i<3?"top":""}" onclick="go('host','${x.id}')">
      <span class="brank">${i+1}</span>
      <span class="bav">${x.live?`<span class="blive">LIVE</span>`:""}${av(x,42,"none")}<span class="flag">&#127470;&#127475;</span></span>
      <span class="bname">${x.n}</span>
      <span class="bcoin">${gem}${n(x.c)}</span></button>`).join("")}</div>`}
  <div style="height:10px"></div>`}

function vSearch(){ return `<div class="clist" id="sres"></div><div style="height:16px"></div>`}

function searchRows(){
 const q=(S.sq||"").trim().toLowerCase();
 const all=H.concat(EXTRA);
 const L=q?all.filter(h=>h.n.toLowerCase().includes(q)||h.tag.toLowerCase().includes(q)
   ||h.c.toLowerCase().includes(q)):all;
 if(!L.length)return `<div class="empty">No creator matches &ldquo;${S.sq}&rdquo;.</div>`;
 return (q?"":`<div class="s12 muted" style="padding:12px 16px 4px">Suggested creators</div>`)+
  L.map(h=>`<button class="rowlink" onclick="go('host','${h.id}')">
   ${av(h,44)}
   <span style="flex:1;min-width:0">
    <span style="display:flex;align-items:center;gap:6px">
     <span class="s15" style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.n}</span>
     ${h.live?`<span class="blive" style="position:static;transform:none">LIVE</span>`:""}</span>
    <span class="s12 muted" style="display:block;margin-top:1px">${h.tag} &middot; ${h.c} &middot; ${h.v} followers</span></span>
   <span class="s12" style="color:var(--accent-ink);font-weight:700">${n(h.rate)}/min</span></button>`).join("")}

function paintSearch(){const el=document.getElementById("sres");if(el)el.innerHTML=searchRows()}

function vPost(){
 const h=g(S.h), posts=postsFor(h);
 return `<div class="pv" id="pv">
  ${posts.map(p=>`<div class="pvi">
   ${artC(p.seed)}
   ${p.vid?`<span class="pvplay">&#9654;</span>`:""}
  </div>`).join("")}
 </div>
 <div class="pvtop">
  <button class="pvclose" aria-label="Close" onclick="go('host','${h.id}')">${I("back",19)}</button>
  <span class="pvcount" id="pvc">${(S.pi||0)+1} / ${posts.length}</span></div>
 `}

function openPost(i){S.pi=i;go("post")}
/* Jump the viewer to the tapped post, then keep the counter in step. */
function scrollPost(){
 const pv=document.getElementById("pv");
 if(!pv)return;
 pv.scrollLeft=(S.pi||0)*pv.clientWidth;
 pv.onscroll=()=>{
  const i=Math.round(pv.scrollLeft/pv.clientWidth);
  if(i!==S.pi){S.pi=i;const c=document.getElementById("pvc");
   if(c)c.textContent=`${i+1} / ${postsFor(g(S.h)).length}`}};
}

function history_back(){go(S.back||"home",S.backId)}

function vCoins(){
 const sel=S.pack==null?2:S.pack, pk=PACKS[sel], money=v=>v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
 return `<div class="cwrap">
  <div class="ctools"><span class="cbal">${coin}${n(S.bal)}</span><button class="ccurrency">₹ INR ${I('chev',14)}</button></div>
  <div class="ctitle">Welcome Bonus for You!</div>
  <div class="cgrid">${PACKS.map(([c,pr,bonus],i)=>`<button class="cpack ${sel===i?"on":""}" onclick="S.pack=${i};r()">
    ${i===3?`<span class="cbest">🔥 Hot</span>`:i===5?`<span class="cbest">★ Popular</span>`:""}
    <span class="amt">${coin}${n(c)}</span>
    <span class="bon">${bonus}% More</span>
    <span class="coinart" aria-hidden="true"><i>★</i><i>★</i><i>★</i></span>
    <span class="pr">&#8377;${money(pr)}</span></button>`).join("")}</div>
  <div class="cnote">Coins are used for calls and gifts. Select a pack, then continue securely.</div>
 </div>
 <div class="cbar">
  <button class="cbtn" onclick="buyPack(${sel})">${coin}Get ${n(pk[0])} coins &middot; &#8377;${money(pk[1])}</button></div>`}

function buyPack(i){const [c]=PACKS[i];S.bal+=c;go("profile")}

const TXNS=[
 ["Call with Priya","Today, 11:42 AM",-420,"call"],
 ["Coin pack","Yesterday, 8:16 PM",3400,"topup"],
 ["Gift to Meera","Yesterday, 7:02 PM",-120,"gift"],
 ["Call with Ananya","2 Sep, 10:24 PM",-285,"call"],
 ["Bonus coins","1 Sep, 9:00 AM",250,"topup"]];

function vWallet(){return `<div class="acct">
 <div class="accthero"><div class="eyebrow">Available balance</div><div class="big">${gem}${n(S.bal)}</div>
  <div class="sub">Use coins for calls and gifts. Your balance is ready across Aurora.</div>
  <button class="cta" onclick="go('coins')">Add coins</button></div>
 <div class="acctsec"><div class="accttitle"><span>Quick actions</span></div>
  <div class="support"><button onclick="go('coins')"><b>Recharge</b><span>Choose a coin pack</span></button>
   <button onclick="go('transactions')"><b>History</b><span>See every movement</span></button></div></div>
 <div class="acctsec"><div class="accttitle"><span>Recent activity</span><button onclick="go('transactions')" style="color:var(--accent-ink)">View all</button></div>
  <div class="acctcard">${TXNS.slice(0,3).map(txRow).join("")}</div></div></div>`}

function txRow(x){const [title,time,amount,type]=x;return `<div class="acctrow">
 <span class="acctico">${I(type==='call'?'ph':type==='gift'?'gift':'wal',16)}</span>
 <span style="flex:1;min-width:0"><span class="main">${title}</span><span class="meta">${time}</span></span>
 <span class="end ${amount>0?'pos':'neg'}">${amount>0?'+':'−'}${n(Math.abs(amount))}</span></div>`}

function vTransactions(){const L=TXNS.filter(x=>S.txf==='all'||(S.txf==='in'?x[2]>0:x[2]<0));return `<div class="acct">
 <div class="accttabs">${[['all','All'],['in','Added'],['out','Spent']].map(([k,l])=>`<button class="${S.txf===k?'on':''}" onclick="S.txf='${k}';r()">${l}</button>`).join('')}</div>
 <div class="acctcard">${L.map(txRow).join('')}</div>
 <div class="s11 muted" style="padding:11px 3px;text-align:center">Showing recent demo activity</div></div>`}

const CALLS=[
 ["aanya","Today, 11:42 AM","7m 00s",420],
 ["noor","2 Sep, 10:24 PM","5m 42s",285],
 ["tara","31 Aug, 9:08 PM","3m 16s",156],
 ["meher","29 Aug, 8:31 PM","11m 04s",552]];
function vCalls(){return `<div class="acct"><div class="acctcard">${CALLS.map(([id,time,dur,cost])=>{const h=g(id);return `<div class="acctrow">
 <span class="callav">${av(h,38,'none')}<span class="badge">${I('ph',9)}</span></span>
 <span style="flex:1;min-width:0"><span class="main">${h.n}</span><span class="meta">${time} · ${dur}</span></span>
 <span class="end"><span class="meta">${gem}${n(cost)}</span><button onclick="go('setup','${id}')" style="display:block;margin-top:3px;color:var(--accent-ink);font-size:11.5px;font-weight:750">Call again</button></span></div>`}).join('')}</div></div>`}

function vBlocked(){return `<div class="acct">${S.blocked.length?`<div class="acctcard">${S.blocked.map(id=>{const h=g(id);return `<div class="acctrow">${av(h,38,'none')}<span style="flex:1"><span class="main">${h.n}</span><span class="meta">Blocked host</span></span><button class="softbtn" style="margin:0" onclick="S.blocked=S.blocked.filter(x=>x!=='${id}');r()">Unblock</button></div>`}).join('')}</div>`:`<div class="acctcard emptycompact"><span class="acctico">${I('shield',22)}</span><h3>No blocked hosts</h3><p>People you block can’t call or message you. You can manage them here anytime.</p><button class="softbtn" onclick="go('home')">Browse creators</button></div>`}</div>`}

function flipSafe(k){S.safe[k]=S.safe[k]?0:1;r()}
function vSafety(){const prefs=[['discover','Discoverable profile','Let people find you in search'],['requests','Message requests','Allow new people to send requests'],['activity','Activity status','Show when you are online']];return `<div class="acct">
 <div class="acctsec" style="margin-top:0"><div class="accttitle"><span>Privacy controls</span></div><div class="acctcard">${prefs.map(([k,t,d])=>`<button class="acctrow" onclick="flipSafe('${k}')"><span class="acctico">${I('shield',16)}</span><span style="flex:1"><span class="main">${t}</span><span class="meta">${d}</span></span><span class="switch ${S.safe[k]?'on':''}"></span></button>`).join('')}</div></div>
 <div class="acctsec"><div class="accttitle"><span>Safety center</span></div><div class="acctcard">
  <button class="acctrow" onclick="go('blocked')"><span class="acctico">${I('user',16)}</span><span style="flex:1"><span class="main">Blocked accounts</span><span class="meta">Review people you blocked</span></span><span class="ch">›</span></button>
  <button class="acctrow" onclick="S.faq=3;go('help')"><span class="acctico">${I('shield',16)}</span><span style="flex:1"><span class="main">Child safety</span><span class="meta">Age rules and family resources</span></span><span class="ch">›</span></button>
  <button class="acctrow" onclick="S.faq=2;go('help')"><span class="acctico">${I('doc',16)}</span><span style="flex:1"><span class="main">Terms & privacy</span><span class="meta">How Aurora protects your information</span></span><span class="ch">›</span></button></div></div></div>`}

const FAQ=[
 ['How do refunds work?','If a recharge fails, coins are not deducted. Completed coin purchases are final in this demo.'],
 ['Why was I charged for a call?','A connection fee starts the call, then coins are deducted per minute at the host’s displayed rate.'],
 ['Terms & privacy','Aurora only uses the profile and activity information needed to run this prototype. No real account data is collected.'],
 ['Child safety','Aurora is designed for adults. Report suspected underage use immediately and avoid sharing personal information.']];
function vHelp(){return `<div class="acct">
 <div class="acctsec" style="margin-top:0"><div class="accttitle"><span>Popular questions</span></div><div class="acctcard">${FAQ.map(([q,a],i)=>`<div><button class="acctrow" onclick="S.faq=S.faq===${i}?-1:${i};r()"><span class="acctico">${I(i<2?'wal':'shield',16)}</span><span class="main" style="flex:1">${q}</span><span class="ch">${S.faq===i?'⌃':'›'}</span></button>${S.faq===i?`<div class="faqbody">${a}</div>`:''}</div>`).join('')}</div></div>
 <div class="acctsec"><div class="accttitle"><span>Contact us</span></div><div class="support"><button onclick="S.faq=0;r()"><b>Billing help</b><span>Refunds and recharges</span></button><button onclick="S.faq=1;r()"><b>Call support</b><span>Charges and connections</span></button></div></div>
 <div class="s11 muted" style="padding:14px 3px;text-align:center">Typical reply time: under 24 hours</div></div>`}

const esc=v=>String(v||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
function pickMedia(e,k){
 const files=Array.from(e.target.files||[]);if(!files.length)return;
 Promise.all(files.map(file=>new Promise(resolve=>{const rd=new FileReader();rd.onload=()=>resolve(rd.result);rd.readAsDataURL(file)})))
  .then(data=>{if(k==='posts')S.postData=(S.postData||[]).concat(data).slice(0,7);else S[k+'Data']=data[0];r()})}
function saveProfile(){me.n=(S.editName||me.n).trim()||me.n;me.c=(S.editCity||me.c).trim()||me.c;me.about=(S.editAbout||"").trim();go(S.editBack||'profile')}
function vEditProfile(){const initials=(S.editName||me.n).split(" ").map(x=>x[0]).slice(0,2).join("");return `<div class="editwrap">
 <div class="editmedia"><div class="editcover">${S.coverData?`<img src="${S.coverData}" alt="Cover preview">`:artC(me.seed+17)}
  <label class="mediaedit coveredit">${I('flip',14)} Change cover<input class="hiddenfile" type="file" accept="image/*" onchange="pickMedia(event,'cover')"></label></div>
  <div class="editavatar"><span class="pic">${S.avatarData?`<img src="${S.avatarData}" alt="Profile preview">`:initials}</span>
   <label class="mediaedit" aria-label="Change profile photo">${I('flip',12)}<input class="hiddenfile" type="file" accept="image/*" onchange="pickMedia(event,'avatar')"></label></div></div>
 <div class="editgroup"><label class="editlabel" for="editname">Display name</label><input class="editinput" id="editname" maxlength="32" value="${esc(S.editName)}" oninput="S.editName=this.value"></div>
 <div class="editgroup"><label class="editlabel" for="editcity">Location</label><input class="editinput" id="editcity" maxlength="40" value="${esc(S.editCity)}" oninput="S.editCity=this.value"></div>
 <div class="editgroup"><label class="editlabel" for="editabout">About</label><textarea class="editinput" id="editabout" maxlength="180" placeholder="Tell people about yourself" oninput="S.editAbout=this.value">${esc(S.editAbout)}</textarea></div>
 <div class="editgroup"><span class="editlabel">Posts</span><div class="editposts">
  <label class="editpost add">${I('grid',18)} Add posts<input class="hiddenfile" type="file" accept="image/*" multiple onchange="pickMedia(event,'posts')"></label>
  ${(S.postData||[]).map((src,i)=>`<span class="editpost"><img src="${src}" alt="New post ${i+1}"></span>`).join('')}
  ${!(S.postData||[]).length?postsFor(me).slice(0,3).map(p=>`<span class="editpost">${artC(p.seed)}</span>`).join(''):''}
 </div></div>
 <button class="editsave" onclick="saveProfile()">Save profile</button></div>`}

function vProfile(){
 const p={id:"me",n:me.n,seed:me.seed,on:1,host:1,lvl:7,tag:me.tag,c:me.c,
  recv:2090372+(S.gifted||0),sent:246000,fol:"2.4K",following:181};
 return profilePage(p,me,true)}

function vSettings(){
 const rows=[
  ["wal","Wallet","Recharge, balance and history","wallet"],
  ["doc","Transactions","Top ups and deductions","transactions"],
  ["ph","Call history","Who you called and for how long","calls"],
  ["chat","Blocked hosts","Nobody blocked yet","blocked"],
  ["shield","Privacy and safety","Terms, reporting, child safety","safety"],
  ["cup","Help","Refunds, billing questions, contact","help"]];
 return `<div class="pwrap">

  <button class="phero" onclick="go('editprofile')" style="width:100%;text-align:left">
   ${av(me,64,"none")}
   <div style="min-width:0">
    <div class="disp nm">${me.n}</div>
    <div class="id">ID 858350921 ${I("copy",13)}</div>
    <div class="lvlchip">LEVEL 7</div></div><span class="ch" style="margin-left:auto;color:var(--faint);font-size:22px">&rsaquo;</span></button>

  <div class="pstats">
   <div><div class="v tab">${n(S.bal)}</div><div class="k">Coins</div></div>
   <div><div class="v tab">${n(S.gifted||0)}</div><div class="k">Gifted</div></div>
   <div><div class="v tab">${CH.length}</div><div class="k">Chats</div></div></div>

  <div class="pbal">
   <span class="orb"></span>
   <div class="amt"><div class="k">Balance</div>
    <div class="v">${gem}${n(S.bal)}</div></div>
   <button class="go" onclick="go('coins')">Add coins</button></div>

  <div class="psec"><h3>Your profile</h3><div class="plist">
   <button class="pitem" onclick="go('editprofile')"><span class="pico">${I('user',17)}</span>
    <span class="tx"><span class="t1" style="display:block">Edit profile</span><span class="t2" style="display:block">Cover, photo, posts and about</span></span><span class="ch">&rsaquo;</span></button>
  </div></div>

  <div class="psec"><h3>Appearance</h3>
   <button class="themerow" onclick="toggleTheme()" aria-label="Toggle dark mode" aria-pressed="${document.documentElement.dataset.theme==='dark'}">
    <span class="themeico">${I(document.documentElement.dataset.theme==='dark'?'moon':'sun',16)}</span>
    <span class="themetx"><b>${document.documentElement.dataset.theme==='dark'?'Dark':'Light'} mode</b><span>Tap to switch appearance</span></span>
    <span class="themeswitch ${document.documentElement.dataset.theme==='dark'?'on':''}"><i></i></span></button></div>

  <div class="psec"><h3>Account</h3>
   <div class="plist">${rows.map(([ic,t1,t2,go_])=>`<button class="pitem" ${go_?`onclick="go('${go_}')"`:""}>
     <span class="pico">${I(ic,17)}</span>
     <span class="tx"><span class="t1" style="display:block">${t1}</span><span class="t2" style="display:block">${t2}</span></span>
     <span class="ch">&rsaquo;</span></button>`).join("")}</div></div>

  <button class="pout">Log out</button>
  <div class="s12 faint" style="text-align:center;padding:16px 0 0">Aurora v0.1</div>
 </div>`}

/* Chrome lives outside the scroller, so it cannot drift while scrolling. */
function topFor(){
 if(S.v==="home"){
  const T=[["following","Following"],["explore","Explore"],["foryou","For You"],["new","New"]];
  return `<div class="stabs">
   ${T.map(([k,l])=>`<button class="stab ${S.tab===k?"on":""}" onclick="setTab('${k}')">${l}</button>`).join("")}
   <span class="sicons">
    <button class="ibtn" aria-label="Search creators" onclick="go('search')">${I("srch",19)}</button>
    <button class="tbadge" aria-label="Leaderboard" onclick="go('board')">${I("cup",19)}</button></span></div>`}
 if(S.v==="search")return `<div class="hdr" style="gap:8px">
   <button aria-label="Back" onclick="go('home')" style="color:var(--muted);display:flex;flex:0 0 auto">${I("back",21)}</button>
   <span class="sfield">${I("srch",17)}
    <input id="sq" placeholder="Search creators by name" value="${S.sq||""}" oninput="S.sq=this.value;paintSearch()">
    ${S.sq?`<button aria-label="Clear" onclick="S.sq='';r()" style="color:var(--faint);font-size:16px">&times;</button>`:""}
   </span></div>`;
 if(S.v==="coins")return `<div class="hdr" style="gap:8px">
   <button aria-label="Back" onclick="go('settings')" style="color:var(--muted);display:flex;flex:0 0 auto">${I("back",21)}</button>
   <span class="disp title">Add coins</span></div>`;
 const acctTitles={wallet:"Wallet",transactions:"Transactions",calls:"Call history",blocked:"Blocked hosts",safety:"Privacy and safety",help:"Help",editprofile:"Edit profile"};
 if(acctTitles[S.v])return `<div class="hdr" style="gap:8px">
   <button aria-label="Back" onclick="go('${S.v==='editprofile'?(S.editBack||'profile'):'settings'}')" style="color:var(--muted);display:flex;flex:0 0 auto">${I("back",21)}</button>
   <span class="disp title">${acctTitles[S.v]}</span>
   ${S.v==='wallet'?`<button onclick="go('transactions')" style="margin-left:auto;color:var(--accent-ink);font-size:12px;font-weight:700">History</button>`:''}</div>`;
 if(S.v==="chats")return `<div class="hdr"><span class="disp title">Chats</span>
   <button class="bal" onclick="go('profile')">${gem}${n(S.bal)}</button></div>`;
 if(S.v==="settings")return `<div class="hdr"><span class="disp title">Settings</span></div>`;
 if(S.v==="board")return `<div class="bsticky"><div class="bhdr">
   <button aria-label="Back" onclick="go('home')" style="color:var(--muted);display:flex;flex:0 0 auto">${I("back",21)}</button>
   ${[["creators","Creators"],["family","Family"]].map(([k,l])=>
     `<button class="btab ${S.bt===k?"on":""}" onclick="S.bt='${k}';r()">${l}</button>`).join("")}</div>
  <div class="bctl">
   <span class="seg3">${PERIODS.map(([k,l])=>
     `<button class="${S.per===k?"on":""}" onclick="S.per='${k}';r()">${l}</button>`).join("")}</span>
   <button class="globe" aria-label="Region">${I("globe",17)}<span style="font-size:15px">&rsaquo;</span></button></div></div>`;
 return ""}

function r(){
 document.getElementById("top").innerHTML=topFor();
 const el=document.getElementById("screen");
 el.innerHTML={home:vHome,host:vHost,setup:vSetup,call:vCall,voice:vVoice,chats:vChats,thread:vThread,board:vBoard,search:vSearch,post:vPost,user:vUser,coins:vCoins,profile:vProfile,settings:vSettings,wallet:vWallet,transactions:vTransactions,calls:vCalls,blocked:vBlocked,safety:vSafety,help:vHelp,editprofile:vEditProfile}[S.v]();
 el.style.overflowY=["call","voice","thread","setup","post"].includes(S.v)?"hidden":"auto";
 nav();
 if(S.v==="call"){tick();paintFeed();
  if(S.cmp){const i=document.getElementById("rmsg");
   if(i){i.focus();setTimeout(()=>i.scrollIntoView({block:"nearest"}),260)}}}
 if(S.v==="voice")tick();
 if(S.v==="search"){paintSearch();const i=document.getElementById("sq");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}}
 if(S.v==="post")scrollPost();
 if(S.v==="thread")paint()}
const st=document.createElement("style");
st.textContent="@keyframes up{0%{transform:translateY(0) scale(.6);opacity:0}15%{opacity:1;transform:translateY(-10px) scale(1.1)}100%{transform:translateY(-180px);opacity:0}}";
document.head.appendChild(st);
r();
