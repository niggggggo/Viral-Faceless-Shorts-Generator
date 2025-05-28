FROM ghcr.io/coqui-ai/tts-cpu

EXPOSE 5002

ENTRYPOINT [ "bash", "-c", "python3 TTS/server/server.py --model_name tts_models/en/vctk/vits" ]