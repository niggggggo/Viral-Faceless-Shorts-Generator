import os
import base64
import tempfile
import subprocess
import math
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename

app = Flask(__name__)

TEMP_DIR = "/tmp/aeneas_files"
os.makedirs(TEMP_DIR, exist_ok=True)

def smart_split(text):
    import re

    def split_with_separator(text, sep):
        parts = []
        pattern = re.escape(sep)
        split_text = re.split(f'({pattern})', text)
        buffer = ''
        for part in split_text:
            if part == sep:
                buffer += part
                parts.append(buffer)
                buffer = ''
            else:
                buffer += part
        if buffer:
            parts.append(buffer)
        return parts

    # Step 1: split by major separators
    splits = [text]
    for sep in [". ", ", ", "; ", ": "]:
        new_splits = []
        for chunk in splits:
            new_splits.extend(split_with_separator(chunk, sep))
        splits = new_splits

    # Step 2: trim and remove empty strings
    splits = [s.strip() for s in splits if s.strip()]

    # Step 3: split large chunks into ~6 word segments
    def split_chunk(chunk, avg_words=6):
        words = chunk.split()
        if len(words) <= avg_words:
            return [chunk]

        chunks = [chunk]
        changed = True

        while changed:
            changed = False
            new_chunks = []
            for c in chunks:
                w = c.split()
                if len(w) <= avg_words:
                    new_chunks.append(c)
                else:
                    num_parts = max(2, math.floor(len(w) / avg_words))
                    words_per_part = math.ceil(len(w) / num_parts)
                    first_part = ' '.join(w[:words_per_part])
                    rest_part = ' '.join(w[words_per_part:])
                    new_chunks.append(first_part)
                    if rest_part:
                        new_chunks.append(rest_part)
                        changed = True
            chunks = new_chunks
        return chunks

    final_chunks = []
    for s in splits:
        final_chunks.extend(split_chunk(s))

    # ⭐ Final clean: trim and remove any empties
    final_chunks = [chunk.strip() for chunk in final_chunks if chunk.strip()]

    return final_chunks

@app.route('/align', methods=['POST'])
def align_audio_text():
    try:
        data = request.get_json()
        audio_base64 = data['audio']
        text = data['text']

        # Step 1: decode and save audio
        audio_data = base64.b64decode(audio_base64)
        audio_file = tempfile.NamedTemporaryFile(delete=False, dir=TEMP_DIR, suffix=".wav")
        audio_file.write(audio_data)
        audio_file.close()

        # ⭐ Step 2: split text smartly into subtitles
        chunks = smart_split(text)
        processed_text = "\n".join(chunks)

        # Step 3: save text file
        text_file = tempfile.NamedTemporaryFile(delete=False, dir=TEMP_DIR, suffix=".txt")
        text_file.write(processed_text.encode('utf-8'))
        text_file.close()

        # Step 4: run aeneas
        srt_file = tempfile.NamedTemporaryFile(delete=False, dir=TEMP_DIR, suffix=".srt")
        command = [
            "python3", "-m", "aeneas.tools.execute_task",
            audio_file.name, text_file.name,
            "task_language=eng|os_task_file_format=srt|is_text_type=plain|alignment_type=word|task_file_format=subtitle",
            srt_file.name
        ]
        subprocess.run(command, check=True)

        # Step 5: read result
        with open(srt_file.name, 'r') as f:
            srt_content = f.read()

        # Clean up
        os.remove(audio_file.name)
        os.remove(text_file.name)
        os.remove(srt_file.name)

        return jsonify({'srt': srt_content})

    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
