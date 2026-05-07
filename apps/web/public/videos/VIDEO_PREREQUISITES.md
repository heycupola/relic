# Video Prerequisites

All marketing videos served from `apps/web/public/videos/` must share the same dimensions so the homepage feature grid renders consistently. Cards sit side-by-side and any aspect-ratio mismatch causes uneven heights.

## Required format

| Field       | Value                |
| ----------- | -------------------- |
| Resolution  | `1592x1080`          |
| Aspect      | ~3:2                 |
| Codec       | `H.264` (libx264)    |
| Audio       | Stripped (no audio)  |
| Container   | `.mp4`               |
| Faststart   | Required (`+faststart`) |

If a recording comes out at `1920x1080` (16:9) or any other size, normalize it to `1592x1080` before committing.

## Cropping a video to spec

Center-crop a wider source down to `1592x1080`:

```bash
ffmpeg -i input.mp4 \
  -vf "crop=1592:1080:(in_w-1592)/2:0" \
  -c:v libx264 -crf 23 -preset slow -movflags +faststart -an \
  output.mp4
```

Notes:

- `-an` strips audio. Marketing videos play muted, audio is dead weight.
- `-movflags +faststart` moves the moov atom to the front so the video starts streaming immediately.
- `-crf 23 -preset slow` is a good size/quality tradeoff. Bump `-crf` to 26 if the file is still too large.

## Padding instead of cropping

If the source content reaches the edges and a crop would lose information, pad to `1592x1080` instead:

```bash
ffmpeg -i input.mp4 \
  -vf "scale=1592:-2:force_original_aspect_ratio=decrease,pad=1592:1080:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 -crf 23 -preset slow -movflags +faststart -an \
  output.mp4
```

Prefer cropping when possible — letterboxing looks worse on the cards.

## Verifying the result

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,codec_name,r_frame_rate,duration \
  -of default=noprint_wrappers=1 output.mp4
```

Confirm `width=1592`, `height=1080`, `codec_name=h264` before replacing the live file.
