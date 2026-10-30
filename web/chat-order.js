/* Delivery transports can arrive in either order. Only committed server order
   determines the timeline; an optimistic row is matched by its client ID. */
window.ZimiChatOrder=(()=>{
  const timestamp=m=>Date.parse(m.createdAt||m.at||'')||0;
  const sequence=m=>Number.isSafeInteger(m.sequence)&&m.sequence>0?{value:m.sequence,after:0}:
    m.kind==='gift'&&Number.isSafeInteger(m.orderAfterSequence)&&m.orderAfterSequence>=0?{value:m.orderAfterSequence,after:1}:undefined;
  function compare(a,b){
    if(a.local!==b.local&&(a.local||b.local))return a.local?1:-1;
    const left=sequence(a),right=sequence(b),leftSequence=left!==undefined,rightSequence=right!==undefined;
    if(leftSequence!==rightSequence)return leftSequence?1:-1;
    if(leftSequence&&left.value!==right.value)return left.value-right.value;
    if(leftSequence&&left.after!==right.after)return left.after-right.after;
    const time=timestamp(a)-timestamp(b);if(time)return time;
    const leftId=String(a.id||''),rightId=String(b.id||'');return leftId<rightId?-1:leftId>rightId?1:0;
  }
  function combine(old,next){
    next=Object.fromEntries(Object.entries(next).filter(([,value])=>value!==undefined));
    if(!old)return {...next};
    const stale=(old.kind==='gift'&&old.legacyGift===false&&next.legacyGift===true)||!next.deleted&&((old.deleted&&!next.deleted)||(old.edited&&!next.edited)||
      (old.editedAt&&next.editedAt&&Date.parse(old.editedAt)>Date.parse(next.editedAt)));
    const merged=stale?{...next,...old}:{...old,...next};
    if(old.status==='read'||next.status==='read')merged.status='read';
    if(!next.local&&next.id)merged.local=false;
    return merged;
  }
  function merge(current,incoming,hidden=new Set()){
    const rows=[],byId=new Map(),byClient=new Map(),byGift=new Map();
    for(const next of [...current,...incoming]){
      if(next.id&&hidden.has(String(next.id)))continue;
      let index=next.id?byId.get(String(next.id)):undefined;
      if(index===undefined&&next.mine&&next.clientId)index=byClient.get(next.clientId);
      if(index===undefined&&next.kind==='gift'&&next.gift?.transferId)index=byGift.get(String(next.gift.transferId));
      if(index===undefined){index=rows.length;rows.push({...next})}
      else rows[index]=combine(rows[index],next);
      const row=rows[index];if(row.id)byId.set(String(row.id),index);if(row.mine&&row.clientId)byClient.set(row.clientId,index);if(row.kind==='gift'&&row.gift?.transferId)byGift.set(String(row.gift.transferId),index);
    }
    for(const row of rows)if(row.reply){const index=byId.get(String(row.reply.id)),original=index===undefined?null:rows[index];if(original&&(original.deleted||original.edited))row.reply={...row.reply,text:original.deleted?'':original.text||'',image:!original.deleted&&original.kind==='image',voice:!original.deleted&&original.kind==='voice',deleted:!!original.deleted}}
    return rows.sort(compare);
  }
  return {compare,merge,combine};
})();
