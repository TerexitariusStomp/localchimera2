#!/usr/bin/env python3
"""Patch app/build.gradle for APK size optimization and stability."""
import sys

build_file = sys.argv[1]
with open(build_file, 'r') as f:
    content = f.read()

# Only ABI splits (density splits break sideloading for React Native apps)
# Strip any existing splits block first (Expo prebuild may have added density splits)
def remove_block(text, block_name):
    idx = text.find(block_name)
    if idx == -1:
        return text
    start = text.find('{', idx)
    if start == -1:
        return text
    depth = 1
    end = start + 1
    while end < len(text) and depth > 0:
        if text[end] == '{':
            depth += 1
        elif text[end] == '}':
            depth -= 1
        end += 1
    # Remove from the line containing block_name through the closing brace
    line_start = text.rfind('\n', 0, idx) + 1
    return text[:line_start] + text[end:]

content = remove_block(content, 'splits')

# Inject our ABI-only splits block right after "android {"
splits_block = """    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a"
            universalApk false
        }
    }"""
if 'splits' not in content:
    content = content.replace('android {', 'android {\n' + splits_block, 1)

# Enable legacy packaging for native libs (better compression + sideload compat)
if 'packagingOptions' not in content:
    pkg = """    packagingOptions {
        jniLibs {
            useLegacyPackaging true
        }
    }
"""
    content = content.replace('    buildTypes {', pkg + '    buildTypes {', 1)

# Ensure release build references our ProGuard rules file
if 'proguard-rules.pro' in content:
    content = content.replace(
        "getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'",
        "getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'"
    )

with open(build_file, 'w') as f:
    f.write(content)
