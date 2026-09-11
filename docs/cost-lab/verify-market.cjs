const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const data=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'research-market.json'),'utf8'));
const html=fs.readFileSync(require('node:path').join(__dirname,'../../apps/web/app/admin/cost-lab/assets/index.html'),'utf8');
const embedded=JSON.parse(html.match(/<script id="market-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
assert.deepEqual(embedded,data);
new vm.Script(html.match(/<script id="market-interface">([\s\S]*?)<\/script>/)[1]);
assert.equal(data.platforms.length,10);
assert.equal(data.platforms.filter(x=>x.category==='image').length,5);
assert.equal(data.platforms.filter(x=>x.category==='assistant').length,5);
const allowed=['midjourney.com','adobe.com','leonardo.ai','canva.com','ideogram.ai','recraft.ai','chatgpt.com','openai.com','google.com','gemini.google','claude.com','x.ai','genspark.ai','discord.com'];
for(const source of Object.values(data.sources)){
 const url=new URL(source.url);assert.equal(url.protocol,'https:');if(source.kind==='official')assert.ok(allowed.some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)));else assert.ok(['genigpt.net','theaicareerlab.com','www.reddit.com','note.com','www.mobileappdaily.com'].includes(url.hostname));assert.ok(source.title);
}
for(const p of data.platforms){
 assert.ok(p.quantityEvidence&&p.quantityEvidence.summary&&p.quantityEvidence.cases.length);for(const c of p.quantityEvidence.cases){assert.ok(c.value&&c.condition&&c.date);for(const id of c.refs)assert.ok(data.sources[id]);}assert.ok(p.free&&p.quality&&p.quota&&p.caution&&p.plans.length&&p.refs.length);
 for(const id of [...p.refs,...p.adoptionRefs,...p.plans.flatMap(x=>x.refs)])assert.ok(data.sources[id],id);
 for(const plan of p.plans){assert.ok(Number.isFinite(plan.usd)&&plan.usd>=0);assert.ok(plan.limit&&plan.grade&&plan.refs.length);}
}
assert.ok(data.platforms.find(x=>x.id==='chatgpt').caution.includes('신규 가입'));
assert.ok(data.platforms.find(x=>x.id==='gemini').caution.includes('2026-05-17'));
assert.ok(data.platforms.find(x=>x.id==='grok').quota.includes('2026-06'));
assert.ok(data.platforms.find(x=>x.id==='claude').quota.includes('해당 없음'));
assert.ok(data.platforms.find(x=>x.id==='genspark').caution.includes('2026-12-31'));
const plusQuota=data.platforms.find(x=>x.id==='chatgpt').plusQuota;assert.equal(plusQuota.monthlyUsd,20);assert.equal(plusQuota.guaranteedMonthlyImages,null);assert.equal(plusQuota.guaranteedDailyImages,null);assert.equal(plusQuota.guaranteedImagesPerWindow,null);assert.deepEqual(plusQuota.assumedMonthlyImageCounts,[100,500,1000]);assert.ok(html.includes('비공식 보고 집계'));assert.equal(plusQuota.observedReference.official,false);assert.deepEqual(plusQuota.observedReference.range,[40,50]);assert.equal(plusQuota.observedReference.evidenceLevel,'낮음');assert.deepEqual(plusQuota.observedReference.monthlyScenario.range,[800,1000]);
console.log(JSON.stringify({platforms:data.platforms.length,plans:data.platforms.reduce((n,x)=>n+x.plans.length,0),officialSources:Object.values(data.sources).filter(x=>x.kind==='official').length,supplementarySources:Object.values(data.sources).filter(x=>x.kind!=='official').length,checkedOn:data.checkedOn,embeddedDataMatches:true,syntax:'passed'}));
