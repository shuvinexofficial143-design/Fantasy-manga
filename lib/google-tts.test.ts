import {describe,expect,it} from "vitest";
import {splitTextForTts,voiceFamily} from "./google-tts";

describe("Google TTS helpers",()=>{
  it("classifies Google voice model families",()=>{
    expect(voiceFamily("hi-IN-Chirp3-HD-Kore")).toBe("Chirp 3 HD");
    expect(voiceFamily("hi-IN-Neural2-B")).toBe("Neural2");
    expect(voiceFamily("hi-IN-Wavenet-F")).toBe("WaveNet");
    expect(voiceFamily("hi-IN-Standard-B")).toBe("Standard");
  });

  it("keeps short narration in one chunk",()=>{
    expect(splitTextForTts("यह एक छोटी कहानी है। यह दूसरा वाक्य है।",4300)).toHaveLength(1);
  });

  it("splits long UTF-8 narration without dropping text",()=>{
    const sentence="यह एक लंबा हिंदी वाक्य है जिसमें कहानी आगे बढ़ती है।";
    const text=Array(300).fill(sentence).join(" ");
    const chunks=splitTextForTts(text,1200);
    expect(chunks.length).toBeGreaterThan(1);
    const encoder=new TextEncoder();
    for(const chunk of chunks)expect(encoder.encode(chunk).length).toBeLessThanOrEqual(1200);
    expect(chunks.join(" ").replace(/\s+/g," ").trim()).toBe(text.replace(/\s+/g," ").trim());
  });
});
