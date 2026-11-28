# AI study helper

- [x] a. Find verses search on Search page (keyword/meaning, all devices, offline, no AI model)
- [ ] b. AI Ask & Prayer tabs with WebGPU tiers (Gemini Nano, then Qwen3 4B / 1.7B / 0.6B), consent prompt showing download size, WASM CPU fallback
  - [x] b1 hidden Ask/Prayer page with tier detection, consent prompt, search-only + Scripture-prayer fallback (ask.html: noindex, not in menus or sitemap, connects only to this site)
  - [ ] b2 load and run the model for each tier after consent: Gemini Nano (Prompt API), WebGPU Qwen3 4B / 1.7B / 0.6B, WASM CPU (self-host or vetted model files, CSP update, cache/remove-model control)
  - [ ] b3 grounded answers and AI prayers: answer only from retrieved verses with verse links, prayers end with the required closing, crisis/safety guardrails
  - [ ] b4 real-device testing (iPhone, Android, Windows, Mac, Linux), memory/crash fallback to search-only, then check off b
- [ ] c. Prompt tuning + topic synonyms verified against a test set
- [ ] d. AI sections in Terms & Privacy + How to Use page, published together with AI go-live
