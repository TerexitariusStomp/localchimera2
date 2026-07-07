import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Chimera Docs',
  description: 'Documentation for the Chimera local AI inference network',
  base: '/docs/',
  lastUpdated: true,
  themeConfig: {
    logo: '/chimeralogo-header.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Console', link: '/console/' },
      { text: 'GitHub', link: 'https://github.com/LocalChimera/localchimera' }
    ],
    sidebar: [
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Project Overview', link: '/#project-overview' },
          { text: 'Architecture', link: '/#architecture' },
          { text: 'Platforms', link: '/#platforms' },
          { text: 'Quick Start (Docker)', link: '/#quick-start-docker' },
          { text: 'Quick Start (Desktop)', link: '/#quick-start-desktop-—-linux' },
          { text: 'Quick Start (Mobile)', link: '/#quick-start-mobile-—-ios-android' },
          { text: 'Build from Source', link: '/#build-from-source' },
          { text: 'Key Features', link: '/#key-features' },
          { text: 'Project Structure', link: '/#project-structure' },
          { text: 'Upstream Projects', link: '/#upstream-projects' },
          { text: 'New API Endpoints', link: '/#new-api-endpoints' }
        ]
      },
      {
        text: 'SDK',
        items: [
          { text: 'SDK Overview', link: '/#sdk' },
          { text: 'How payouts work', link: '/#how-payouts-work' },
          { text: 'What the SDK gives your app', link: '/#what-the-sdk-gives-your-app' },
          { text: 'Install', link: '/#install' },
          { text: 'Quick Start', link: '/#quick-start' },
          { text: 'What your app should NOT do', link: '/#what-your-app-should-not-do' },
          { text: 'useChimera options', link: '/#usechimera-options' },
          { text: 'ChimeraSDK options', link: '/#chimerasdk-options-backend' },
          { text: 'SDK Architecture', link: '/#architecture-1' },
          { text: 'Security', link: '/#security-private-key-handling' },
          { text: 'Full example', link: '/#full-example' }
        ]
      },
      {
        text: 'Providers',
        items: [
          { text: 'Providers Overview', link: '/#providers' },
          { text: 'Files', link: '/#files' },
          { text: 'Supported Networks', link: '/#supported-networks' },
          { text: 'Usage', link: '/#usage' }
        ]
      },
      {
        text: 'QVAC',
        items: [
          { text: 'QVAC Overview', link: '/#qvac' },
          { text: 'Quick Start with Docker', link: '/#quick-start-with-docker' },
          { text: 'One-Line Integration', link: '/#one-line-integration' },
          { text: 'Protocol Multisig Fund Management', link: '/#protocol-multisig-fund-management' },
          { text: 'QVAC Architecture', link: '/#architecture-2' },
          { text: 'Features', link: '/#features' },
          { text: 'Installation', link: '/#installation' },
          { text: 'Usage', link: '/#usage-1' },
          { text: 'Configuration', link: '/#configuration' },
          { text: 'Miner Integration', link: '/#miner-integration' },
          { text: 'Development', link: '/#development' }
        ]
      },
      {
        text: 'Source & Apps',
        items: [
          { text: 'SRC Subdirectories', link: '/#src' },
          { text: 'Entry Points', link: '/#entry-points' },
          { text: 'APPS', link: '/#apps' },
          { text: 'desktop', link: '/#desktop' },
          { text: 'install', link: '/#install-1' },
          { text: 'macos', link: '/#macos' },
          { text: 'mobile', link: '/#mobile' },
          { text: 'mobile-expo', link: '/#mobile-expo' }
        ]
      },
      {
        text: 'Docs & Upstream',
        items: [
          { text: 'Docs Overview', link: '/#docs' },
          { text: 'Core Infrastructure', link: '/#core-infrastructure' },
          { text: 'Mining Networks', link: '/#mining-networks' },
          { text: 'Wiki / Knowledge Base', link: '/#wiki-knowledge-base' },
          { text: 'Tools / File Conversion', link: '/#tools-file-conversion' },
          { text: 'Fully Homomorphic Encryption', link: '/#fully-homomorphic-encryption-fhe' },
          { text: 'Git Submodules', link: '/#git-submodules-upstream-code-we-use-directly' },
          { text: 'Updating npm Dependencies', link: '/#updating-npm-dependencies' },
          { text: 'Updating Chimera SDK', link: '/#updating-chimera-sdk' },
          { text: 'Updating Pear / P2P Stack', link: '/#updating-pear-p2p-stack' },
          { text: 'Updating Tauri', link: '/#updating-tauri' },
          { text: 'Updating Capacitor', link: '/#updating-capacitor-mobile' },
          { text: 'Updating Mining Networks', link: '/#updating-mining-networks' },
          { text: 'Updating Wiki', link: '/#updating-wiki-knowledge-base' },
          { text: 'Automated Upstream Checks', link: '/#automated-upstream-checks' }
        ]
      },
      {
        text: 'Chimera Testnet',
        items: [
          { text: 'Chimera Testnet', link: '/#chimera-testnet' },
          { text: 'What This Is', link: '/#what-this-is' },
          { text: 'Testnet Architecture', link: '/#architecture-3' },
          { text: 'Key Adaptations', link: '/#key-adaptations' },
          { text: 'Testnet Project Structure', link: '/#project-structure-1' },
          { text: 'Testnet Quick Start', link: '/#quick-start-1' },
          { text: 'Smart Contract Integration', link: '/#smart-contract-integration' }
        ]
      },
      {
        text: 'Contracts',
        items: [
          { text: 'Contracts Overview', link: '/#contracts' },
          { text: 'EVM Contracts', link: '/#evm-contracts' },
          { text: 'Casper Contracts', link: '/#casper-contracts' },
          { text: 'Deployment', link: '/#deployment' },
          { text: 'Security', link: '/#security' },
          { text: 'Casper Contracts Purpose', link: '/#contracts-casper' },
          { text: 'Key Files', link: '/#key-files' },
          { text: 'Integration', link: '/#integration' }
        ]
      },
      {
        text: 'Scripts',
        items: [
          { text: 'Scripts Overview', link: '/#scripts' },
          { text: 'Subdirectories', link: '/#subdirectories-1' },
          { text: 'Top-Level Scripts', link: '/#top-level-scripts' },
          { text: 'Deployment Quick Start', link: '/#deployment-quick-start' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LocalChimera/localchimera' }
    ],
    search: {
      provider: 'local'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Chimera'
    }
  },
  markdown: {
    lineNumbers: false
  }
})
