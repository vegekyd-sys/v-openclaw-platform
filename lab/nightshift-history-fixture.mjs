// Match historical board cardinality without copying business text or creating
// runnable historical jobs. Native dispatch still reads these rows for its
// global owner/capacity checks.
export async function seedNightShiftHistory({runtime,count}) {
  if(!count)return;
  const {t:createStores}=await import(runtime+'/openclaw/dist/sqlite-store-CH-caj1l.js');
  const stores=createStores();let bytes=0;
  try{
    for(let i=0;i<count;i++){
      const id='candidate-history-'+i;
      const card={id,title:id,status:'done',priority:'normal',position:i,createdAt:1,updatedAt:1,completedAt:1,labels:[],events:[],notes:'historical fixture '.repeat(60),metadata:{automation:{boardId:'candidate-history'},archivedAt:1}};
      bytes+=Buffer.byteLength(JSON.stringify(card));await stores.cards.register(id,{version:1,card});
    }
  }finally{stores.close();}
  console.log(JSON.stringify({event:'historical-workboard-fixture',count,serializedBytes:bytes,runnable:0}));
}
