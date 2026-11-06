require 'xcodeproj'
require 'pathname'
require 'digest'

ios=File.expand_path('../../ios',__dir__)
project=Xcodeproj::Project.open(File.join(ios,'WmsMobile.xcodeproj'))
target=project.targets.find { |t| t.name=='WmsMobile' }
abort 'WmsMobile target not found' unless target
app_group=project.main_group.find_subpath('WmsMobile',false)
native_group=app_group.find_subpath('Native',true);native_group.path='Native'
native_root=File.join(ios,'WmsMobile','Native')
Dir.glob(File.join(native_root,'**','*.{swift,m}')).sort.each do |file|
  relative=Pathname.new(file).relative_path_from(Pathname.new(native_root)).to_s
  next if relative.split('/').any? { |p| ['Tests','.build','.swiftpm'].include?(p) } || File.basename(file)=='Package.swift'
  ref=native_group.files.find { |r| r.path==relative } || native_group.new_file(relative)
  target.source_build_phase.add_file_reference(ref,true)
end
font_group=project.main_group.find_subpath('WmsFonts',true);font_group.path='../assets'
assets=File.expand_path('../assets',ios);fonts={}
Dir.glob(File.join(assets,'**','*.{ttf,otf}')).sort.each do |file|
  name=File.basename(file);next if fonts.key?(name)
  relative=Pathname.new(file).relative_path_from(Pathname.new(assets)).to_s
  ref=font_group.files.find { |r| r.path==relative } || font_group.new_file(relative)
  target.resources_build_phase.add_file_reference(ref,true);fonts[name]=Digest::SHA256.file(file).hexdigest
end
info_path=File.join(ios,'WmsMobile','Info.plist');info=Xcodeproj::Plist.read_from_path(info_path)
info['CFBundleDisplayName']='Hoa Nam Scanner'
info['NSCameraUsageDescription']='Ứng dụng dùng camera để quét mã sản phẩm trong kho.'
info['NSPhotoLibraryUsageDescription']='Chọn ảnh để đính kèm hồ sơ kiểm thử.'
info['NSPhotoLibraryAddUsageDescription']='Lưu ảnh và tài liệu bạn đã chọn.'
info['NFCReaderUsageDescription']='Đọc và xác minh đúng thẻ NFC bạn chọn cho nghiệp vụ kho.'
info.delete('NSLocationWhenInUseUsageDescription')
info['UIAppFonts']=fonts.keys.sort
Xcodeproj::Plist.write_to_path(info,info_path)
target.build_configurations.each do |c|
  c.build_settings['PRODUCT_BUNDLE_IDENTIFIER']='vn.info.lptech.wmshoanam'
  c.build_settings['CODE_SIGNING_ALLOWED']='NO'
  c.build_settings['CODE_SIGNING_REQUIRED']='NO'
  c.build_settings['SWIFT_VERSION']='5.0'
  c.build_settings['SWIFT_STRICT_CONCURRENCY']='minimal'
end
project.save
puts "Registered native sources and #{fonts.size} fonts"
