# 🧠 Viral Faceless Shorts Generator

An automated pipeline to generate **faceless YouTube Shorts** based on **Google Trends**. This system leverages AI-generated scripts, TTS voice, subtitle alignment, and FFmpeg video composition, all wrapped in a fully containerized architecture.

## ❤️ Support This Project

Maintaining and improving this open-source project takes significant time and effort.  
If you find it useful, please consider **supporting my work via GitHub Sponsors**:

👉 [GitHub Sponsors](https://github.com/sponsors/Dark2C)

Your support helps keep this project alive and free for the community. Thank you! 🙌

## 🚀 Features

- 🔥 **Trending Topic Detection** via Google Trends
- 🤖 **Script Generation** using Google Gemini API
- 🗣️ **Voice Synthesis** with Coqui TTS
- ⏱️ **Forced Alignment** of subtitles using Aeneas
- 🎬 **Video Composition** with FFmpeg
- 🖥️ **One-Click Web Interface**

## 🧩 Pipeline Overview

1. **Scrape Google Trends**  
   The `trendscraper` service uses Puppeteer to extract trending topics.

2. **Generate Script (Gemini)**  
   It sends the trend to Gemini to generate a short, engaging script.

3. **Text-to-Speech (Coqui)**  
   The script is converted to speech using Coqui TTS.

4. **Subtitle Alignment (Aeneas)**  
   `speechalign` aligns the generated audio with the script to produce timed subtitles.

5. **Video Assembly (FFmpeg)**  
   The system merges:
   - A background video from `/videos` (named `default_*.mp4`)
   - The voiceover audio
   - Subtitles  
   to create the final faceless short.

6. **Web Trigger Interface**  
   Access a minimal frontend on port `80` to trigger everything with one click.

## 📦 Folder Structure

```
viral_faceless/
├── trendscraper/      # Scraper + Gemini + FFmpeg composition API
├── coqui/             # Coqui TTS container
├── speechalign/       # Forced alignment via Aeneas
├── nginx/             # Web interface + reverse proxy
├── /videos/           # Background video clips (e.g., gameplay, press machine)
├── docker-compose.yml
```

> **Note:** Background clips must be placed in `/videos` and named like `default_something.mp4`.

## 🐳 Usage

Rename the file `example.env` in `.env` and replace the placeholder Gemini API key with the one you generated from Google AI Studio, then start the pipeline with:

```bash
docker-compose up --build
```

Access the web interface at [http://localhost](http://localhost) to generate your first viral Short.

## 🧠 Requirements

- Docker + Docker Compose
- Google Gemini API Key
- At least one video clip in `/videos/`