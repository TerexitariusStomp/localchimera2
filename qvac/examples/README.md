# AI Writer Integration Example

This directory contains integration examples for the QVAC-Pear Miner Node.

## AI Writer Integration

The AI Writer integration demonstrates session-based resource allocation for collaborative content generation:

### Active Session (User Writing)
- AI Writer app is active for content generation
- Device uses local LLM for inference
- On-device AI processes writing prompts
- Miners run in parallel monitoring mode
- Mining paused temporarily during heavy generation

### Idle Session (No User Input)
- AI Writer app is idle after 5-minute timeout
- Device available for multi-protocol mining
- All miners monitor for inference tasks in parallel
- Immediate detection and response to inference requests
- Maximum earning potential during idle periods

### Key Features

1. **Session-Based Switching**: Automatically detects active vs idle user sessions
2. **Parallel Miner Monitoring**: BTT AI, Golem, Anyone Protocol, Mysterium, BTFS, Casper, and Botchain monitor simultaneously
3. **Immediate Task Detection**: Task monitor notifies all miners instantly when inference tasks arrive
4. **Resource Optimization**: Device resources allocated based on user activity

### Running the Example

```bash
node examples/aiwriter-integration.js
```

### Configuration

Edit `config.json` to customize:
- Idle timeout (default: 5 minutes)
- Parallel monitoring mode
- Miner priorities
- Inference settings

### Architecture

```
┌─────────────────────────────────────────────────┐
│           Session Manager                       │
│    (Detects active / idle state)                │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼──────┐
│ Active Mode   │  │ Idle Mode   │
│               │  │             │
│ AI Writer    │  │ Multi-      │
│ Generating   │  │ Protocol    │
│               │  │ Mining      │
│ LLM Inference│  │ All Miners  │
│ Wiki Save    │  │ Monitoring  │
└───────────────┘  └─────────────┘
        │                 │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │  Task Monitor   │
│ (Immediate task    │
│  detection)        │
└────────┬───────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│ BTFS  │ │BTT AI │ │ Golem │ │Anyone │
│       │ │       │ │       │ │       │
│Mining │ │Mining │ │Mining │ │Mining │
└───────┘ └───────┘ └───────┘ └───────┘
```

### Integration with AI Writer

The AI Writer uses QVAC Inference Layer for on-device LLM generation:

1. **QVAC Integration**: Uses Chimera SDK for local LLM inference (Llama models)
2. **Wiki Generation**: Saves articles to distributed Hypercore storage
3. **Rewards**: Contributors earn for high-quality generated content
4. **Peer Sync**: Articles sync across the Pear P2P network

### Benefits

- **Dual Earning**: Earn from content contributions and mining when idle
- **Resource Efficiency**: No resource conflicts between apps
- **Automatic Operation**: No manual switching required
- **Parallel Monitoring**: Never miss inference opportunities
- **Immediate Response**: Miners react instantly to tasks

### Future Enhancements

- GPU resource sharing between writing and mining
- Collaborative editing across peer nodes
- Voice-to-text integration for mobile
- Real-time word-count and earning dashboard
- Template library for common document types
