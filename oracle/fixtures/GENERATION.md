# Generating fixture media with Gemini (Nano Banana + Veo)

For iterating on the prompt only. The live demo uses real phone recordings from the app.
Generate in this order and keep the same item, box and tape in every shot: first the photos, then use
`photo-1.jpg` as the **reference / first frame** for every video (image-to-video), so the model keeps
the same T-shirt.

Shared description (paste into every prompt):

> A plain white crew-neck cotton T-shirt, short sleeves, no print. A small brown cardboard box, blue
> packing tape. A white shipping label with the handwritten number "INP-123456" in large black marker.
> A small white card folded in half (QR code hidden inside). Light wooden table, bright daylight,
> handheld smartphone footage, landscape 16:9, realistic, no people's faces, no text overlays, no music.

## Photos (Nano Banana / image model)

**photo-1.jpg (clean, front)**
> Product photo for a second-hand clothing listing: [shared description]. The T-shirt lies flat on the
> wooden table, front side up, fully visible, perfectly clean, no stains or damage. Shot from above
> with a smartphone, natural light.

**photo-2.jpg (clean, back)**
> Same T-shirt as in the reference image, now back side up, flat on the same table, perfectly clean.
> Same light and angle.

**photo-stain.jpg (for `disclosed`)**
> Same T-shirt as in the reference image, front side up, with one clearly visible dark brown coffee
> stain about 3 cm wide in the middle of the chest. Close enough that the stain is obvious.

## Videos (Veo, image-to-video from photo-1.jpg)

**stain/packing.mp4 — clean shirt packed**
> Handheld smartphone video, one continuous shot, no cuts: hands pick up the clean white T-shirt from
> the table and show the front and the back to the camera for two seconds each — it is perfectly
> clean. Hands fold it and put it into the open cardboard box. Hands place a white card folded in half
> on top of the shirt (the QR code is not visible, the card stays folded). Hands close the box, seal it
> with blue packing tape and stick a white shipping label with the handwritten number "INP-123456"
> on top. The label number is readable. [shared description]

**stain/unboxing.mp4 — stain revealed**
> Handheld smartphone video, one continuous shot, no cuts. It starts with the closed cardboard box
> sealed with intact blue tape and the label "INP-123456" clearly visible. Hands cut the tape with
> scissors and open the flaps. Hands take out a white card folded in half, unfold it and hold a QR code
> to the camera for two seconds. Hands take out the white T-shirt, unfold it and hold the FRONT close
> to the camera for four seconds: there is one clearly visible dark brown coffee stain, about 3 cm
> wide, in the middle of the chest. The stain is in sharp focus. [shared description]

**cut/unboxing.mp4 — starts from an opened box**
> Handheld smartphone video. It starts with the cardboard box ALREADY OPEN, the blue tape already cut
> and the flaps open. Hands take the white T-shirt out of the box and hold the front to the camera:
> a dark brown coffee stain about 3 cm wide on the chest. The folded card stays inside the box.
> [shared description]
(packing: copy `stain/packing.mp4`)

**disclosed/packing.mp4 — stained shirt packed (from photo-stain.jpg)**
> Same as stain/packing.mp4, but the T-shirt already has the dark brown coffee stain on the chest and
> the hands show the stain to the camera for two seconds before folding it.

**disclosed/unboxing.mp4**
> Same as stain/unboxing.mp4 (stain on the chest), the same box and label "INP-123456".

**ok/** — current recordings (clean shirt in both) are fine; add photo-1.jpg and photo-2.jpg.

## After generating

- Save into `_media/` under the names from `README.md` (media is git-ignored); cases reference them in `expected.json`.
- Check each video by eye: is the stain actually visible? Generators sometimes drop details; regenerate
  if not.
- Veo clips are short (~8 s). If the model calls them too short or "poor", extend the clip or record
  real footage instead.
