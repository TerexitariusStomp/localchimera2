#!/usr/bin/env ruby
# Adds all files in ios/Chimera/Resources/ to the Xcode project's resource build phase
require 'xcodeproj'

project_path = File.expand_path('../ios/Chimera.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)

target = project.targets.find { |t| t.name == 'Chimera' }
abort 'Chimera target not found' unless target

resources_dir = File.expand_path('../ios/Chimera/Resources', __dir__)
abort 'Resources dir not found' unless Dir.exist?(resources_dir)

# Find or create a group for Resources
group = project.main_group.find_subpath('Chimera/Resources', true)
group.set_source_tree('<group>')

# Get existing file references to avoid duplicates
existing = group.files.map { |f| f.path }

Dir.foreach(resources_dir) do |entry|
  next if entry == '.' || entry == '..'
  path = File.join(resources_dir, entry)
  next unless File.file?(path)
  next if existing.include?(entry)

  ref = group.new_reference(entry)
  ref.set_source_tree('<group>')
  target.add_resources([ref])
  puts "Added: #{entry}"
end

project.save
puts 'Xcode project updated.'
