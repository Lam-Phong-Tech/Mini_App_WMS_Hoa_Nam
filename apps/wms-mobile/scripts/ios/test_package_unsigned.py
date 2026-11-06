import unittest, tempfile, plistlib, struct, pathlib, zipfile
try:
    from package_unsigned import inspect_app, package_ipa
except ImportError:
    inspect_app = package_ipa = None

class UnsignedIPATests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(inspect_app), 'IPA inspector has not been implemented')
        self.temp=tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root=pathlib.Path(self.temp.name);self.app=self.root/'WmsMobile.app';self.app.mkdir()
        self.info={'CFBundleIdentifier':'vn.info.lptech.wmshoanam','CFBundleExecutable':'WmsMobile','CFBundlePackageType':'APPL','DTPlatformName':'iphoneos','MinimumOSVersion':'15.1'}
        (self.app/'Info.plist').write_bytes(plistlib.dumps(self.info))
        self.binary(2)
        (self.app/'main.jsbundle').write_bytes(b'UNIT-TEST-FIXTURE-NOT-AN-APP-BUNDLE')
    def binary(self,platform):
        blob=struct.pack('<IiiIIIII',0xfeedfacf,0x0100000c,0,2,1,24,0,0)+struct.pack('<IIIIII',0x32,24,platform,0x000f0100,0x001a0000,0)
        p=self.app/'WmsMobile';p.write_bytes(blob);p.chmod(0o755)
    def test_packages_only_payload_device_app_and_preserves_executable(self):
        out=self.root/'output.ipa';result=package_ipa(self.app,out)
        self.assertEqual(result['platform'],'iphoneos')
        with zipfile.ZipFile(out) as z:
            self.assertIn('Payload/WmsMobile.app/WmsMobile',z.namelist())
            self.assertTrue(z.getinfo('Payload/WmsMobile.app/WmsMobile').external_attr>>16&0o111)
            self.assertIsNone(z.testzip())
    def test_simulator_arm64_is_not_accepted_as_iphoneos(self):
        self.binary(7)
        with self.assertRaises(ValueError):inspect_app(self.app)
    def test_wrong_bundle_identifier_is_rejected(self):
        self.info['CFBundleIdentifier']='example.other.app';(self.app/'Info.plist').write_bytes(plistlib.dumps(self.info))
        with self.assertRaises(ValueError):inspect_app(self.app)
    def test_signed_app_is_not_labelled_unsigned(self):
        (self.app/'_CodeSignature').mkdir()
        with self.assertRaises(ValueError):inspect_app(self.app)
    def test_provisioning_profile_is_not_packaged_for_unsigned_output(self):
        (self.app/'embedded.mobileprovision').write_bytes(b'UNIT-TEST-FIXTURE')
        with self.assertRaises(ValueError):inspect_app(self.app)
    def test_missing_react_bundle_is_not_accepted(self):
        (self.app/'main.jsbundle').unlink()
        with self.assertRaises(ValueError):inspect_app(self.app)
    def test_app_path_escape_is_rejected(self):
        outside=self.root/'outside';outside.write_text('UNIT TEST')
        try:(self.app/'escape').symlink_to(outside)
        except OSError:self.skipTest('Host cannot create symlinks')
        with self.assertRaises(ValueError):inspect_app(self.app)

if __name__=='__main__':unittest.main()
