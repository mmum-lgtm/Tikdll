import { NextResponse } from "next/server"

const tiktokRegex = /^(https?:\/\/)?(www\.)?(tiktok\.com|vt\.tiktok\.com|m\.tiktok\.com)\//

async function tiktok(url: string) {
  if (!tiktokRegex.test(url)) {
    throw new Error("Invalid URL")
  }
  const form = new URLSearchParams()
  form.append("q", url)
  form.append("lang", "id")
  const res = await fetch("https://tiksave.io/api/ajaxSearch", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      origin: "https://tiksave.io",
      referer: "https://tiksave.io/id/download-tiktok-mp3",
      "user-agent":
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
    },
    body: form.toString(),
  })
  if (!res.ok) {
    throw new Error(`TikSave returned ${res.status}: ${res.statusText}`)
  }
  const json: any = await res.json()

  const html = json?.data || json?.data?.data
  if (typeof html !== "string") {
    throw new Error("Unexpected response from TikSave")
  }
  
  let title = ""
  let creator = ""
  {
    const patterns = [
      /<div[^>]*class\s*=\s*["']content["'][^>]*>([\s\S]*?)<\/div>/i,
      /class\s*=\s*["']content["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class\s*=\s*["']desc["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class\s*=\s*["']description["'][^>]*>([\s\S]*?)<\/div>/i,
      /<p[^>]*class\s*=\s*["']desc["'][^>]*>([\s\S]*?)<\/p>/i,
      /<span[^>]*class\s*=\s*["']desc["'][^>]*>([\s\S]*?)<\/span>/i,
      /class\s*=\s*["']tik-left["'][\s\S]*?<div[^>]*class\s*=\s*["']content["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class\s*=\s*["']content["'][^>]*>([\s\S]*?)(?:<\/div>|$)/i,
      /<div[^>]*class\s*=\s*["']text["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*class\s*=\s*["']caption["'][^>]*>([\s\S]*?)<\/div>/i
    ]
    
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i]
      const match = pattern.exec(html)
      if (match && match[1]) {
        const rawContent = match[1]
        title = rawContent.replace(/<[^>]+>/g, "").trim()
        if (title && title.length > 0) {
          break
        }
      }
    }
    
    const textContentPatterns = [
      /<div[^>]*>([^<]*#[^<]*?)<\/div>/i,
      /<p[^>]*>([^<]*#[^<]*?)<\/p>/i,
      /<span[^>]*>([^<]*#[^<]*?)<\/span>/i
    ]
    
    if (!title || title.length === 0) {
      for (let i = 0; i < textContentPatterns.length; i++) {
        const pattern = textContentPatterns[i]
        const match = pattern.exec(html)
        if (match && match[1]) {
          const foundText = match[1].trim()
          if (foundText && foundText.length > 5) {
            title = foundText
            break
          }
        }
      }
    }
    
    const creatorMatch = /class\s*=\s*["']tik-left["'][\s\S]*?<div[^>]*class\s*=\s*["']user["'][^>]*>.*?<a[^>]*>@([^<]+)<\/a>/i.exec(html)
    if (creatorMatch) {
      creator = creatorMatch[1]
    } else {
      const altCreatorMatch = /@([a-zA-Z0-9_.]+)/i.exec(html)
      if (altCreatorMatch) {
        creator = altCreatorMatch[1]
      }
    }
  }

  let thumbnail = ""
  {
    const match = /class\s*=\s*["']tik-left["'][\s\S]*?<img[^>]*src="([^"]+)"/i.exec(html)
    if (match) {
      thumbnail = match[1]
    }
  }

  let videos: string[] = []
  let audio = ""
  {
    const patterns = [
      /class\s*=\s*["']dl-action["'][\s\S]*?<\/div>/i,
      /class\s*=\s*["']download["'][\s\S]*?<\/div>/i,
      /class\s*=\s*["']download-box["'][\s\S]*?<\/div>/i,
      /<div[^>]*class\s*=\s*["'][^"']*download[^"']*["'][^>]*>[\s\S]*?<\/div>/i
    ]
    
    let section = ""
    for (const pattern of patterns) {
      const match = pattern.exec(html)
      if (match && match[0]) {
        section = match[0]
        break
      }
    }
    
    if (section) {
      const hrefs = [] as string[]
      const hrefRegex = /href="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = hrefRegex.exec(section))) {
        hrefs.push(m[1])
      }
      
      const videoUrls = hrefs.filter(url => 
        url.includes('.mp4') || 
        url.includes('video') || 
        (!url.includes('.mp3') && !url.includes('audio'))
      )
      const audioUrls = hrefs.filter(url => 
        url.includes('.mp3') || 
        url.includes('audio')
      )
      
      const snapcdnUrls = videoUrls.filter(url => url.includes('snapcdn.app'))
      const otherVideoUrls = videoUrls.filter(url => !url.includes('snapcdn.app'))
      
      videos = [...snapcdnUrls, ...otherVideoUrls].slice(0, 2)
      
      if (audioUrls.length > 0) {
        audio = audioUrls[0]
      }
      
      console.log("=== TIKSAVE.IO EXTRACTION DEBUG ===")
      console.log("All hrefs found:", hrefs)
      console.log("Video URLs:", videoUrls)
      console.log("Audio URLs:", audioUrls)
      console.log("snapcdn URLs:", snapcdnUrls)
      console.log("Other video URLs:", otherVideoUrls)
      console.log("Final videos array:", videos)
      console.log("Final audio:", audio)
      console.log("===================================")
    } else {
      console.log("=== FALLBACK: SEARCHING ALL HREFS ===")
      const allHrefs = [] as string[]
      const allHrefRegex = /href="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = allHrefRegex.exec(html))) {
        allHrefs.push(m[1])
      }
      
      const fallbackVideoUrls = allHrefs.filter(url => 
        url.includes('.mp4') || 
        url.includes('video') || 
        (!url.includes('.mp3') && !url.includes('audio') && !url.includes('http'))
      )
      const fallbackAudioUrls = allHrefs.filter(url => 
        url.includes('.mp3') || 
        url.includes('audio')
      )
      
      if (fallbackVideoUrls.length > 0) {
        videos = fallbackVideoUrls.slice(0, 2)
      }
      if (fallbackAudioUrls.length > 0) {
        audio = fallbackAudioUrls[0]
      }
      
      console.log("All hrefs in HTML:", allHrefs)
      console.log("Fallback video URLs:", fallbackVideoUrls)
      console.log("Fallback audio URLs:", fallbackAudioUrls)
      console.log("Final fallback videos:", videos)
      console.log("Final fallback audio:", audio)
      console.log("===================================")
    }
  }

  const slide: string[] = []
  {
    const listMatch = /<ul[^>]*class\s*=\s*["'][^"']*download-box[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i.exec(html)
    if (listMatch) {
      const listHtml = listMatch[1]
      const imgRegex = /<img[^>]*src="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = imgRegex.exec(listHtml))) {
        slide.push(m[1])
      }
    }
  }
  return { title, creator, thumbnail, videos, audio, slide }
}

async function ssstik(url: string) {
  if (!tiktokRegex.test(url)) {
    throw new Error("Invalid URL")
  }

  const userAgent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

  // Get session and tt token
  const sesRes = await fetch("https://ssstik.io", {
    headers: {
      "user-agent": userAgent,
    },
  });
  if (!sesRes.ok) {
    throw new Error(`Failed to get ssstik page: ${sesRes.status}`);
  }
  const sesHtml = await sesRes.text();
  const ttMatch = /tt:'([\w\d]+)'/.exec(sesHtml);
  if (!ttMatch) {
    throw new Error("Could not find tt token in ssstik page");
  }
  const tt = ttMatch[1];

  const form = new URLSearchParams();
  form.append("id", url);
  form.append("locale", "id"); // Use 'id' for Indonesian, or 'en' for English
  form.append("tt", tt);

  const res = await fetch("https://ssstik.io/abc?url=dl", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://ssstik.io",
      referer: "https://ssstik.io/",
      "user-agent": userAgent,
    },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new Error(`ssstik returned ${res.status}: ${res.statusText}`);
  }
  const html = await res.text();

  // Extract title/description
  let title = "";
  const descPatterns = [
    /<h2[^>]*>([\s\S]*?)<\/h2>/i,
    /<p[^>]*>([\s\S]*?)<\/p>/i,
    /<div[^>]*id\s*=\s*["']mainresult["'][^>]*>([\s\S]*?)<\/div>/i,
    /<span[^>]*class\s*=\s*["']result-overlay["'][^>]*>([\s\S]*?)<\/span>/i,
  ];
  for (const pattern of descPatterns) {
    const match = pattern.exec(html);
    if (match && match[1]) {
      title = match[1].replace(/<[^>]+>/g, "").trim();
      if (title.length > 0) break;
    }
  }

  // Extract creator
  let creator = "";
  const creatorMatch = /@([\w\d_.]+)/i.exec(html);
  if (creatorMatch) {
    creator = creatorMatch[1];
  }

  // Extract thumbnail
  let thumbnail = "";
  const thumbMatch = /<img[^>]*src="([^"]+)"[^>]*class\s*=\s*["']pure-img["']/i.exec(html) || /<img[^>]*src="([^"]+)"/i.exec(html);
  if (thumbMatch) {
    thumbnail = thumbMatch[1];
  }

  // Extract videos and audio
  let videos: string[] = [];
  let audio = "";

  const hrefRegex = /href="([^"]+)"/g;
  const hrefs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = hrefRegex.exec(html))) {
    hrefs.push(m[1]);
  }

  // Process hrefs for possible base64 encoding
  const processedHrefs = hrefs.map((h) => {
    if (h.includes("ssscdn.io")) {
      const parts = h.split("/");
      if (parts.length > 5) {
        const toDecode = parts.slice(5).join("/");
        try {
          return atob(toDecode);
        } catch {
          return h;
        }
      }
    }
    return h;
  });

  const videoUrls = processedHrefs.filter((url) =>
    url.endsWith(".mp4") ||
    url.includes("video") ||
    url.includes("download") && !url.includes("mp3") && !url.includes("music")
  );
  const audioUrls = processedHrefs.filter((url) =>
    url.endsWith(".mp3") ||
    url.includes("mp3") ||
    url.includes("music")
  );

  videos = videoUrls.slice(0, 2);
  if (audioUrls.length > 0) {
    audio = audioUrls[0];
  }

  // Extract slides/images
  const slide: string[] = [];
  const imgRegex = /<img[^>]*src="([^"]+)"/g;
  while ((m = imgRegex.exec(html))) {
    const imgUrl = m[1];
    if (imgUrl.includes(".jpg") || imgUrl.includes(".png") || imgUrl.includes("photo")) {
      if (imgUrl !== thumbnail) slide.push(imgUrl);
    }
  }

  console.log("=== SSSTIK.IO EXTRACTION DEBUG ===");
  console.log("Processed hrefs:", processedHrefs);
  console.log("Video URLs:", videoUrls);
  console.log("Audio URLs:", audioUrls);
  console.log("Final videos:", videos);
  console.log("Final audio:", audio);
  console.log("Slides:", slide);
  console.log("===================================");

  return { title, creator, thumbnail, videos, audio, slide };
}

async function tobyDl(url: string) {
  if (!tiktokRegex.test(url)) {
    throw new Error("Invalid URL");
  }

  const Tiktok = require('@tobyg74/tiktok-api-dl');

  let res;
  try {
    res = await Tiktok.Downloader(url, { version: "v1" });
  } catch (err) {
    try {
      res = await Tiktok.Downloader(url, { version: "v2" });
    } catch (err) {
      res = await Tiktok.Downloader(url, { version: "v3" });
    }
  }

  if (res.status !== "success") {
    throw new Error("Toby DL failed: " + res.message);
  }

  // Parsing assuming common structure - adjust based on actual response by console.logging res
  const result = res.result;
  const title = result.desc || result.description || "";
  const creator = result.author?.uniqueId || result.author?.nickname || "";
  const thumbnail = result.cover || result.dynamicCover || "";
  let videos: string[] = [];
  let audio = "";
  let slide: string[] = [];

  if (result.type === "video") {
    // May have video, video_no_watermark, etc.
    if (result.video) videos.push(result.video);
    if (result.video_no_watermark) videos.push(result.video_no_watermark);
    audio = result.music || "";
  } else if (result.type === "image" || result.type === "slideshow") {
    slide = result.images || [];
    audio = result.music || "";
  }

  console.log("=== TOBY DL DEBUG ===");
  console.log("Full response:", res);
  console.log("Parsed title:", title);
  console.log("Parsed creator:", creator);
  console.log("Parsed thumbnail:", thumbnail);
  console.log("Parsed videos:", videos);
  console.log("Parsed audio:", audio);
  console.log("Parsed slide:", slide);
  console.log("===================================");

  return { title, creator, thumbnail, videos, audio, slide };
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid TikTok URL" }, { status: 400 })
    }

    let result: any;
    try {
      result = await tiktok(url);
      // Check if media was extracted successfully
      if (result.videos.length === 0 && result.slide.length === 0) {
        throw new Error("No media found from TikSave");
      }
    } catch (err: any) {
      console.error("TikSave failed:", err.message);
      // Fallback to ssstik
      try {
        result = await ssstik(url);
        if (result.videos.length === 0 && result.slide.length === 0) {
          throw new Error("No media found from ssstik");
        }
      } catch (fallbackErr: any) {
        console.error("ssstik fallback failed:", fallbackErr.message);
        // Second fallback to tobyDl
        try {
          result = await tobyDl(url);
          if (result.videos.length === 0 && result.slide.length === 0) {
            throw new Error("No media found from tobyDl");
          }
        } catch (secondFallbackErr: any) {
          console.error("tobyDl second fallback failed:", secondFallbackErr.message);
          return NextResponse.json({ error: `All services failed: ${secondFallbackErr.message}` }, { status: 500 });
        }
      }
    }

    const images: string[] = Array.isArray(result.slide) ? result.slide : []
    const isPhoto = images.length > 0
    const videos = result.videos || []
    const audioUrl = result.audio || undefined
    const description = result.title || ""
    const creator = result.creator || ""

    const response: Record<string, any> = {
      type: isPhoto ? "image" : "video",
      images,
      description,
      creator,
    }
    
    if (!isPhoto) {
      if (videos.length === 0) {
        return NextResponse.json({ error: "No video URLs found" }, { status: 500 })
      }
      
      response.videos = videos
      response.video = videos[0]
      
      const hdVideo = videos.find((url: string) => 
        url.includes('snapcdn.app') || 
        url.includes('hd') || 
        url.includes('HD')
      )
      
      if (hdVideo) {
        response.videoHd = hdVideo
      } else if (videos.length > 1) {
        response.videoHd = videos[1]
      }
    }
    if (audioUrl) {
      response.music = audioUrl
    }
    return NextResponse.json(response)
  } catch (err: any) {
    return NextResponse.json(
      { error: `Invalid request: ${err?.message || String(err)}` },
      { status: 400 },
    )
  }
}
