#!/usr/bin/env python3
"""Patch app/build.gradle for APK size optimization and stability."""
import sys

build_file = sys.argv[1]
with open(build_file, 'r') as f:
    content = f.read()

# Only ABI splits (density splits break sideloading for React Native apps)
if 'splits' not in content:
    splits_block = """    splits {
        abi {
            enable true
            reset()
            include "arm64-v8a", "armeabi-v7a"
            universalApk false
        }
    }"""
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
