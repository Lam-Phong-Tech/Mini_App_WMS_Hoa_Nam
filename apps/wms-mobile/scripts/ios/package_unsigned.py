"""Validate and package an actual unsigned arm64 iphoneos application."""
from pathlib import Path
import hashlib, json, os, plistlib, stat, struct, zipfile

EXPECTED_BUNDLE_ID='vn.info.lptech.wmshoanam'

def inspect_app(app):
    app=Path(app).resolve()
    if not app.is_dir() or app.suffix!='.app':raise ValueError('Missing .app directory')
    info=plistlib.loads((app/'Info.plist').read_bytes())
    if info.get('CFBundleIdentifier')!=EXPECTED_BUNDLE_ID or info.get('DTPlatformName')!='iphoneos':raise ValueError('Wrong bundle ID/platform')
    name=info.get('CFBundleExecutable')
    if not isinstance(name,str) or Path(name).name!=name:raise ValueError('Invalid executable path')
    binary=app/name;raw=binary.read_bytes()
    if len(raw)<32:raise ValueError('Missing Mach-O header')
    magic,cpu,sub,filetype,ncmds,sizeofcmds,flags,reserved=struct.unpack_from('<IiiIIIII',raw)
    if magic!=0xfeedfacf or cpu!=0x0100000c or filetype!=2:raise ValueError('Expected arm64 executable Mach-O')
    if sizeofcmds>len(raw)-32:raise ValueError('Truncated load commands')
    offset=32;platform=None
    for _ in range(ncmds):
        if offset+8>32+sizeofcmds:raise ValueError('Truncated load command')
        cmd,size=struct.unpack_from('<II',raw,offset)
        if size<8 or offset+size>32+sizeofcmds:raise ValueError('Invalid load command')
        if cmd==0x32:
            if size<24:raise ValueError('Invalid build version')
            platform=struct.unpack_from('<I',raw,offset+8)[0]
        if cmd==0x1d and size>=16 and struct.unpack_from('<I',raw,offset+12)[0]!=0:raise ValueError('Executable still has a code signature')
        if cmd in [0x21,0x2c] and size>=20 and struct.unpack_from('<I',raw,offset+16)[0]!=0:raise ValueError('Encrypted executable is not a build output')
        offset+=size
    if platform!=2:raise ValueError('Expected device iOS, not simulator/Catalyst')
    if os.name=='posix' and not binary.stat().st_mode&0o111:raise ValueError('Executable permission missing')
    bundle=app/'main.jsbundle'
    if not bundle.is_file() or not bundle.stat().st_size:raise ValueError('Standalone React Native bundle missing')
    for p in app.rglob('*'):
        if not p.resolve().is_relative_to(app):raise ValueError('App has a symlink escaping its bundle')
        if p.name in ['_CodeSignature','embedded.mobileprovision']:raise ValueError('Output is not unsigned')
    return {'bundle_id':EXPECTED_BUNDLE_ID,'app_name':app.name,'executable':name,'platform':'iphoneos','architecture':'arm64','minimum_ios':info.get('MinimumOSVersion'),'version':info.get('CFBundleShortVersionString'),'build':info.get('CFBundleVersion'),'executable_sha256':hashlib.sha256(raw).hexdigest(),'js_bundle_sha256':hashlib.sha256(bundle.read_bytes()).hexdigest(),'unsigned':True}

def package_ipa(app,output):
    app=Path(app).resolve();output=Path(output);result=inspect_app(app)
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
        for p in sorted(app.rglob('*')):
            if not p.is_file():continue
            relative=Path('Payload')/app.name/p.relative_to(app)
            entry=zipfile.ZipInfo.from_file(p,str(relative).replace('\\','/'))
            entry.create_system=3
            mode=p.stat().st_mode if os.name=='posix' else stat.S_IFREG|0o644
            if p==app/result['executable']:mode=stat.S_IFREG|0o755
            entry.external_attr=(mode&0xffff)<<16
            entry.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(entry,p.read_bytes())
    with zipfile.ZipFile(output) as z:
        if z.testzip() is not None:raise ValueError('ZIP CRC failed')
        if not z.getinfo('Payload/'+app.name+'/'+result['executable']).external_attr>>16&0o111:raise ValueError('ZIP lost executable mode')
    return {**result,'ipa_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'ipa_bytes':output.stat().st_size,'zip_crc':'PASS'}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('app');p.add_argument('ipa');p.add_argument('--source-sha',required=True);args=p.parse_args()
    report=package_ipa(args.app,args.ipa);report['source_sha']=args.source_sha
    Path(args.ipa).with_suffix('.manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
