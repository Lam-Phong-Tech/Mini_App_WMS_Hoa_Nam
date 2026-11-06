import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as ts from 'typescript';

const root=path.resolve(__dirname,'../src');
const frozenExceptions:Record<string,string>={
  // Historical BEFORE view, kept byte-for-byte for future comparisons.
  'features/profile/local/P10BeforeSnapshot.tsx':'4e35e841e55d407bea9c78c37c5f5531f14459c6e382c8fddd92fc6fed798b5a',
  // Approved carton artwork, not a control glyph or product/stock evidence.
  'ui/ProductPlaceholder.tsx':'8c573022117c5c6875ff3ae2f4f6af7139b69405e86ef85e1eea122eefd503dc',
};

test('current product presenters take color paints from semantic tokens',()=>{
  const violations:Array<{file:string;line:number;paint:string}>=[];
  function walk(dir:string):void{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const target=path.join(dir,entry.name),file=path.relative(root,target).replaceAll('\\','/');
    if(entry.isDirectory()){walk(target);continue;}
    if(!/\.[jt]sx?$/.test(file)||! /^(features|ui|app|errors|navigation)\//.test(file)||file.startsWith('ui/kitIcon'))continue;
    const bytes=fs.readFileSync(target);
    if(frozenExceptions[file]){expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(frozenExceptions[file]);continue;}
    const source=ts.createSourceFile(file,bytes.toString('utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    function visit(node:ts.Node):void{
      if(ts.isStringLiteralLike(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)){
        const value=node.text.replace(/url\(#[^)]+\)/g,'');
        const paints=value.match(/#[\da-f]{3,8}\b|rgba?\([\d\s.,]+\)|hsla?\([\d\s.,%]+\)/ig);
        if(paints)for(const paint of paints)violations.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,paint});
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }}
  walk(root);
  expect(violations).toEqual([]);
});
