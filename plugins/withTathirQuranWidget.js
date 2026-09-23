const { withDangerousMod } = require('@expo/config-plugins');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const WIDGET_TARGET_NAME = 'TathirQuranWidget';
const WIDGET_BUNDLE_ID = 'com.fivesllc.tathirquran.widget';
const TEAM_ID = '6RB9365RBK';

const INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleDisplayName</key>
    <string>TathirQuran Widget</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>XPC!</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSExtension</key>
    <dict>
        <key>NSExtensionPointIdentifier</key>
        <string>com.apple.widgetkit-extension</string>
    </dict>
</dict>
</plist>`;

function buildRubyScript(iosDir) {
  return `
require 'xcodeproj'

project_path = Dir.glob("${iosDir}/*.xcodeproj").first
abort "No xcodeproj found in ${iosDir}" unless project_path

project = Xcodeproj::Project.open(project_path)

# Skip if widget target already exists
if project.targets.any? { |t| t.name == '${WIDGET_TARGET_NAME}' }
  puts "Widget target already present, skipping"
  exit 0
end

main_target = project.targets.find { |t| t.product_type == 'com.apple.product-type.application' }
abort "Main app target not found" unless main_target
puts "Main target: #{main_target.name}"

widget_target = project.new_target(:app_extension, '${WIDGET_TARGET_NAME}', :ios, '16.0')

widget_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME']               = '${WIDGET_TARGET_NAME}'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER']  = '${WIDGET_BUNDLE_ID}'
  config.build_settings['SWIFT_VERSION']              = '5.0'
  config.build_settings['TARGETED_DEVICE_FAMILY']    = '1,2'
  config.build_settings['INFOPLIST_FILE']             = '${WIDGET_TARGET_NAME}/Info.plist'
  config.build_settings['CODE_SIGN_STYLE']                = 'Manual'
  config.build_settings['CODE_SIGN_IDENTITY']             = 'iPhone Distribution'
  config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = 'd513e963-2c48-4b76-ad8c-152b856a710a'
  config.build_settings['DEVELOPMENT_TEAM']               = '${TEAM_ID}'
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

widget_group = project.main_group.new_group('${WIDGET_TARGET_NAME}', '${WIDGET_TARGET_NAME}')
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
puts "✓ ${WIDGET_TARGET_NAME} target added to #{File.basename(project_path)}"
`;
}

const withTathirQuranWidget = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      const widgetDir = path.join(iosDir, WIDGET_TARGET_NAME);

      // 1. Copy Swift source files
      fs.mkdirSync(widgetDir, { recursive: true });
      const srcDir = path.join(__dirname, '..', 'widget-src');
      for (const file of ['TathirQuranWidget.swift', 'WidgetDataFetcher.swift']) {
        fs.copyFileSync(path.join(srcDir, file), path.join(widgetDir, file));
      }
      fs.writeFileSync(path.join(widgetDir, 'Info.plist'), INFO_PLIST);
      console.log(`[withTathirQuranWidget] Copied widget sources to ${widgetDir}`);

      // 2a. Write ASC API key to /tmp for xcodebuild -authenticationKeyPath
      const ascKeyPath = '/tmp/asc_api_key_tathirquran.p8';
      const ascKeyP8 = process.env.EXPO_ASC_KEY_P8;
      if (ascKeyP8 && !fs.existsSync(ascKeyPath)) {
        fs.writeFileSync(ascKeyPath, ascKeyP8);
        console.log(`[withTathirQuranWidget] Wrote ASC API key to ${ascKeyPath}`);
      }

      // 2b. Write custom Gymfile so EAS uses it instead of generating its own
      const gymfilePath = path.join(iosDir, 'Gymfile');
      if (!fs.existsSync(gymfilePath)) {
        fs.writeFileSync(gymfilePath, GYMFILE_CONTENT);
        console.log(`[withTathirQuranWidget] Wrote custom Gymfile to ${gymfilePath}`);
      } else {
        console.log(`[withTathirQuranWidget] Gymfile already exists, skipping`);
      }

      // 3. Add widget target to Xcode project via xcodeproj gem
      const scriptPath = path.join(iosDir, '..', '.add_widget_target.rb');
      fs.writeFileSync(scriptPath, buildRubyScript(iosDir));

      const result = spawnSync('ruby', [scriptPath], { encoding: 'utf8', cwd: iosDir });
      console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);

      if (result.status !== 0) {
        throw new Error(`[withTathirQuranWidget] Ruby script failed:\n${result.stderr}`);
      }

      return config;
    },
  ]);
};

// Gymfile content: dynamically finds the EAS keychain at gym-run time
// and enables -allowProvisioningUpdates so Xcode can auto-create
// the com.fivesllc.tathirquran.widget App ID + distribution profile.
const GYMFILE_CONTENT = `suppress_xcode_output(true)
clean(false)

scheme("TathirQuran")
configuration("Release")

# Find EAS keychain created during PREPARE_CREDENTIALS phase
eas_keychain = \`security list-keychains -d user 2>/dev/null\`
  .split("\\n")
  .map { |p| p.strip.gsub('"', '') }
  .find { |p| p =~ /eas-build/ }

# Read main app profile UUID from Xcode project (set by EAS CONFIGURE_XCODE_PROJECT)
main_app_profile_uuid = nil
begin
  require 'xcodeproj'
  xcproj_path = Dir.glob("*.xcodeproj").first
  if xcproj_path
    xcproj = Xcodeproj::Project.open(xcproj_path)
    main_tgt = xcproj.targets.find { |t| t.product_type == 'com.apple.product-type.application' }
    if main_tgt
      rel_cfg = main_tgt.build_configurations.find { |c| c.name == 'Release' }
      main_app_profile_uuid = rel_cfg&.build_settings&.[]('PROVISIONING_PROFILE_SPECIFIER')
      main_app_profile_uuid ||= rel_cfg&.build_settings&.[]('PROVISIONING_PROFILE')
    end
  end
rescue => e
  puts "Warning: Could not read main app profile from xcodeproj: #{e.message}"
end

provision_map = { "com.fivesllc.tathirquran.widget" => "d513e963-2c48-4b76-ad8c-152b856a710a" }
provision_map["com.fivesllc.tathirquran"] = main_app_profile_uuid if main_app_profile_uuid

export_options({
  method: "app-store",
  teamID: "6RB9365RBK",
  signingStyle: "manual",
  provisioningProfiles: provision_map
})

xcargs "-allowProvisioningUpdates"

keychain_arg = eas_keychain ? "--keychain #{eas_keychain}" : ""
export_xcargs "OTHER_CODE_SIGN_FLAGS=\\"#{keychain_arg}\\" -allowProvisioningUpdates"

disable_xcpretty(true)
buildlog_path("./build")
derived_data_path("./build")
result_bundle(true)
result_bundle_path("/tmp/result-bundle-#{Time.now.to_i}.xcresult")
output_directory("./build")
`;

module.exports = withTathirQuranWidget;
