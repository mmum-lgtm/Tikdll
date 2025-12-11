import { NextResponse } from "next/server";
import * as Tiktok from "@tobyg74/tiktok-api-dl"; // Add this import for the library

const tiktokRegex = /^(https?:\/\/)?(www\.)?(tiktok\.com|vt\.tiktok\.com|m\.tiktok\.com)\//;

async function tiktok(url: string) {
  if (!tiktokRegex.test(url)) {
    throw new Error("Invalid URL");
  }

  // Replace scraping with library call (adjust version as needed; v3 is recommended)
  const response = await Tiktok.Downloader(url, { version: "v3" }); // Optional: add { proxy: "your-proxy", cookie: "your-cookie-string" } for advanced use

  if (response.status === "error") {
    throw new Error(response.message || "Failed to fetch TikTok data");
  }

  const data = response.result; // The main data object from the library

  // Map library fields to your expected structure (adjust based on actual response; inspect via console.log(data))
  const title = data.description || data.title || ""; // Often 'description' or 'title'
  const creator = data.author?.uniqueId || data.author?.nickname || ""; // Creator handle or name
  const thumbnail = data.cover || data.thumbnail || ""; // Cover image URL
  const videos: string[] = [];
  if (data.video) {
    // Collect video URLs (library may provide no-watermark, watermark, HD variants)
    if (data.video.no_watermark) videos.push(data.video.no_watermark);
    if (data.video.watermark) videos.push(data.video.watermark);
    if (data.video.hd) videos.push(data.video.hd); // Or other variants
  }
  const audio = data.music || ""; // Audio/MP3 URL
  const slide: string[] = data.images || []; // Array of image URLs for slides/photos

  return { title, creator, thumbnail, videos, audio, slide };
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Invalid TikTok URL" }, { status: 400 });
    }
    let result: any;
    try {
      result = await tiktok(url);
    } catch (err: any) {
      const message = err?.message || String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    const images: string[] = Array.isArray(result.slide) ? result.slide : [];
    const isPhoto = images.length > 0;
    const videos = result.videos || [];
    const audioUrl = result.audio || undefined;
    const description = result.title || "";
    const creator = result.creator || "";
    const response: Record<string, any> = {
      type: isPhoto ? "image" : "video",
      images,
      description,
      creator,
    };

    if (!isPhoto) {
      if (videos.length === 0) {
        return NextResponse.json({ error: "No video URLs found" }, { status: 500 });
      }

      response.videos = videos;
      response.video = videos[0];

      const hdVideo = videos.find((url: string) =>
        url.includes('hd') || url.includes('HD') // Adjust based on library's URLs
      );

      if (hdVideo) {
        response.videoHd = hdVideo;
      } else if (videos.length > 1) {
        response.videoHd = videos[1];
      }
    }
    if (audioUrl) {
      response.music = audioUrl;
    }
    return NextResponse.json(response);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Invalid request: ${err?.message || String(err)}` },
      { status: 400 },
    );
  }
}
