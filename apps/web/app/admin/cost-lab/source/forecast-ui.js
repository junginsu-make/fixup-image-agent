(function () {
  'use strict';
  const api = window.MCSForecast, el = id => document.getElementById(id);
  const copy = x => structuredClone(x);
  const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (x, digits=0) => x === null || !Number.isFinite(x) ? '미확인' : new Intl.NumberFormat('ko-KR',{maximumFractionDigits:digits}).format(x);
  const money = x => x === null ? '미확정' : number(x)+'원';
  const get = (obj, path) => path.split('.').reduce((v,k) => v?.[k], obj);
  const put = (obj, path, value) => { const keys=path.split('.'); let target=obj; for(const key of keys.slice(0,-1))target=target[key]; target[keys.at(-1)]=value; };
  let draft = api.createScenario(false), lastRows = [], timer, syncing=false, valid=true;
  let detailsOpen=false,fieldId=0,products={};
  let launch=api.createLaunchStrategy(),launchOpen=false;
  const presets={light:[40,50],normal:[70,80],full:[100,100]};
  const sizes=[[1024,768],[1024,1024],[1024,1536],[1920,1080],[2560,1440],[3840,2160]];
  const aliases={flare:'gpt-image-2.5-flare',sunburst:'gpt-image-2.5-sunburst',gpt2:'gpt-image-2',pro:'nano-banana-pro',nano2:'nano-banana-2',nano:'nano-banana',seedream:'seedream-5-pro',qwen:'qwen-image-2-pro',ro:'redesign-openai',rg:'redesign-google'};
  const types=[['poster','이미지·포스터'],['sns','카드뉴스'],['pdp','상세페이지'],['character','캐릭터 신규'],['character-angle','캐릭터 각도 추가'],['redesign','리디자인 생성'],['redesign-edit','리디자인 수정']];
  function field(path,label,options={}) {
    const value=get(draft,path), id='fc-'+path.replaceAll('.','-')+'-'+(++fieldId);
    const meta=`id="${id}" data-fc-path="${path}" data-fc-kind="${options.kind??'number'}"`;
    const control=options.choices?`<select ${meta}>${options.choices.map(([v,l])=>`<option value="${esc(v)}" ${String(value??'')===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`:
      `<input ${meta} type="${options.kind==='text'?'text':options.kind==='date'?'date':options.kind==='month'?'month':'number'}" ${options.kind?'':`min="${options.min??0}" max="${options.max??1e9}" step="any"`} value="${esc(value??'')}" ${options.nullable?'placeholder="미입력은 미확인" data-fc-nullable="true"':''} ${options.readonly?'readonly':''}>`;
    return `<label class="fc-field ${options.wide?'fc-wide':''}" for="${id}"><span>${esc(label)}</span>${control}${options.unit?`<small class="fc-unit">${esc(options.unit)}</small>`:''}</label>`;
  }
  const nullable=(path,label,unit)=>field(path,label,{nullable:true,unit});
  const select=(path,label,choices)=>field(path,label,{kind:'text',choices});
  const bool=(path,label)=>field(path,label,{kind:'boolean',choices:[['false','아니요'],['true','예']]});
  const section=(title,body)=>`<details><summary>${title}</summary>${body}</details>`;
  const grid=body=>`<div class="fc-grid">${body}</div>`;
  function error(err) {
    valid=false;el('forecast-panel').classList.add('invalid');el('fc-error').hidden=false;
    const issue=err?.issues?.[0];
    el('fc-error').textContent=issue?`${issue.path.join(' → ')} 입력 범위를 확인하세요. 마지막 유효 결과를 표시하고 있습니다.`:(err?.message??String(err));
  }
  function remember(path) { draft.evidence[path]={kind:'assumed',source:'사용자 직접 입력',checkedAt:new Date().toISOString().slice(0,10)}; }
  function sourceProjection(source, fresh=false) {
    if(source==='current')return;
    const w=source==='wallet'?window.MCSWallet?.read():null, main=typeof state==='object'?state:null;
    const src=w??main;if(!src)return;
    const previous=new Map(draft.profiles.map(p=>[p.id,p]));
    draft.source=source;draft.fx=src.fx;
    draft.business.basis=w?'wallet':'subscription';draft.business.vatPct=src.vat;draft.business.paymentPct=src.pg;
    draft.business.supportPerPayingKrw=src.support;draft.business.walletMarginPct=w?src.target:draft.business.walletMarginPct;
    if(fresh)draft.business.policy=w?'current':src.policy==='protected'?'proposed':'current';
    if(fresh){draft.business.infraMode='manual-total';draft.business.manualInfraKrw=src.fixed;}
    else if(draft.business.infraMode==='manual-total')draft.business.manualInfraKrw=src.fixed;
    const template=api.createScenario(true).profiles[0];
    draft.profiles=src.rows.map(row=>{
      const old=previous.get('price-'+row.id), [width,height]=sizes[row.size]??sizes[1];
      const p={...copy(template),...(old??{}),id:'price-'+row.id,label:row.name,kind:row.kind==='edit'?'redesign-edit':row.kind,model:aliases[row.model],width,height,
        images:row.images,mode:row.mode,plans:0,textOverrideUsd:row.llm,unitOverrideUsd:row.override,
        serviceRetryPct:w?(src.regen-1)*100:row.auto,failurePct:src.fail,failureCostPct:src.failCost,
        candidates:1,angles:row.kind==='character'?Math.max(0,Math.min(6,row.images-1)):3,storageMode:row.kind==='sns'?'overwrite':'append'};
      if(!w&&src.policy==='protected'){
        const charge=!fresh&&old?.proposedCharge!==null&&old?.proposedCharge!==undefined?old.proposedCharge:rowResult(row,src).credits;
        p.proposedCharge=charge;p.proposedRequired=charge;
      }else{p.proposedCharge=null;p.proposedRequired=null;}
      return p;
    });
    const base=copy(draft.groups[0]??api.createScenario(true).groups[0]);
    const paid={...base,id:'paid',label:w?'충전 고객':'유료 고객',members:src.customers,quota:w?src.topup:src.credits,priceKrw:w?src.topup:src.price,purchases:w?src.frequency:src.packs,utilPct:src.util,
      creditPerPurchase:!w,activePct:fresh?100:base.activePct,workMix:src.rows.map(row=>({id:'price-'+row.id,weight:row.mix})),freeAnalyses:w?0:src.analysisPaid,analysisUsd:w?0:src.analysisUsd};
    draft.groups=[paid];
    if(!w&&src.freeUsers>0){
      let mix=paid.workMix;
      if(src.freeMode==='economic'){
        const free= draft.profiles.filter(p=>!['redesign','redesign-edit'].includes(p.kind)).map(p=>({...copy(p),id:'free-'+p.id,model:'nano-banana',unitOverrideUsd:null,proposedCharge:null,proposedRequired:null}));
        draft.profiles.push(...free);mix=paid.workMix.filter(m=>free.some(p=>p.id==='free-'+m.id)).map(m=>({...m,id:'free-'+m.id}));
      }
      draft.groups.push({...copy(base),id:'free',label:'무료 회원',creditPerPurchase:false,members:src.freeUsers,quota:src.freeCredits,priceKrw:0,purchases:0,utilPct:src.freeUtil,activePct:100,workMix:mix,freeAnalyses:src.analysisFree,analysisUsd:src.analysisUsd});
    }
    if(w)draft.business.otherFixedKrw=src.freeCost;
  }
  function validateProducts(raw,base){
    const result={};for(const key of ['current','main','wallet']){if(raw?.[key]){const candidate=api.validateScenario({...base,...raw[key],source:key});result[key]={groups:candidate.groups,profiles:candidate.profiles,business:candidate.business};}}return result;
  }
  function switchSource(next){
    products[draft.source]=copy({groups:draft.groups,profiles:draft.profiles,business:draft.business});
    if(products[next]){draft=api.validateScenario({...draft,...products[next],source:next});if(next!=='current')sourceProjection(next,false);}
    else if(next==='current'){const base=api.createScenario(draft.example);draft={...draft,groups:base.groups,profiles:base.profiles,business:base.business,source:next};}
    else{draft.source=next;sourceProjection(next,true);}
    hydrate();
  }
  function updateLegacyFrom(path) {
    if(draft.source==='current')return;
    if(draft.source==='main'&&typeof state==='object'){
      const map={'groups.0.members':'customers','groups.0.quota':'credits','groups.0.priceKrw':'price','groups.0.utilPct':'util','groups.0.purchases':'packs','fx':'fx','business.vatPct':'vat','business.paymentPct':'pg','business.manualInfraKrw':'fixed'};
      if(map[path]){state[map[path]]=get(draft,path);if(path==='groups.0.priceKrw'&&state.pricingMode==='auto')state.pricingMode='manual';}
    }else if(draft.source==='wallet'&&window.MCSWallet){
      const raw=window.MCSWallet.read(),map={'groups.0.members':'customers','groups.0.quota':'topup','groups.0.priceKrw':'topup','groups.0.utilPct':'util','groups.0.purchases':'frequency','fx':'fx','business.vatPct':'vat','business.paymentPct':'pg','business.manualInfraKrw':'fixed'};
      if(map[path]){raw[map[path]]=get(draft,path);syncing=true;try{window.MCSWallet.restore(raw);}finally{syncing=false;}if(path==='groups.0.quota')draft.groups[0].priceKrw=draft.groups[0].quota;}
    }
  }
  function mainInputs() {
    const mixed=draft.groups.length>1;
    const body=mixed?`<div class="fc-wide"><strong>무료·유료 ${draft.groups.length}개 그룹 구성</strong><p>총 ${number(draft.groups.reduce((a,g)=>a+g.members,0))}명 · 상세에서 그룹별 인원을 조정합니다.</p><button data-fc-action="groups">회원 구성 조정</button></div>`:
      field('groups.0.members','회원이 몇 명인가요?',{unit:'명'})+field('groups.0.quota',draft.business.basis==='wallet'?'1인 충전 제공량':draft.groups[0].creditPerPurchase?'한 묶음에 얼마를 주나요?':'1인당 매월 얼마를 주나요?',{unit:draft.business.basis==='wallet'?'원 단위 가상 크레딧':'크레딧'})+field('groups.0.priceKrw',draft.business.basis==='wallet'?'1인 충전액':'한 사람에게 얼마를 받나요?',{unit:draft.business.basis==='wallet'?'원 / 충전':'원 / 월 · 0원이면 무료'});
    el('fc-main-inputs').innerHTML=body;
  }
  function configurations() {
    const expanded=[...el('fc-config').children].map(x=>x.open);const focused=document.activeElement?.dataset?.fcPath;
    const moneyInputs=grid(select('source','보고 싶은 상품 기준',[['current','현재 서비스 크레딧'],['main','기존 정액제 상품 설계'],['wallet','기존 충전형 상품']])+select('business.basis','매출 기준',[['free','무료 제공'],['subscription','월 정액'],['wallet','충전형 (가상 1크레딧=1원)']])+field('fx','환율',{unit:'원 / USD'})+field('business.vatPct','판매 부가세율',{unit:'%'})+field('business.paymentPct','결제 수수료',{unit:'%'})+field('business.otherFixedKrw','기타 고정비',{unit:'원 / 월'})+field('business.supportPerPayingKrw','유료 1인 지원비',{unit:'원 / 월'})+select('business.infraMode','인프라 비용 계산',[['itemized','항목별 계산'],['manual-total','기존 합계 직접 입력']])+nullable('business.manualInfraKrw','직접 입력 인프라 합계','항목별 모드에서는 더하지 않음')+field('business.providerTaxPct','공급자 비용 세금',{unit:'%'})+field('business.fxFeePct','해외결제 수수료',{unit:'%'})+field('business.walletMarginPct','충전형 작업 마진',{unit:'%'})+field('business.walletInitialBalance','충전형 1인 초기 잔액',{unit:'원'}));
    const groups=draft.groups.map((g,i)=>`<article class="fc-subcard"><h3>${esc(g.label)}</h3>${grid(field(`groups.${i}.label`,'그룹 이름',{kind:'text'})+field(`groups.${i}.members`,'시작 회원 수')+field(`groups.${i}.quota`,'1인 제공량')+field(`groups.${i}.priceKrw`,'1인 판매가 / 충전액')+field(`groups.${i}.growthPct`,'월 회원 증가율',{min:-100,unit:'%'})+field(`groups.${i}.activePct`,'활성 회원 비율',{unit:'%'})+field(`groups.${i}.utilPct`,'활성 회원 소진율',{unit:'%'})+field(`groups.${i}.purchases`,'월 구매/충전 횟수')+bool(`groups.${i}.creditPerPurchase`,'제공량에 구매 횟수 곱하기')+select(`groups.${i}.grant`,'크레딧 지급',[['monthly','구독 · 매월 갱신'],['purchase','구매 · 3개월 보존'],['once','보너스 · 기한 없이 1회']])+field(`groups.${i}.freeAnalyses`,'활성 1인 무료 분석 횟수')+nullable(`groups.${i}.analysisUsd`,'분석 1회 원가','USD')+select(`groups.${i}.team`,'공유 팀 한도',[['','없음'],...draft.teams.map(t=>[t.id,t.id])]))}<label class="fc-field"><span>월별 회원 수 직접 입력 (쉼표 구분, 비우면 증가율 적용)</span><input data-fc-list="groups.${i}.monthlyMembers" value="${esc(g.monthlyMembers?.join(',')??'')}"></label><div class="fc-grid">${draft.profiles.map(p=>`<label class="fc-field"><span>${esc(p.label)} 완료 작업 비중</span><input type="number" min="0" max="1000" data-fc-mix="${i}" data-fc-work="${p.id}" value="${g.workMix.find(m=>m.id===p.id)?.weight??0}"></label>`).join('')}</div><div class="fc-actions"><button data-fc-remove-group="${i}">이 그룹 삭제</button></div></article>`).join('');
    const profiles=draft.profiles.map((p,i)=>`<article class="fc-subcard"><h3>${esc(p.label)}</h3>${grid(field(`profiles.${i}.label`,'작업 이름',{kind:'text'})+select(`profiles.${i}.kind`,'종류',types)+select(`profiles.${i}.model`,'이미지 모델',[...draft.catalog.models.map(m=>[m.id,m.label]),...Object.keys(draft.catalog.flat).map(x=>[x,x])])+select(`profiles.${i}.mode`,'참고 이미지',[['t2i','없음'],['i2i','있음']])+field(`profiles.${i}.width`,'이미지 너비',{unit:'px'})+field(`profiles.${i}.height`,'이미지 높이',{unit:'px'})+select(`profiles.${i}.ratio`,'고정 비율 모델의 비율',['1:1','2:3','3:2','4:5','5:4','9:16','16:9'].map(x=>[x,x]))+field(`profiles.${i}.images`,'작업당 이미지/카드 수')+nullable(`profiles.${i}.successCount`,'부분 성공 장수','비우면 모두 성공')+nullable(`profiles.${i}.billableCount`,'공급자 과금 이미지 수','비우면 성공 출력 수')+field(`profiles.${i}.plans`,'별도 기획 요청 횟수')+field(`profiles.${i}.visionReads`,'기획 요청당 첨부 읽기 장수')+field(`profiles.${i}.regenerations`,'사용자 추가 재생성 장수')+field(`profiles.${i}.serviceRetryPct`,'서비스 추가 시도율',{unit:'%'})+field(`profiles.${i}.failurePct`,'최종 실패율',{unit:'%'})+field(`profiles.${i}.failureCostPct`,'실패 1건 비용 비율',{unit:'%'})+field(`profiles.${i}.failedFilePct`,'실패 시 파일 발생 비율',{unit:'%'})+field(`profiles.${i}.extraSavePct`,'추가/실패 파일 보관 비율',{unit:'%'})+field(`profiles.${i}.slotsPerCard`,'SNS 카드당 그림 슬롯')+field(`profiles.${i}.slotScale`,'SNS 슬롯 면적 비율',{unit:'0.01~1'})+field(`profiles.${i}.placedCards`,'SNS 그대로 넣는 카드')+field(`profiles.${i}.candidates`,'캐릭터 후보 수')+field(`profiles.${i}.angles`,'추가 각도 수')+bool(`profiles.${i}.sheet`,'각도 모음 1장 추가')+field(`profiles.${i}.savePct`,'클라우드 저장률',{unit:'%'})+select(`profiles.${i}.storageMode`,'파일 보관',[['append','새 파일 누적'],['overwrite','기존 파일 교체'],['browser-only','브라우저에만 보관']])+nullable(`profiles.${i}.originalMB`,'원본 평균 크기','MB')+nullable(`profiles.${i}.previewMB`,'미리보기 평균 크기','MB')+nullable(`profiles.${i}.replacedMB`,'교체되는 기존 파일','MB · SNS는 같은 크기 교체')+nullable(`profiles.${i}.responseFactor`,'생성 결과 전송 배수','비우면 URL응답 0 · base64 1.333')+nullable(`profiles.${i}.unitOverrideUsd`,'이미지 단가 직접 입력','비우면 코드 가격표')+nullable(`profiles.${i}.textOverrideUsd`,'글 비용 직접 입력','비우면 호출 횟수로 계산')+nullable(`profiles.${i}.proposedCharge`,'제안 최종 차감량','제안 정책에서만 사용')+nullable(`profiles.${i}.proposedRequired`,'제안 시작 잔액','제안 정책에서만 사용'))}<button data-fc-remove-profile="${i}">이 작업 삭제</button></article>`).join('');
    const stock=grid(nullable('storage.initialGB','현재 이미지 파일 저장량','GB')+nullable('storage.retentionMonths','새 파일 보관 기간','개월 · 비우면 계속 보관')+nullable('storage.initialDeleteMonth','초기 파일 삭제할 월차','비우면 유지')+nullable('storage.additionalUploadGB','추가 업로드','GB / 월')+nullable('storage.uploadPerActiveMB','활성 1인 업로드','MB / 월')+nullable('storage.orphanGBMonthly','잔여/중간 파일 증가','GB / 월')+nullable('database.initialGB','현재 DB 데이터','GB')+nullable('database.perNewMemberKB','신규 회원 메타데이터','KB / 명')+nullable('database.perJobKB','작업·시도 기록','KB / 작업')+nullable('database.logGBMonthly','DB 로그 증가','GB / 월')+nullable('database.cleanupGBMonthly','DB 정리량','GB / 월')+nullable('database.diskGB','DB 할당 디스크','GB')+field('database.headroomPct','DB 디스크 여유율',{unit:'%'})+bool('database.autoGrowDisk','DB 디스크 확대 가정'));
    const transfer=grid(nullable('transfers.viewsPerImage','보관 이미지 월 조회','회 / 이미지')+nullable('transfers.downloadsPerImage','원본 다운로드','회 / 이미지 / 월')+field('transfers.browserCachePct','브라우저 캐시 적중률',{unit:'%'})+field('transfers.cdnCachePct','Supabase CDN 적중률',{unit:'%'})+field('transfers.proxyPct','EC2 중계 조회 비율',{unit:'%'})+nullable('transfers.referenceMBPerOutput','생성당 참고 이미지 전송','MB')+field('transfers.generationResponseFactor','생성 응답 추가 배수',{unit:'기본1 · 도구별 응답 형식은 이미 반영'})+field('transfers.uploadAwsPct','Storage 업로드의 AWS 과금 비율',{unit:'%'})+nullable('transfers.otherCachedGB','다른 앱의 캐시 전송','GB / 월')+nullable('transfers.otherUncachedGB','DB·다른 앱의 일반 전송','GB / 월')+nullable('transfers.otherAwsGB','다른 AWS 전송','GB / 월')+nullable('transfers.awsFreeGB','남은 AWS 무료 송신량','GB / 월')+nullable('transfers.awsPerGB','AWS 송신 단가','USD / GB · 계약 확인'));
    const aws=grid(select('aws.region','리전',[['ap-northeast-2','서울'],['custom','다른 리전 · 직접 요금']])+select('aws.type','계산할 EC2',[['','미확인'],...draft.catalog.ec2.map(x=>[x.id,`${x.id} · ${x.ram}GiB`]),['custom','직접 입력']])+select('aws.currentType','현재 실제 EC2',[['','미확인'],...draft.catalog.ec2.map(x=>[x.id,x.id])])+field('aws.count','인스턴스 개수')+nullable('aws.hourlyUsd','직접 시간 단가','USD / 시간')+nullable('aws.monthlyUsd','직접 월 실행료','custom에서 시간 단가보다 우선')+nullable('aws.ebsGB','EBS 할당량','GB')+nullable('aws.ebsPerGB','EBS 저장 단가','USD / GB-month')+nullable('aws.ipv4Count','공인 IPv4 개수')+nullable('aws.ipv4HourlyUsd','IPv4 시간 단가','USD')+nullable('aws.cpuSurplusUsd','CPU 초과 크레딧','USD / 월')+nullable('aws.otherMonthlyUsd','AWS 기타 비용','USD / 월')+select('aws.benefit','무료 혜택',[['unknown','미확인'],['none','없음'],['credit','잔액형 크레딧'],['legacy','기존 무료 시간']])+nullable('aws.creditUsd','남은 무료 크레딧','USD')+field('aws.expiresOn','혜택 만료일',{kind:'date',nullable:true,unit:'이 날짜부터 혜택 종료'})+nullable('aws.legacyHours','기존 월 무료 시간','적격 사양인지 별도 확인')+field('aws.otherCreditUseUsd','다른 AWS 서비스의 혜택 사용','USD / 월')+bool('aws.continuePaid','혜택 종료 후 유료 지속'));
    const sb=grid(select('supabase.plan','현재 요금제',[['unknown','미확인'],['free','Free'],['pro','Pro'],['custom','직접 입력']])+select('supabase.compute','DB compute',Object.keys(draft.catalog.compute).map(x=>[x,x]))+select('supabase.transition','한도 초과 시',[['keep','현재 요금제 유지'],['upgrade','Pro 전환 가정']])+bool('supabase.spendCap','Pro 지출 상한 유지')+nullable('supabase.otherComputeUsd','다른 프로젝트 compute','USD / 월 · credit 적용 전')+nullable('supabase.otherStorageGB','다른 프로젝트 평균 파일','GB')+nullable('supabase.otherDatabaseGB','공유 DB의 다른 데이터','GB')+nullable('supabase.otherDiskUsd','다른 프로젝트 디스크 초과비','USD / 월')+nullable('supabase.otherMau','다른 앱 고유 활성 회원','명 · 중복 제외')+nullable('supabase.uniqueMau','조직 전체 고유 MAU 직접 지정','비우면 앱별 합산')+field('supabase.sharePct','이 시스템 비용 배분율',{unit:'% · 조직 청구액과 구분'})+nullable('supabase.customMonthlyUsd','직접 월 요금','USD')+nullable('supabase.addonsUsd','백업·추가 서비스','USD / 월'));
    const capacity=grid(select('aws.selection','서버 비용 기준',[['manual','입력 사양'],['recommended','추천 사양 반영']])+nullable('capacity.peakJobs','최대 동시 생성 직접 입력','비우면 활성 회원 비율 사용')+field('capacity.peakPct','활성 회원 중 동시에 생성',{unit:'%'})+nullable('capacity.baseRamGiB','웹·워커 기본 RAM','GiB')+nullable('capacity.jobRamGiB','작업당 추가 RAM','GiB')+field('capacity.maxRamPct','최대 RAM 사용률',{unit:'% · 나머지는 여유'})+select('capacity.mode','부하 입력 근거',[['assumed','가정'],['measured','실측']])+select('capacity.profileId','검증한 작업',[['','없음'],...draft.profiles.map(p=>[p.id,p.label])])+select('capacity.measuredType','검증한 사양',[['','없음'],...draft.catalog.ec2.map(x=>[x.id,x.id])])+nullable('capacity.measuredMaxJobs','검증한 동시 작업 수')+field('capacity.measuredOn','실측일',{kind:'date',nullable:true})+nullable('capacity.cpuSecondsPerJob','작업당 CPU 처리시간','초 · 외부 API 대기시간 제외')+nullable('capacity.peakJobsPerSecond','피크 초당 작업 유입','작업 / 초')+field('capacity.maxCpuPct','목표 CPU 사용률',{unit:'%'})+bool('capacity.dbValidated','같은 조건에서 DB 검증 완료'));
    const teams=draft.teams.map((t,i)=>grid(field(`teams.${i}.id`,'팀 구분',{kind:'text'})+field(`teams.${i}.monthlyQuota`,'월 팀 전체 크레딧'))).join('');
    el('fc-config').innerHTML=section('기간·판매·공통 비용',grid(field('startMonth','시작 월',{kind:'month'})+field('months','예측 기간',{unit:'1~36개월'}))+moneyInputs+`<p class="muted">직접 입력 합계와 항목별 인프라는 동시에 더하지 않습니다.</p><button data-fc-action="reprice">기존 상품 차감표로 다시 설계</button>`)+section('회원 그룹·작업 비중',groups+`<button data-fc-action="add-group">회원 그룹 추가</button>`+teams+`<button data-fc-action="add-team">공유 팀 한도 추가</button>`)+section('생성 작업·파일 크기',select('business.policy','차감 기준',[['current','기존 원가 환산'],['image-v2','새 정책 · 최종 이미지 기준'],['proposed','입력한 제안 차감표']])+profiles+`<button data-fc-action="add-profile">생성 작업 추가</button>`)+section('이미지 저장·DB 증가',stock)+section('조회·전송 비용',transfer)+section('EC2·무료 혜택',aws)+section('Supabase·공유 조직',sb)+section('추천 사양·부하 근거',capacity+'<button data-fc-action="capture-profile">현재 단일 작업 설정을 실측 근거에 연결</button>')+section('변경 일정·추가 입력',scheduleEditor()+`<p class="muted">일정은 예측 가정입니다. 실제 서버/파일을 변경하지 않습니다.</p>`);
    [...el('fc-config').children].forEach((section,i)=>section.open=Boolean(expanded[i]));if(focused){const control=el('fc-config').querySelector('[data-fc-path="'+focused+'"]');control?.focus({preventScroll:true});}
  }
  function scheduleEditor(){
    let out='<h3>EC2 변경 일정</h3>';
    out+=draft.aws.schedule.map((r,i)=>grid(field(`aws.schedule.${i}.month`,'변경 월차')+select(`aws.schedule.${i}.type`,'사양',draft.catalog.ec2.map(c=>[c.id,c.id])))+`<button data-fc-delete="aws.schedule.${i}">삭제</button>`).join('')+'<button data-fc-action="aws-schedule">일정 추가</button><h3>Supabase 변경 일정</h3>';
    out+=draft.supabase.schedule.map((r,i)=>grid(field(`supabase.schedule.${i}.month`,'변경 월차')+select(`supabase.schedule.${i}.plan`,'플랜',[['free','Free'],['pro','Pro'],['custom','직접']])+select(`supabase.schedule.${i}.compute`,'Compute',Object.keys(draft.catalog.compute).map(x=>[x,x])))+`<button data-fc-delete="supabase.schedule.${i}">삭제</button>`).join('')+'<button data-fc-action="db-schedule">일정 추가</button><h3>날짜별 파일 업로드·삭제</h3>';
    out+=draft.storage.events.map((r,i)=>grid(field(`storage.events.${i}.date`,'날짜',{kind:'date'})+field(`storage.events.${i}.addGB`,'추가 GB')+field(`storage.events.${i}.deleteGB`,'삭제 GB'))+`<button data-fc-delete="storage.events.${i}">삭제</button>`).join('')+'<button data-fc-action="storage-event">날짜 추가</button><h3>AWS 적격 크레딧 항목</h3>';
    out+=['compute','disk','ip','transfer','cpu','other'].map((key,i)=>`<label><input type="checkbox" data-fc-credit="${key}" ${draft.aws.creditEligible.includes(key)?'checked':''} style="width:auto"> ${['실행','디스크','IP','전송','CPU초과','기타'][i]}</label>`).join(' ');
    out+='<h3>AWS 전송 구간</h3>'+draft.transfers.awsTiers.map((r,i)=>grid(field(`transfers.awsTiers.${i}.upToGB`,'누적 상한 GB')+field(`transfers.awsTiers.${i}.usdPerGB`,'구간 단가 USD/GB'))+`<button data-fc-delete="transfers.awsTiers.${i}">삭제</button>`).join('')+'<button data-fc-action="transfer-tier">구간 추가</button>';
    return out;
  }
  function syncPricingCost(r,scenario){
    if(scenario.source==='current'||scenario.business.infraMode!=='itemized'||r.awsUsd===null||r.supabaseUsd===null||r.serviceability==='quota-exceeded')return;
    const amount=(r.awsUsd+r.supabaseUsd)*scenario.fx*(1+scenario.business.providerTaxPct/100)*(1+scenario.business.fxFeePct/100)+scenario.business.otherFixedKrw;
    syncing=true;
    try{
      if(scenario.source==='main'&&Math.abs(state.fixed-amount)>1e-6){state.fixed=amount;window.update();const input=document.querySelector('[data-key="fixed"]');if(input)input.value=amount;}
      if(scenario.source==='wallet'&&window.MCSWallet){const w=window.MCSWallet.read();if(Math.abs(w.fixed-amount)>1e-6){w.fixed=amount;window.MCSWallet.restore(w);}}
    }finally{syncing=false;}
  }
  function render(){
    try{
      const scenario=api.validateScenario(draft), rows=api.forecast(scenario);lastRows=rows;valid=true;
      el('fc-error').hidden=true;el('forecast-panel').classList.remove('invalid');
      renderLaunch(scenario);const r=rows[scenario.selectedMonth-1];syncPricingCost(r,scenario);const first=rows.flatMap(x=>x.transitions.map(message=>({month:x.index,message})))[0];
      const blocked=r.serviceability==='quota-exceeded';
      el('fc-origin').textContent=(scenario.example?'예시 조건 · ':'직접 입력 · ')+(r.completeness==='partial'?'아직 입력하지 않은 인프라/사용량이 있습니다. 확인한 비용만 표시합니다.':'입력한 조건으로 계산했습니다. 운영 계정 실시간 연동은 아닙니다.');
      document.querySelectorAll('[data-fc-policy]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.fcPolicy===scenario.business.policy));b.disabled=scenario.business.basis==='wallet';});
      el('fc-basis').textContent=scenario.business.basis==='wallet'?'가상 충전형 · 1크레딧=1원':scenario.business.policy==='image-v2'?'새 정책 비교 · 최종 이미지 기준':scenario.business.policy==='proposed'?'고정한 제안 차감표':'기존 원가 환산 기준';
      el('fc-title').textContent=`${number(r.registered)}명에게 제공하는 ${r.month} 예상`;
      el('fc-context').textContent=`활성 ${number(r.active)}명 · ${scenario.profiles.length}개 작업 · ${r.supabasePlan} · 단가 확인 ${scenario.catalog.checkedAt}`;
      el('fc-months').innerHTML=[...new Set([1,3,6,12,scenario.months,scenario.selectedMonth])].filter(n=>n<=scenario.months).sort((a,b)=>a-b).map(n=>`<button data-fc-month="${n}" aria-pressed="${n===scenario.selectedMonth}">${n}개월</button>`).join('');
      const a=r.allowance[0];el('fc-allowance').textContent=a?number(a.images)+'장':'—';el('fc-allowance-note').textContent=(a?.label??'')+' · 100% 사용 기준'+(r.allowance.length>1?' / 다른 그룹은 상세 참고':'');
      el('fc-images').textContent=number(r.images)+'장';el('fc-active').textContent=`완료 작업 ${number(r.jobs)}회 · 공급자 출력 ${number(r.providerOutputs,1)}장`;
      el('fc-cost-title').textContent=r.completeness==='partial'?'확인한 비용 소계':'월 예상 운영비';
      el('fc-cost').textContent=blocked?'한도 확인 필요':money(r.totalKrw??r.knownCostKrw);
      el('fc-cost-note').textContent=r.completeness==='partial'?'빠진 비용은 0원으로 처리하지 않았습니다.':`1인당 ${money(r.costPerMemberKrw)} · 생성 1장당 ${money(r.costPerImageKrw)}`;
      el('fc-profit').textContent=money(r.profitKrw);el('fc-profit').className=r.profitKrw===null?'':r.profitKrw<0?'fc-loss':'fc-positive';
      el('fc-profit-note').textContent=r.profitKrw===null?'빠진 비용/요금 한도를 확인하세요.':`순매출 ${money(r.netSalesKrw)} − PG ${money(r.paymentFeeKrw)} − 운영비`;
      el('fc-breakdown').innerHTML=`<span>AI API <strong>${money(r.apiUsd*scenario.fx)}</strong></span><span>AWS <strong>${money(r.awsUsd===null?null:r.awsUsd*scenario.fx)}</strong></span><span>Supabase 배분 <strong>${money(r.supabaseUsd===null?null:r.supabaseUsd*scenario.fx)}</strong></span><span>누적 <strong>${money(r.cumulativeKrw)}</strong></span>${scenario.business.basis==='wallet'?`<span>미사용 충전금 <strong>${money(r.walletUnspentKrw)}</strong></span>`:''}${scenario.business.infraMode==='manual-total'?'<span>실제 손익에는 직접 입력 인프라 합계만 사용</span>':''}`;
      const rec=r.recommendation;
      el('fc-confidence').textContent={ 'assumption-based':'가정 기반 추천','measurement-based':'입력한 실측 범위','insufficient-profile':'추가 검토 필요'}[rec.status];
      el('fc-server').textContent=rec.ec2Type??'추천 범위 초과';el('fc-load').textContent=`동시 ${number(rec.peakJobs)}건 · 필요 RAM ${number(rec.requiredRamGiB,2)}GiB`;
      el('fc-db-plan').textContent=r.supabasePlan+' · '+r.supabaseCompute;el('fc-db-note').textContent=rec.dbValidated?'입력한 DB 검증 조건 사용':'DB 처리 성능 검증 전 · 저장/전송 한도와 구분';
      el('fc-selection').value=scenario.aws.selection;el('fc-selection-note').textContent=`현재 계산: ${r.awsType??'사양 미확인'} · CPU 적합성 ${rec.cpuValidated?'입력 검증':'추가 확인'}`;
      el('fc-normal').textContent=money(r.normalCostKrw);el('fc-stock').textContent=number(rows.at(-1).storageEndGB,2)+' GB';el('fc-stock-note').textContent=`${scenario.months}개월차 · 이번 달 평균 ${number(r.storageAverageGB,2)}GB`;
      el('fc-next').textContent=first?`${first.month}개월차`:'예측 기간 내 변화 없음';el('fc-next-note').textContent=first?.message??'한도·실측 정보를 채우면 판단을 보완할 수 있습니다.';
      el('fc-comparison').innerHTML=scenario.groups.length!==1?'<tr><td colspan="5">혼합 그룹은 상세에서 인원을 조정해 비교하세요.</td></tr>':[100,500,1000].map(n=>{const c=copy(scenario);c.groups[0].members=n;c.groups[0].monthlyMembers=null;const v=api.forecast(c)[scenario.selectedMonth-1];return `<tr><th><button data-fc-members="${n}">${number(n)}명</button></th><td>${number(v.images)}장</td><td>${v.serviceability==='quota-exceeded'?'한도 확인':money(v.totalKrw)}</td><td>${money(v.profitKrw)}</td><td>${esc(v.recommendation.ec2Type??'추가 검토')}</td></tr>`;}).join('');
      const max=Math.max(1,...rows.map(x=>x.totalKrw??x.knownCostKrw));el('fc-chart').innerHTML=rows.map(x=>`<button data-fc-month="${x.index}" aria-pressed="${x.index===scenario.selectedMonth}" aria-label="${x.month} ${x.totalKrw===null?'부분 계산':money(x.totalKrw)}"><i style="height:${Math.max(2,(x.totalKrw??x.knownCostKrw)/max*140)}px;opacity:${x.completeness==='partial'?.4:1}"></i>${x.index}월</button>`).join('');
      el('fc-table').innerHTML=rows.map(x=>`<tr class="${x.index===scenario.selectedMonth?'selected':''}"><th>${x.month}</th><td>${number(x.registered)} / ${number(x.active)}</td><td>${number(x.images)} / ${number(x.providerOutputs,1)}</td><td>${number(x.storageEndGB,2)} / ${number(x.storageAverageGB,2)}</td><td>${number(x.dbUsedGB,3)}</td><td>${number(x.awsGB,2)}</td><td>${esc(x.supabasePlan)} / ${esc(x.awsType??'미확인')}</td><td>${money(x.totalKrw)}</td><td>${money(x.cumulativeKrw)}</td><td>${x.serviceability==='quota-exceeded'?'한도 초과':x.completeness==='partial'?'미입력 있음':'입력 범위 내'}</td></tr>`).join('');
      el('fc-lines').innerHTML=r.costLines.map(x=>`<div class="fc-line"><span>${esc(x.label)}${x.benefitUsd>0?` (혜택 −$${number(x.benefitUsd,2)})`:''}</span><strong>${x.payableUsd===null?'미입력':'$'+number(x.payableUsd,4)}</strong></div>`).join('')+`<p class="muted">조직 Supabase 예상 청구액 $${number(r.supabaseAccountUsd,2)}, 이 서비스 배분 ${scenario.supabase.sharePct}%. 원화 합계에는 설정한 세금·해외결제·기타 비용을 반영합니다.</p>`;
      el('fc-warnings').innerHTML=[...new Set([...r.warnings,...rec.warnings])].map(w=>`<li>${esc(w)}</li>`).join('');
      el('fc-evidence').innerHTML=`<p class="fc-evidence">가격표 ${esc(scenario.catalog.version)} · ${scenario.catalog.checkedAt}</p>`+scenario.catalog.sources.map(x=>`<p class="fc-evidence"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a></p>`).join('')+Object.entries(scenario.evidence).map(([path,e])=>`<p class="fc-evidence">${esc(path)} · ${esc(e.kind)} · ${esc(e.source)} ${esc(e.checkedAt??'')}</p>`).join('');
      const g=scenario.groups[0];let matched=false;document.querySelectorAll('[data-fc-preset]').forEach(b=>{const p=presets[b.dataset.fcPreset],on=scenario.groups.length===1&&g.activePct===p[0]&&g.utilPct===p[1];b.setAttribute('aria-pressed',String(on));matched||=on;});el('fc-custom').hidden=matched;
      el('fc-preset-note').textContent=scenario.groups.length===1?`사용 가정: 회원 ${g.activePct}%가 이용하고, 이용자는 크레딧 ${g.utilPct}%를 사용합니다.`:'그룹별 활성률·소진율을 적용합니다.';
      el('fc-live').textContent=`${r.month} 결과 갱신. ${number(r.images)}장. ${r.completeness==='partial'?'빠진 비용 있음':money(r.totalKrw)}.`;
      // Fields duplicated in the compact header and detailed form share one draft, but keep the caret.
      document.querySelectorAll('[data-fc-path]').forEach(input=>{if(input!==document.activeElement){const value=get(draft,input.dataset.fcPath);input.value=value??'';}});
    }catch(err){error(err);}
  }
  function launchField(path,label,{kind='number',max=1e9,min=0,unit=''}={}){
    const value=get(launch,path),id='launch-'+path.replaceAll('.','-');
    return `<label class="fc-field" for="${id}"><span>${esc(label)}</span><input id="${id}" type="${kind}" data-launch-path="${path}" data-launch-kind="${kind}" value="${esc(value)}" min="${min}" max="${max}" step="any">${unit?`<small class="muted">${esc(unit)}</small>`:''}</label>`;
  }
  function hydrateLaunch(){
    el('fc-launch-inputs').innerHTML=`<div class="fc-main-inputs">${launchField('targetMarginPct','목표 전체 예산 마진 (%)',{max:95})}<label class="fc-field"><span>수수료 기준</span><select data-launch-path="feeMode" data-launch-kind="text"><option value="assumed-total" ${launch.feeMode==='assumed-total'?'selected':''}>사용자 가정 · 총 15% (조정 가능)</option><option value="official-cash" ${launch.feeMode==='official-cash'?'selected':''}>공식 국내 기본 · 16.5% + 108,900원</option></select></label><label class="fc-field"><span>크레딧 차감 기준</span><select data-launch-path="policy" data-launch-kind="text"><option value="image-v2" ${launch.policy==='image-v2'?'selected':''}>새 정책 · 일반 이미지 1장=1개</option><option value="cost-v1" ${launch.policy==='cost-v1'?'selected':''}>기존 원가 환산</option></select></label></div>
      <div class="fc-table"><table><thead><tr><th>상품</th><th>판매가</th><th>기본 크레딧</th><th>보너스 %</th><th>예상 구매자</th><th>운영비 적립 개월</th></tr></thead><tbody>${launch.plans.map((p,i)=>`<tr><th>${esc(p.name)}<small style="display:block" class="muted">${p.type==='subscription'?'월 제공 · 이월 없음':'단건 구매 · 이월 / 가격은 비교용'}</small></th><td>${launchField(`plans.${i}.priceKrw`,'판매가 (원)',{min:1,max:1e7})}</td><td>${launchField(`plans.${i}.baseCredits`,'기본 제공량',{min:1,max:1e6})}</td><td>${launchField(`plans.${i}.bonusPct`,'추가 제공률',{max:200})}</td><td>${launchField(`plans.${i}.buyers`,'구매자 수',{max:1e6})}</td><td>${launchField(`plans.${i}.reserveMonths`,'운영비 적립 기간',{min:1,max:36})}</td></tr>`).join('')}</tbody></table></div>
      <div class="fc-main-inputs">${launchField('feePct','총 수수료율 가정 (%)',{max:50})}${launchField('projectFeeKrw','프로젝트 기본료 가정 (원)')}${launchField('adBudgetKrw','모집 광고·경품 현금 예산 (원)')}${launchField('eventRecipients','추가 무료 체험자 (명)',{unit:'구매자와 중복되는 인원 제외'})}${launchField('eventCredits','체험자 1인당 무료 크레딧',{max:1e6})}</div>
      <p class="muted">기본안: 베이직 10만원·115개, 프리미엄 20만원·230개. 두 상품의 크레딧당 판매가는 같습니다. 프리미엄 보너스나 제공량을 바꾸어 비교하세요. 구매형의 적립 기간은 실제 유효기간 설정을 바꾸지 않습니다.</p>`;
    el('fc-launch').open=launchOpen;
  }
  function renderLaunch(scenario){
    try{
      const result=api.compareLaunchPlans(launch,scenario);el('fc-launch-error').hidden=true;
      el('fc-launch-results').innerHTML=`<h2>전량 소진하면 30%가 남을까요?</h2><p class="muted">부가세 제외 매출 기준 · 입력한 첫 회원 그룹의 작업 구성 · 기본료는 ${number(result.buyers)}건에 배분 · 채널 공제 ${number(result.effectiveFeePct,1)}%</p><div class="fc-table"><table><thead><tr><th>상품</th><th>총 크레딧 / 생성</th><th>API 비용</th><th>운영비 적립</th><th>모집·기본료 배분</th><th>예산 마진</th><th>목표 ${number(launch.targetMarginPct)}%</th></tr></thead><tbody>${result.results.map(p=>`<tr><th>${esc(p.name)}</th><td>${number(p.issuedCredits)}개 / ${number(p.images)}장</td><td>${money(p.apiKrw)}</td><td>${money(p.infraReserveKrw)}</td><td>${money(p.eventPerSaleKrw)}</td><td>${p.marginPct===null?'미확정':number(p.marginPct,1)+'%'}</td><td>${p.meetsTarget===null?'운영 정보 필요':p.meetsTarget?'가정 내 충족':'미달'}</td></tr>`).join('')}</tbody></table></div>
      <p>목표 마진을 지키며 API·운영·이벤트에 쓸 수 있는 예산: ${result.results.map(p=>`${esc(p.name)} ${money(p.operatingBudgetKrw)}`).join(' / ')}</p>
      <p class="muted">무료 이벤트 예상 ${number(result.eventImages)}장 · API ${money(result.eventApiKrw)}. 상단의 현재 회원 조건과 달리 이 표는 상품별 구매자 모두가 보너스까지 소진하는 조건입니다.</p><details><summary>계산 범위·수수료 근거</summary><ul>${result.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul><a href="https://helpcenter.wadiz.io/hc/ko/articles/25375315142169" target="_blank" rel="noopener">와디즈 공식 요금제 안내</a></details>`;
    }catch(err){el('fc-launch-error').hidden=false;el('fc-launch-error').textContent=err instanceof Error?err.message:String(err);el('fc-launch-results').innerHTML='';}
  }
  document.addEventListener('input',e=>{const t=e.target,path=t.dataset.launchPath;if(!path)return;put(launch,path,t.dataset.launchKind==='number'?(t.value===''?NaN:Number(t.value)):t.value);clearTimeout(timer);timer=setTimeout(()=>{try{renderLaunch(api.validateScenario(draft));}catch(err){error(err);}},150);});
  el('fc-launch').addEventListener('toggle',()=>{launchOpen=el('fc-launch').open;});
  function hydrate(){mainInputs();configurations();hydrateLaunch();el('fc-details').open=detailsOpen;render();}
  function changed(path){remember(path);if(draft.source!=='current')updateLegacyFrom(path);clearTimeout(timer);timer=setTimeout(render,150);}
  document.addEventListener('input',e=>{
    const t=e.target,path=t.dataset.fcPath;
    if(path==='source'){try{switchSource(t.value);}catch(err){error(err);}return;}
    if(path){let value=t.value;if(t.dataset.fcKind==='number')value=value===''?(t.dataset.fcNullable?null:NaN):Number(value);if(t.dataset.fcKind==='boolean')value=value==='true';if(['aws.type','aws.currentType','capacity.profileId','capacity.measuredType'].includes(path)||path.endsWith('.team')||t.dataset.fcNullable)value=value===''?null:value;put(draft,path,value);changed(path);}
    if(t.dataset.fcList){const v=t.value.trim();put(draft,t.dataset.fcList,v?v.split(',').map(x=>Number(x.trim())):null);changed(t.dataset.fcList);}
    if(t.dataset.fcMix){const g=draft.groups[Number(t.dataset.fcMix)],key=t.dataset.fcWork;g.workMix=g.workMix.filter(x=>x.id!==key);g.workMix.push({id:key,weight:t.value===''?NaN:Number(t.value)});changed(`groups.${t.dataset.fcMix}.workMix`);}
  });
  document.addEventListener('change',e=>{
    const t=e.target,path=t.dataset.fcPath;
    if(path==='source')return;
    if(t.dataset.fcCredit){draft.aws.creditEligible=t.checked?[...new Set([...draft.aws.creditEligible,t.dataset.fcCredit])]:draft.aws.creditEligible.filter(x=>x!==t.dataset.fcCredit);changed('aws.creditEligible');}
    if(path&&t.tagName==='SELECT'){if(path.match(/^profiles\.\d+\.kind$/)){const i=Number(path.split('.')[1]),p=draft.profiles[i];p.images=1;p.storageMode=p.kind==='sns'?'overwrite':'append';if(p.kind.startsWith('redesign'))p.model='redesign-openai';else if(p.model.startsWith('redesign'))p.model='gpt-image-2.5-flare';}configurations();render();}
    if(path==='months'&&Number.isFinite(draft.months)){draft.selectedMonth=Math.min(draft.selectedMonth,draft.months);render();}
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    try{
      if(b.dataset.fcPolicy){draft.business.policy=b.dataset.fcPolicy;render();}
      if(b.dataset.fcMonth){draft.selectedMonth=Number(b.dataset.fcMonth);render();}
      if(b.dataset.fcMembers){draft.groups[0].members=Number(b.dataset.fcMembers);draft.groups[0].monthlyMembers=null;updateLegacyFrom('groups.0.members');render();}
      if(b.dataset.fcPreset){const p=presets[b.dataset.fcPreset];draft.groups.forEach(g=>{g.activePct=p[0];g.utilPct=p[1];});updateLegacyFrom('groups.0.utilPct');render();}
      if(b.dataset.fcRemoveGroup!==undefined){if(draft.groups.length<=1)throw Error('회원 그룹은 하나 이상 필요합니다.');draft.groups.splice(Number(b.dataset.fcRemoveGroup),1);draft.source='current';hydrate();}
      if(b.dataset.fcRemoveProfile!==undefined){if(draft.profiles.length<=1)throw Error('작업은 하나 이상 필요합니다.');const [p]=draft.profiles.splice(Number(b.dataset.fcRemoveProfile),1);draft.groups.forEach(g=>g.workMix=g.workMix.filter(x=>x.id!==p.id));draft.source='current';hydrate();}
      if(b.dataset.fcDelete){const parts=b.dataset.fcDelete.split('.'),i=Number(parts.pop());get(draft,parts.join('.')).splice(i,1);configurations();render();}
      const action=b.dataset.fcAction;
      if(action==='capture-profile'){if(draft.profiles.length!==1)throw Error('실측은 한 작업 프로필일 때 연결하세요.');draft.capacity.profileId=draft.profiles[0].id;draft.capacity.profileSignature=JSON.stringify(draft.profiles[0]);configurations();render();}
      if(action==='groups'){el('fc-details').open=true;const section=el('fc-config').children[1];section.open=true;section.scrollIntoView({block:'start',behavior:'smooth'});}
      const unique=prefix=>prefix+'-'+Date.now().toString(36);
      if(action==='add-group'){if(draft.groups.length>=20)throw Error('그룹은 최대20개입니다.');draft.groups.push({...copy(api.createScenario(true).groups[0]),id:unique('group'),label:'추가 회원',workMix:[{id:draft.profiles[0].id,weight:100}]});draft.source='current';hydrate();}
      if(action==='add-profile'){if(draft.profiles.length>=20)throw Error('작업은 최대20개입니다.');draft.profiles.push({...copy(api.createScenario(true).profiles[0]),id:unique('work'),label:'추가 작업'});draft.source='current';hydrate();}
      if(action==='add-team'){draft.teams.push({id:unique('team'),monthlyQuota:10000});configurations();}
      if(action==='aws-schedule'){draft.aws.schedule.push({month:3,type:'t3.medium'});configurations();}
      if(action==='db-schedule'){draft.supabase.schedule.push({month:3,plan:'pro',compute:'micro'});configurations();}
      if(action==='storage-event'){draft.storage.events.push({date:draft.startMonth+'-01',addGB:0,deleteGB:0});configurations();}
      if(action==='transfer-tier'){draft.transfers.awsTiers.push({upToGB:1000,usdPerGB:.126});configurations();}
      if(action==='reprice'){if(draft.source!=='current'){const mode=draft.business.infraMode,manual=draft.business.manualInfraKrw,active=draft.groups[0].activePct;if(draft.source==='main'&&state.policy==='protected'){delete state.lockedPlan;freezePlan(state);}sourceProjection(draft.source,true);draft.business.infraMode=mode;draft.business.manualInfraKrw=manual;draft.groups[0].activePct=active;hydrate();}else error(Error('기존 정액제 상품을 선택한 뒤 차감표를 가져오세요.'));}
    }catch(err){error(err);}
  });
  el('fc-details').addEventListener('toggle',()=>{detailsOpen=el('fc-details').open;});
  el('fc-selection').addEventListener('change',e=>{draft.aws.selection=e.target.value;changed('aws.selection');render();});
  el('fc-example').onclick=()=>{products={};draft=api.createScenario(true);hydrate();};
  el('fc-empty').onclick=()=>{products={};draft=api.createScenario(false);hydrate();el('fc-details').open=true;};
  const downloadJson=()=>{const s=api.validateScenario(draft);download('MCS-운영비-설정.json',JSON.stringify({schema:'mcs-forecast-config',version:1,scenario:s,launch:api.validateLaunchStrategy(launch)},null,2),'application/json');};
  el('fc-export').onclick=()=>{try{downloadJson();}catch(err){error(err);}};
  el('fc-import').onclick=()=>el('fc-file').click();
  el('fc-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>262144)throw Error('설정 파일은 256KB 이하여야 합니다.');const parsed=JSON.parse(await file.text());if(parsed.schema==='mcs-cost-lab'){restoreSession(parsed);window.hydrate();hydrate();showTab(restoredView);return;}const wrapped=parsed.schema==='mcs-forecast-config';if(wrapped&&parsed.version!==1)throw Error('지원하지 않는 설정 버전입니다.');const next=api.validateScenario(wrapped?parsed.scenario:parsed);const nextLaunch=wrapped?api.validateLaunchStrategy(parsed.launch):launch;draft=next;launch=nextLaunch;hydrate();}catch(err){error(err);}finally{e.target.value='';}};
  el('fc-upgrade-prices').onclick=()=>{draft.catalog=copy(api.CURRENT_CATALOG);hydrate();};
  window.MCSForecastController={
    read:()=>api.validateScenario(draft),
    ui:()=>({detailsOpen,products:copy(products),launch:api.validateLaunchStrategy(launch),launchOpen}),
    restoreLegacy:view=>{products={};draft=api.createScenario(false);sourceProjection(view==='wallet'?'wallet':'main',true);hydrate();},
    restore:(raw,ui)=>{const next=api.validateScenario(raw),savedProducts=validateProducts(ui?.products,next);const nextLaunch=ui?.launch?api.validateLaunchStrategy(ui.launch):api.createLaunchStrategy();launch=nextLaunch;launchOpen=Boolean(ui?.launchOpen);draft=next;products=savedProducts;detailsOpen=Boolean(ui?.detailsOpen);hydrate();},
    legacyChanged:source=>{if(syncing||draft.source!==source)return;sourceProjection(source,false);clearTimeout(timer);timer=setTimeout(()=>{mainInputs();render();},100);},
    result:()=>copy(lastRows),
  };
  if(typeof pendingForecast!=='undefined'&&pendingForecast){try{draft=api.validateScenario(pendingForecast);detailsOpen=Boolean(pendingForecastUi?.detailsOpen);products=validateProducts(pendingForecastUi?.products,draft);launch=pendingForecastUi?.launch?api.validateLaunchStrategy(pendingForecastUi.launch):api.createLaunchStrategy();launchOpen=Boolean(pendingForecastUi?.launchOpen);}catch(err){error(err);}}
  else if(typeof hasRestoredSession!=='undefined'&&hasRestoredSession){sourceProjection(currentView==='wallet'?'wallet':'main',true);}
  hydrate();
})();
