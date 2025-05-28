import express from "express";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import csv from "csvtojson";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { exec } from "child_process";
import { v4 as uuidv4 } from "uuid";

// For __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const downloadsFolder = __dirname;
const app = express();
const PORT = 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LOCALE = process.env.LOCALE || "english";

let prompt = `You are a professional content strategist and scriptwriter with over 10 years of experience in creating viral short-form videos, especially for YouTube Shorts. Your task is to analyze the following JSON object, which contains data on a trending topic. The JSON includes:
- "trend": the name of the trend
- "volume": the current search volume of the trend (string, e.g. "1M+")
- "breakdown": a comma-separated string of related search terms

Your responsibilities:
- Research the most up-to-date information about the trend and related search terms. Search online as needed to ensure you select the freshest, most viral content angle.
- Identify the most viral content angle based on the trend, volume, and breakdown.
- Create a video plan with three elements:

Output a JSON object with exactly these fields:
- "title": A catchy title for the video (must be less than 100 characters). Hashtags are encouraged.
- "description": A short, engaging description for the video, including relevant hashtags.
- "body": The full, exact speech script of the video subtitles. The script must be natural, fast-paced, and highly engaging for a YouTube Short between 15 and 60 seconds. A good length would be of 300 words, so so ensure body to be between 250 and 300 words. It must sound natural, as if read by a narrator. Avoid using "I", "me", or any personal visual references. Do not include any hashtags in the body. Hashtags must only appear in the title and description. Try to add a call to action if appliable.

Additional important instructions:
- Maximize emotional pull, curiosity, or value delivery (fun fact, quick tutorial, shocking info, etc.).
- Keep the tone professional, engaging, and tailored for virality.
- You must check online for the latest updates or trending variations of the topic before finalizing the content.

Example input JSON:
{
  "trend": "AI art generators",
  "volume": "1M+",
  "breakdown": "best AI art tools, how to create AI art, free AI art generator, AI art examples"
}

Expected output JSON format:
{
  "title": "Top FREE AI Art Generators You Must Try! 🎨 #AIArt #Tech",
  "description": "Discover the best free AI art tools you can use today! #AIArt #DigitalArt #Creativity",
  "body": "Want to create stunning art with zero drawing skills? Check out these FREE AI art generators! Number one: Dall-e! Just type your idea and watch the magic happen. Number two: Midjourney—perfect for wild, surreal designs. Number three: Microsoft designer, the easiest for beginners. Start creating your own AI masterpieces today!"
}

IMPORTANT:
Always provide only the final JSON output in your response. Do not include explanations or additional text. Do not use for any reason placeholders in your response, the output must be definitive and ready to use without further inspection.

Now analyze the following JSON input and respond only with the requested JSON output.`;


app.use(express.json({ limit: "10mb" })); // JSON + base64 handling

// ---------------- /scrape ----------------
app.post("/scrape", async (req, res) => {
  const { geo, status, sort, category, hours } = req.body;

  const url = `https://trends.google.com/trending?geo=${geo}&status=${status}&sort=${sort}&category=${category}&hours=${hours}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
    await page.goto(url);
    await page.setViewport({ width: 1080, height: 1024 });

    const client = await page.createCDPSession();
    await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloadsFolder });

    const filesBefore = new Set(fs.readdirSync(downloadsFolder));

    try {
      await page.waitForSelector("tr[role='row']", { timeout: 5000 });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await page.waitForSelector('li[data-action="csv"]', { timeout: 5000 });
      await page.evaluate(() => document.querySelector('li[data-action="csv"]').click());
    } catch {
      return res.status(404).json({ error: "Cannot fetch trends data. Please check the parameters." });
    }

    const timeoutMs = 15000;
    const pollingInterval = 500;
    let downloadedFile = null;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const currentFiles = new Set(fs.readdirSync(downloadsFolder));
      const newFiles = [...currentFiles].filter((f) => !filesBefore.has(f) && f.endsWith(".csv"));
      if (newFiles.length > 0) {
        downloadedFile = newFiles[0];
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
    }

    if (!downloadedFile) return res.status(500).json({ error: "Download failed or timed out" });

    const filePath = path.join(downloadsFolder, downloadedFile);
    const jsonArray = (await csv().fromFile(filePath)).map((item) => ({
      trend: item["Trends"],
      volume: item["Search volume"],
      breakdown: item["Trend breakdown"],
      started: item["Started"],
      ended: item["Ended"],
    }));

    await fs.promises.unlink(filePath);
    return res.json(jsonArray);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    if (browser) await browser.close();
  }
});

// ---------------- /generate ----------------
app.post("/generate", async (req, res) => {
  const raw = JSON.stringify({
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          { text: JSON.stringify(req.body) },
        ],
      },
    ],
  });

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });

  const geminiRes = await response.json();
  const data = geminiRes.candidates[0].content.parts[0].text;
  const json = data.substring(data.indexOf("{"), data.lastIndexOf("}") + 1);
  try {
    return res.json(JSON.parse(json));
  } catch (err) {
    console.error("Error parsing JSON:", err);
    return res.status(500).json({ error: "Failed to parse JSON response", response: data });
  }
});

// ---------------- /burn ----------------
app.post("/burn", async (req, res) => {
  let { video, audio, subtitles, fontsize = 30, outline = 2 } = req.body;
  if (!audio || !subtitles) return res.status(400).send("Missing parameters");

  const tmp = `/tmp/${uuidv4()}`;
  fs.mkdirSync(tmp);

  try {
    const audioPath = `${tmp}/audio.wav`;
    const subPath = `${tmp}/sub.srt`;
    const assPath = `${tmp}/sub.ass`;
    const outputPath = `${tmp}/output.mp4`;

    fs.writeFileSync(audioPath, Buffer.from(audio, "base64"));
    fs.writeFileSync(subPath, subtitles);

    let videoFilePath;
    let startOffset = 0;

    // If video is not provided, select a random default_ video
    if (!video) {
      const allFiles = fs.readdirSync("/mnt/videos");
      const defaultVideos = allFiles.filter(f => f.startsWith("default_"));
      if (defaultVideos.length === 0) throw new Error("No default videos found");
      video = defaultVideos[Math.floor(Math.random() * defaultVideos.length)];
      videoFilePath = path.join("/mnt/videos", video);

      const videoDuration = await getDuration(videoFilePath);
      const audioDuration = await getDuration(audioPath);
      const delta = Math.max(videoDuration - audioDuration - 1, 0);
      startOffset = delta > 0 ? Math.random() * delta : 0;
    } else {
      videoFilePath = path.join("/mnt/videos", video);
      if (!fs.existsSync(videoFilePath)) return res.status(404).send("Video file not found");
    }

    // Generate styled ASS subtitles
    await execPromise(`ffmpeg -y -i "${subPath}" "${assPath}"`);
    await execPromise(`sed -i '/^Style:/c\\Style: Default,Montserrat ExtraBold,${fontsize},&H00FFFFFF,&H00000000,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,2,${outline},2,10,10,10,1' "${assPath}"`);
    await execPromise(`grep -q "WrapStyle" "${assPath}" && sed -i 's/WrapStyle.*/WrapStyle: 0/' "${assPath}" || sed -i '/^\\[Script Info\\]/a WrapStyle: 0' "${assPath}"`);

    // Burn subtitles, combine video + audio
    await execPromise(
      `ffmpeg -y -ss ${startOffset.toFixed(2)} -i "${videoFilePath}" -i "${audioPath}" -vf "subtitles=${assPath}:fontsdir=/app/fonts" -map 0:v:0 -map 1:a:0 -c:v libx264 -c:a aac -shortest "${outputPath}"`
    );

    res.setHeader("Content-Type", "video/mp4");
    const readStream = fs.createReadStream(outputPath);
    readStream.pipe(res);
    readStream.on("close", () => cleanup(tmp));
  } catch (err) {
    console.error(err);
    cleanup(tmp);
    res.status(500).send("Internal server error");
  }
});

app.get("/coquiSpeakerId", (req, res) => {
  const speakerId = process.env.COQUI_SPEAKER_ID;
  res.json({ speakerId: speakerId || "p340" });
});

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => (error ? reject(stderr) : resolve(stdout)));
  });
}

async function getDuration(filePath) {
  const stdout = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
  return parseFloat(stdout.trim());
}

function cleanup(folder) {
  fs.rmSync(folder, { recursive: true, force: true });
}

(async () => {
  // first thing we do is check if locale is different from english, if so we ask gemini to translate the prompt to the locale language
  if (LOCALE !== "english") {
    const translationResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `System: You are a professional translator. Please translate the following prompt from english to ${LOCALE}. Ensure the translation is accurate and meaning is preserved. JSON contents MUST be translated in ${LOCALE} too, that's mandatory. Omit the system prompt from the translation and translate only user content, ensure full prompt is translated (do not miss any part, and DO NOT add any additional part not in the prompt).\n\n User:` },
              { text: prompt },
            ],
          },
        ],
      }),
    });
    const translationData = await translationResponse.json();
    prompt = translationData.candidates[0].content.parts[0].text;
    console.log(`Prompt translated to ${LOCALE}:`, prompt);
  }

  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
})();
