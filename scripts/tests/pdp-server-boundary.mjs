import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const root=fileURLToPath(new URL("../../",import.meta.url));
const baseline=process.env.PDP_GENERATION_BASELINE??path.resolve(root,"../pdp-remediation");
const ts=createRequire(new URL("../../apps/web/package.json",import.meta.url))("typescript");
const read=async(base,file)=>(await readFile(path.join(base,file),"utf8")).replaceAll("\r\n","\n");
const files=[
  "apps/web/app/create/TextModeFlow.tsx","apps/web/app/create/analyze-request.ts","apps/web/app/create/page-wire.ts",
  "apps/web/app/api/pdp/analyze/route.ts","apps/web/app/api/pdp/analyze/progress/route.ts",
  "apps/web/app/api/pdp/plan-from-text/route.ts","apps/web/app/api/pdp/key-visual/route.ts",
  "apps/web/app/api/pdp/images/route.ts","apps/web/app/api/pdp/images/batch/route.ts","apps/web/app/api/pdp/library-sync/route.ts",
  "apps/web/lib/pdp/request.ts","packages/pdp-core/src/pdp.service.ts",
];
for(const file of files)assert.equal(await read(root,file),await read(baseline,file),file+" changed after generation gate");
let checked=0;
for(const [file,names] of [
  ["apps/web/app/create/PdpMakerClient.tsx",["handleAnalyze","handleTextModeComplete"]],
  ["apps/web/app/create/PdpEditor.tsx",["generateSectionImage","handleGenerateImage","handleGenerateAllMissing","pageWire","librarySyncFields"]],
]){
  function declarations(source){
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found=new Map();
    function visit(node){
      if(ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast)) && node.initializer)found.set(node.name.getText(ast),node.initializer.getText(ast));
      ts.forEachChild(node,visit);
    }visit(ast);return found;
  }
  const old=declarations(await read(baseline,file)),current=declarations(await read(root,file));
  for(const name of names){assert.ok(old.has(name));assert.equal(current.get(name),old.get(name),file+":"+name);checked++;}
}
console.log(JSON.stringify({baseline,unchangedFiles:files.length,unchangedFunctions:checked,changedLinesInProtectedCode:0},null,2));
