# MemoryVault

**True Long-Term Memory & Agentic Awareness for SillyTavern - With Branch Support**

> A fork of [OpenVault](https://github.com/vadash/openvault) with **chat branch awareness** and **auto-unhide for branches**. When you create a branch from an earlier message, memories from messages that don't exist in the branch are automatically pruned, and previously hidden messages are restored appropriately.

<table>
<tr>
<td><img src="https://github.com/user-attachments/assets/9c73f282-648b-49b5-89bc-40556742d01e" alt="Dashboard" /></td>
<td><img src="https://github.com/user-attachments/assets/2903287b-32af-44db-b0fe-26dd2905af0c" alt="Config" /></td>
<td><img src="https://github.com/user-attachments/assets/85cb3ea6-5f33-4e79-a263-69705844eda4" alt="Memory Browser" /></td>
</tr>
</table>

MemoryVault transforms your characters from simple chatbots into aware participants. It gives them **narrative memory**: the ability to recall specific events, track relationship dynamics (Trust/Tension), and remember emotional shifts, all while respecting the character's Point of View

Unlike standard vector storage, MemoryVault uses a **Smart Agentic Pipeline** to decide *what* is worth remembering and *when* to recall it

## Key Features

*   **Intelligent Extraction:** Automatically analyzes your chat to save significant moments (Actions, Revelations, Emotions) while ignoring small talk
*   **POV-Aware:** No more meta-gaming. Characters only remember what they actually witnessed or were told
*   **Relationship Tracking:** Tracks **Trust** and **Tension** levels that evolve naturally based on your interactions
*   **Hybrid Search:** Combines **Semantic Search** (vibes/meaning) with **Keyword Search** (specific names/terms) to find the perfect memory
*   **Narrative Decay:** Memories fade naturally over time unless they are highly important or reinforced
*   **Auto-Hide:** Keeps your prompt clean by hiding old messages, while MemoryVault keeps the memories alive in the background
*   **100% Local & Private:** All data is stored in your chat file. Supports local embeddings (WASM/WebGPU) or Ollama
*   **Branch-Aware Memory Pruning:** Automatically prunes memories when switching to chat branches, ensuring each timeline has its own consistent memory state
*   **Branch-Aware Auto-Unhide:** Messages hidden by auto-hide are restored when switching to branches where they should be visible

## Branch Support (Key Feature)

When you create a **chat branch** in SillyTavern (from an earlier message), the original OpenVault would carry over ALL memories from the parent chat - even memories extracted from messages that don't exist in the branch.

**MemoryVault** fixes this with two key features:

### 1. Memory Pruning
When switching to a branch:
- Detects when you switch to a branch with fewer messages than the memories reference
- Automatically prunes memories that reference non-existent messages
- Cleans up character states and relationships accordingly
- Shows a toast notification when pruning occurs

**Example:**
- Parent chat has 200 messages with 50 memories
- You create a branch from message #3
- MemoryVault automatically removes memories from messages 4-200
- Your branch now has a clean memory state matching its actual message history

### 2. Auto-Unhide for Branches
When switching to a branch:
- Messages that were hidden by auto-hide are automatically restored if they fall within the branch's message range
- Auto-hide then re-applies based on the new branch's message count
- This prevents loss of context when switching between timelines

### Toggle Branch Pruning
Both features can be enabled/disabled in settings:
- Go to Settings > Branch Awareness section
- Toggle "Branch-Aware Pruning" on/off as needed

## Installation

1.  Open **SillyTavern**
2.  Navigate to **Extensions** > **Install Extension**
3.  Paste this URL: `https://github.com/GaraRoyal/memoryvault`
4.  Click **Install**
5.  Reload SillyTavern

## Quick Start

1.  **Enable:** Go to the MemoryVault tab (top of extensions list) and check **Enable MemoryVault**
2.  **Configure LLM:** Select your **Extraction Profile** (what model writes the memories) and **Retrieval Profile** (what model picks memories, optional). *Pick a fast non-reasoning model like glm air or free Nvidia NIM kimi k2*
3.  **Embeddings:** Choose **e5** or if you have a modern GPU (RTX 2060 and above) try **gemma**
4.  **Chat:** Just roleplay! MemoryVault works in the background
    *   **Before the AI replies**, MemoryVault injects relevant memories
    *   **After the AI replies**, MemoryVault analyzes the new messages for memories

## Configuration Guide

### The Dashboard
A visual overview of your memory health
*   **Status:** Shows if the system is Ready, Extracting, or Retrieving
*   **Quick Toggles:** Turn the system on/off or toggle Auto-Hide
*   **Extraction Progress:** Shows if there are backlog messages waiting to be processed

### Memory Bank
Browse everything your character remembers
*   **Search & Filter:** Find memories by specific characters or event types (Action, Emotion, etc.)
*   **Edit:** Fix incorrect details or change the importance rating (1-5 stars) of a memory
*   **Delete:** Remove memories that didn't happen or aren't wanted

### Settings & Tuning

#### 1. LLM Strategy
*   **Smart Retrieval:** Keeps the AI involved in the recall process. It reads the top potential memories and picks only the ones truly relevant to the current scene. *Try it with ON and OFF*

#### 2. Embeddings (The Search Engine)
Embeddings allow the AI to find memories based on meaning (e.g., searching "Fight" finds "Combat")
*   **Browser Models (Transformers.js):** Runs entirely in your browser
    *   *bge:* Best for English. Fast
    *   *gemma:* Very smart, but requires **WebGPU** (Chrome/Edge with hardware acceleration)
*   **Ollama:** Offload the work to your local LLM backend

#### 3. Pipeline Tuning (Advanced)
*   **Context Window Size:** How much past chat the LLM reads when writing new memories. Higher = better context, slower generation
*   **Pre-filter / Final Budget:** Controls how many tokens are used for memory processing vs. final injection into the prompt

#### 4. Scoring Weights
Fine-tune how the engine finds memories:
*   **Semantic Match Weight:** Turns up the "Vibes" search. Finds conceptually similar events
*   **Keyword Match Weight:** Turns up "Exact" search. Essential for finding specific names or proper nouns
*   **Semantic Threshold:** The strictness filter. Lower values let more "loosely related" memories through; higher values require exact matches

## How Auto-Hide Works
MemoryVault can automatically "hide" messages older than a specific threshold (default: 50)
*   **Hidden messages** are removed from the prompt sent to the LLM, saving you money and tokens
*   **However**, MemoryVault has already extracted the *memories* from those messages
*   **Result:** You can have a chat with 5,000 messages, but only send ~50 messages + ~10 relevant memories to the AI. Infinite context feel with zero token bloat

## Troubleshooting

**"WebGPU not available"**
*   WebGPU requires a secure context (HTTPS or Localhost). If accessing SillyTavern over a local network IP (e.g., `192.168.1.x`), you must enable "Insecure origins treated as secure" in your browser flags:

1. Go to `chrome://flags`
2. Enable `#enable-unsafe-webgpu`
3. Enable `#enable-webgpu-developer-features`
4. In `#unsafely-treat-insecure-origin-as-secure` add your SillyTavern URL
5. Restart browser

**"Ollama Connection Failed"**
*   Ensure your Ollama server is running with `OLLAMA_ORIGINS="*"` environment variable set to allow browser access

**"Extraction is skipped/stuck"**
*   Check the SillyTavern server console. Ensure your Main API is connected and not busy generating a reply

## License & Credits
**MemoryVault** is Free & Open Source software licensed under **AGPL-3.0**
Based on [OpenVault](https://github.com/vadash/openvault) - Created for the SillyTavern community

*Version 1.0.0*
