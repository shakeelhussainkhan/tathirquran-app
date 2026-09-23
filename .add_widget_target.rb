
require 'xcodeproj'

project_path = Dir.glob("/Users/shakeelkhan/tathirquran-app/ios/*.xcodeproj").first
abort "No xcodeproj found in /Users/shakeelkhan/tathirquran-app/ios" unless project_path

project = Xcodeproj::Project.open(project_path)

# Skip if widget target already exists
if project.targets.any? { |t| t.name == 'TathirQuranWidget' }
  puts "Widget target already present, skipping"
  exit 0
end

main_target = project.targets.find { |t| t.product_type == 'com.apple.product-type.application' }
abort "Main app target not found" unless main_target
puts "Main target: #{main_target.name}"

widget_target = project.new_target(:app_extension, 'TathirQuranWidget', :ios, '16.0')

widget_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME']               = 'TathirQuranWidget'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER']  = 'com.fivesllc.tathirquran.widget'
  config.build_settings['SWIFT_VERSION']              = '5.0'
  config.build_settings['TARGETED_DEVICE_FAMILY']    = '1,2'
  config.build_settings['INFOPLIST_FILE']             = 'TathirQuranWidget/Info.plist'
  config.build_settings['CODE_SIGN_STYLE']                = 'Manual'
  config.build_settings['CODE_SIGN_IDENTITY']             = 'iPhone Distribution'
  config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = 'd513e963-2c48-4b76-ad8c-152b856a710a'
  config.build_settings['DEVELOPMENT_TEAM']               = '6RB9365RBK'
  config.build_settings['SKIP_INSTALL']                   = 'NO'
  config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']     = '16.0'
end

widgetkit = project.frameworks_group.new_file('System/Library/Frameworks/WidgetKit.framework')
widgetkit.last_known_file_type = 'wrapper.framework'
widgetkit.source_tree = 'SDKROOT'

swiftui = project.frameworks_group.new_file('System/Library/Frameworks/SwiftUI.framework')
swiftui.last_known_file_type = 'wrapper.framework'
swiftui.source_tree = 'SDKROOT'

widget_target.frameworks_build_phase.add_file_reference(widgetkit)
widget_target.frameworks_build_phase.add_file_reference(swiftui)

widget_group = project.main_group.new_group('TathirQuranWidget', 'TathirQuranWidget')
['TathirQuranWidget.swift', 'WidgetDataFetcher.swift'].each do |f|
  ref = widget_group.new_file(f)
  widget_target.source_build_phase.add_file_reference(ref)
end
widget_group.new_file('Info.plist')

main_target.add_dependency(widget_target)

embed_phase = main_target.build_phases.find { |p|
  p.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) &&
  (p.name == 'Embed Foundation Extensions' || p.dst_subfolder_spec == '13')
}
unless embed_phase
  embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  embed_phase.name = 'Embed Foundation Extensions'
  embed_phase.dst_subfolder_spec = '13'
  main_target.build_phases << embed_phase
end

build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
build_file.file_ref = widget_target.product_reference
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
embed_phase.files << build_file

project.save
puts "✓ TathirQuranWidget target added to #{File.basename(project_path)}"
