// =====================================================================
//  THE MENU — every category, collection and app on the site lives here.
//  Cards, the sidebar, category pages and app pages are built from this file.
//
//  App fields:
//    key        URL slug: /app/<key>
//    status     'included' (in every plan) | 'free' | 'soon'
//    kind       'macos' | 'python' | 'cli'
//    url        app website (optional) · dmg: direct download (optional)
//    buy        Dodo plan key for a one-off purchase (optional)
//    highlights [icon, title, text] · steps [title, text] · perfectFor [title, text]
// =====================================================================
window.MENU = (function () {
  const CATS = [
    { id: 'masala-chai', icon: '🫖', name: 'Masala Chai', sub: 'Capture & Guides',
      blurb: 'Turn what’s on your screen into PDFs, step-by-step guides and short videos.' },
    { id: 'adrak-chai', icon: '🍵', name: 'Adrak Chai', sub: 'Everyday Essentials',
      blurb: 'Small daily helpers: your most-copied values and a polished résumé.' },
    { id: 'tulsi-chai', icon: '🌿', name: 'Tulsi Chai', sub: 'Health & Focus',
      blurb: 'Look after your body while you work, with on-device coaching.' },
    { id: 'sulaimani', icon: '🖤', name: 'Sulaimani', sub: 'PDF & Web Tools', free: true,
      blurb: 'Free tools for turning web pages into PDFs and shipping web apps.' },
    { id: 'kesar-chai', icon: '✨', name: 'Kesar Chai', sub: 'AI Builder Kit', free: true,
      blurb: 'Free Python building blocks for apps that talk to LLMs.' },
  ];

  const PICKS = [
    { id: 'guides-and-docs', icon: '📚', name: 'Guides & docs, done', sub: 'Show it once, share it forever',
      apps: ['stepwise', 'cadence', 'kadak', 'resumebaker'] },
    { id: 'private-by-design', icon: '🔒', name: 'Private by design', sub: 'Nothing leaves your Mac',
      apps: ['cubby', 'stepwise', 'cadence', 'cairn'] },
    { id: 'build-with-llms', icon: '🤖', name: 'Build with LLMs', sub: 'Free Python tools for AI apps',
      apps: ['redactor', 'chunkwise', 'promptkit', 'vectorlite', 'llmparse'] },
  ];

  const APPS = [
    // ---------------- Masala Chai · Capture & Guides
    { key: 'kadak', name: 'Kadak', icon: '💪', cat: 'masala-chai', kind: 'macos', status: 'included', buy: 'kadak', price: '4.99',
      version: '1.0.0', shots: true,
      tagline: 'Brew any website into a full-page PDF, plus up to 10 screenshots.',
      about: ['Kadak turns any website into a clean, full-page PDF, and grabs up to 10 screenshots while it’s at it. Paste a URL, pick how many shots you want, and brew.',
        'It’s a native macOS app with a single-screen flow, so there’s nothing to configure and nothing to learn.'],
      highlights: [
        ['📄', 'The whole page, one PDF', 'Long pages are captured top to bottom into a single PDF.'],
        ['🖼️', 'Up to 10 screenshots', 'Choose 0–10 screenshots per page, saved as PNGs next to the PDF.'],
        ['⚡', 'One-screen flow', 'Paste, pick, brew. No settings maze.'],
        ['📁', 'Tidy output', 'Everything lands in ~/Downloads/Kadak, named after the site.'],
      ],
      steps: [['Paste a URL', 'Any public web page.'], ['Pick your screenshots', 'Anywhere from 0 to 10.'], ['Brew', 'Get a full-page PDF and your PNGs in Downloads.']],
      perfectFor: [['Archiving articles and receipts', 'Keep a copy of a page exactly as it looked.'], ['Design reviews', 'Share a full page with feedback-ready screenshots.'], ['Records and evidence', 'Capture a page on a given day before it changes.']] },

    { key: 'stepwise', name: 'Stepwise', icon: '🪜', cat: 'masala-chai', kind: 'macos', status: 'included',
      url: 'https://stepwise.dashovia.app', requires: 'macOS 15 or later', onDevice: true,
      tagline: 'Record once, get a step-by-step guide with captions, screenshots and a PDF.',
      about: ['Stepwise watches you do a task and writes it up. Every click becomes a captioned, screenshotted step. You keep the screen recording and export a PDF.',
        'No account, no upload, no analytics: everything you record stays on your Mac.'],
      highlights: [
        ['🖱️', 'Every click, captioned', 'Reads button and menu names through macOS Accessibility, so a step says “Open the File menu”, not “Click here”.'],
        ['🎞️', 'The recording comes with it', 'The screen recording is saved beside the guide. “Play from here” jumps to the moment behind any step.'],
        ['📄', 'A PDF you can send', 'A paged, numbered guide with every screenshot, ready to attach.'],
        ['⌨️', 'Keyboard-first', '⌃⌥⌘R starts and stops from any app, ⌘Z undoes anything, ⌘E exports.'],
        ['✏️', 'Edit everything', 'Reword captions, drag to reorder, delete and restore steps.'],
        ['🔒', 'Private by design', 'Nothing you record ever touches the network.'],
      ],
      steps: [['Press ⌃⌥⌘R', 'Start recording from any app.'], ['Do the task once', 'Each click becomes a captioned step with a screenshot.'], ['Export', 'Tidy the captions and export a PDF with ⌘E.']],
      perfectFor: [['How-to docs', 'Write the guide by doing the task.'], ['Support answers', 'Reply to “how do I…?” with a real walkthrough.'], ['Onboarding', 'Hand new teammates the exact steps.']] },

    { key: 'cadence', name: 'Cadence', icon: '🎬', cat: 'masala-chai', kind: 'macos', status: 'included',
      url: 'https://cadence.dashovia.app', requires: 'macOS 13 or later · Apple Silicon & Intel', onDevice: true,
      tagline: 'Screen guides in 5 steps, 1 minute each, stitched into one MP4.',
      about: ['Cadence records structured screen guides. Every step auto-stops at 60 seconds, then the steps are stitched into one clean MP4 with chapters.',
        'There’s no timeline and no editing: the structure does the editing for you. And there’s no cloud: your recordings stay on your Mac.'],
      highlights: [
        ['⏱️', 'The 60-second cap', 'Every step auto-stops at 1:00. It keeps you clear, and keeps viewers watching.'],
        ['🎬', 'Auto-edited', 'Animated step titles, smooth cross-dissolves and chapter markers, with zero timeline.'],
        ['↩️', 'Per-step retakes', 'Flubbed step 3? Re-record only step 3.'],
        ['📱', 'Reel-ready formats', 'One guide, three exports: 16:9, 9:16 and 1:1, auto-framed.'],
        ['🔒', 'Local by default', 'No accounts, no upload, no cloud.'],
        ['📦', 'Drop it anywhere', 'It’s just an MP4: Slack, Notion, email or your help center.'],
      ],
      steps: [['Outline your steps', 'Start with 5; go down to 2 or up to 8, and name each one.'], ['Record against the clock', 'Show the thing and talk it through. At 60 seconds the take ends.'], ['Export one MP4', 'Steps stitch automatically with title cards and chapters.']],
      perfectFor: [['Product walkthroughs', 'Short, watchable how-tos.'], ['Team docs', 'Drop a chaptered video into Notion or Slack.'], ['Social clips', 'Export 9:16 for Reels, Shorts and TikTok.']] },

    // ---------------- Adrak Chai · Everyday Essentials
    { key: 'cubby', name: 'Cubby', icon: '📦', cat: 'adrak-chai', kind: 'macos', status: 'included',
      url: 'https://cubby.dashovia.app', requires: 'macOS 14 or later', onDevice: true,
      tagline: 'Your stuff, in its place. A menu-bar panel of values, one keystroke away.',
      about: ['Cubby lives in your Mac’s menu bar. Press a hotkey and an elegant panel appears with your named compartments: phone numbers, API keys, bank details, snippets. Type, hit return, it’s copied.',
        'It’s a curated vault, not a clipboard dump, and everything, including the AI, runs on your device.'],
      highlights: [
        ['🗂️', 'Named compartments', 'Group everything into cubbies you name: “Personal”, “API Keys”, “Bank”.'],
        ['⌨️', 'Instant hotkey recall', 'Press ⌘⇧Space anywhere, type to filter, hit return to copy.'],
        ['✨', 'AI smart find', 'Search by meaning, on-device. “my bank number” finds the right entry.'],
        ['🪄', 'Auto-organize on paste', 'Paste a key or card number and Cubby files it and marks it secret.'],
        ['🔐', 'Keychain-backed secrets', 'Sensitive values live in the macOS Keychain, masked until you reveal them.'],
        ['⏱️', 'Auto-clear timers', 'Sensitive values wipe themselves off the clipboard seconds after you copy them.'],
      ],
      steps: [['Summon it', 'Press ⌘⇧Space from any app.'], ['Find it', 'Type a few letters, or jump cubbies with ⌘1–9.'], ['Copy it', 'Hit return. The value is on your clipboard; paste anywhere.']],
      perfectFor: [['Developers', 'API keys and tokens, one keystroke away.'], ['Forms and checkouts', 'Addresses, IDs and account numbers without hunting.'], ['Anyone with secrets', 'Keep sensitive values out of notes apps.']] },

    { key: 'resumebaker', name: 'ResumeBaker', icon: '📄', cat: 'adrak-chai', kind: 'macos', status: 'included',
      version: '1.0.3', dmg: '/downloads/ResumeBaker_1.0.3.dmg',
      tagline: 'Bake a polished résumé in minutes: pick a template, fill the blanks, export to PDF.',
      about: ['ResumeBaker helps you bake a polished résumé in minutes. Pick a template, fill in the blanks and export a clean, recruiter-ready PDF. A native macOS app.'],
      highlights: [
        ['🎨', 'Pick a template', 'Start from a clean, professional layout.'],
        ['✍️', 'Fill the blanks', 'Add your details; the template handles the layout.'],
        ['📄', 'Export to PDF', 'A recruiter-ready PDF in one click.'],
        ['🍎', 'Native macOS', 'A real Mac app, not a web page.'],
      ],
      steps: [['Pick a template', 'Choose the look.'], ['Fill in the blanks', 'Add your details section by section.'], ['Export', 'Save a clean PDF to send.']],
      perfectFor: [['Job hunting', 'A fresh résumé for every application.'], ['Students and freshers', 'A professional first résumé.'], ['Quick updates', 'Add your latest role in minutes.']] },

    // ---------------- Tulsi Chai · Health & Focus
    { key: 'cairn', name: 'Cairn', icon: '🗿', cat: 'tulsi-chai', kind: 'macos', status: 'soon',
      url: 'https://cairn.dashovia.app', onDevice: true,
      tagline: 'Desk wellness: on-device posture, eye and stretch-break coaching.',
      about: ['Cairn watches your webcam with on-device MediaPipe AI and keeps you aligned all day: posture, eyes, a pose-tracked stretch coach, and a moment of calm when you need it.',
        'Video never leaves your Mac. It runs entirely offline, with no account and no cloud. Cairn is coming soon; join the early-bird list on its website.'],
      highlights: [
        ['👀', 'Eye strain & blinks', 'Tracks your blink rate and nudges you with a gentle 20-20-20 timer.'],
        ['📏', 'Screen distance', 'Reminds you to sit back before you hunch toward the display.'],
        ['🧍', 'Posture & slouch', 'Learns your neutral position and catches the slow slump.'],
        ['🤸', 'AI Stretch Coach', 'Guided stretches with live pose-tracked form scoring.'],
        ['🫁', 'Desk Meditation', 'Five-minute guided breathing with an on-device soundscape.'],
        ['🔒', 'Private by architecture', 'Frames are analyzed in memory and discarded, never saved or sent.'],
      ],
      steps: [['It pings you to stand', 'A native notification when you’ve been sitting too long.'], ['It shows you the move', 'Each stretch demonstrated with a clear cue.'], ['It checks your form', 'Pose tracking confirms the stretch and scores your range.']],
      perfectFor: [['Long desk days', 'Gentle nudges before aches set in.'], ['Remote workers', 'A coach that doesn’t need a gym.'], ['Tired eyes', 'Blink and distance reminders.']] },

    // ---------------- Sulaimani · PDF & Web Tools (free)
    { key: 'htmlpdf', name: 'htmlpdf', icon: '🖤', cat: 'sulaimani', kind: 'python', status: 'free',
      tagline: 'HTML → PDF with zero dependencies. Nothing to install.',
      about: ['Convert HTML to a paginated PDF using only the Python standard library: no browser, no C libraries, no dependencies.'],
      highlights: [
        ['📦', 'Zero dependencies', 'Pure Python standard library.'],
        ['🚫', 'No browser needed', 'No headless Chrome, no wkhtmltopdf.'],
        ['🧱', 'Real document structure', 'Headings, lists, quotes, code and links.'],
        ['📑', 'Automatic pagination', 'Content flows across pages for you.'],
      ] },
    { key: 'sitepdf', name: 'sitepdf', icon: '🕸️', cat: 'sulaimani', kind: 'cli', status: 'free',
      tagline: 'Crawl a whole site (images, JS, real layout) into one bookmarked PDF.',
      about: ['Crawl a whole website and save it, images, JavaScript and real layout included, as one bookmarked PDF using headless Chromium.'],
      highlights: [
        ['🕷️', 'Crawls the whole site', 'Follows links to capture every page.'],
        ['🖥️', 'Real layout', 'Headless Chromium renders images and JavaScript.'],
        ['🔖', 'One bookmarked PDF', 'Each page becomes a bookmark you can jump to.'],
      ] },
    { key: 'publishkey', name: 'publishkey', icon: '🚀', cat: 'sulaimani', kind: 'cli', status: 'free',
      tagline: 'Press one key, ship your web app. Detects the framework and deploys.',
      about: ['Press one key, ship your web app. publishkey detects FastAPI, Flask, Streamlit or Django and deploys it to the cloud.'],
      highlights: [
        ['🔍', 'Detects your framework', 'FastAPI, Flask, Streamlit and Django.'],
        ['⌨️', 'One key to ship', 'No deploy scripts to write.'],
        ['☁️', 'Straight to the cloud', 'From your folder to a live app.'],
      ] },

    // ---------------- Kesar Chai · AI Builder Kit (free)
    { key: 'redactor', name: 'redactor', icon: '🛡️', cat: 'kesar-chai', kind: 'python', status: 'free',
      tagline: 'Mask PII & secrets before text hits an LLM, then restore the reply.',
      about: ['Detect and reversibly mask PII and secrets in text before it reaches an LLM, then restore the model’s reply.'],
      highlights: [
        ['🔎', 'Finds PII & secrets', 'Spots personal data and credentials in text.'],
        ['🎭', 'Reversible masking', 'Swap sensitive values for placeholders.'],
        ['↩️', 'Restores the reply', 'Put the real values back into the model’s answer.'],
      ] },
    { key: 'chunkwise', name: 'chunkwise', icon: '🌿', cat: 'kesar-chai', kind: 'python', status: 'free',
      tagline: 'Token-aware, boundary-respecting text chunking with overlap and metadata.',
      about: ['Token-aware, boundary-respecting text chunking (recursive, sentence, markdown) with overlap, metadata and a pluggable token counter.'],
      highlights: [
        ['🔢', 'Token-aware', 'Chunk by tokens, with a pluggable counter.'],
        ['✂️', 'Respects boundaries', 'Recursive, sentence and markdown strategies.'],
        ['🔗', 'Overlap & metadata', 'Keep context between chunks and track where each came from.'],
      ] },
    { key: 'promptkit', name: 'promptkit', icon: '🧩', cat: 'kesar-chai', kind: 'python', status: 'free',
      tagline: 'Prompt templates with validation, few-shot rendering and a versioned registry.',
      about: ['A prompt template engine: required-variable validation, few-shot rendering, a chat/message builder and a versioned registry.'],
      highlights: [
        ['✅', 'Variable validation', 'Catch missing variables before you call the model.'],
        ['🧪', 'Few-shot rendering', 'Drop examples into prompts cleanly.'],
        ['💬', 'Chat builder', 'Build message lists for chat models.'],
        ['🗃️', 'Versioned registry', 'Keep prompts organized by name and version.'],
      ] },
    { key: 'vectorlite', name: 'vectorlite', icon: '🔎', cat: 'kesar-chai', kind: 'python', status: 'free',
      tagline: 'Tiny in-memory vector store: cosine, top-k, MMR re-ranking. No numpy.',
      about: ['A tiny in-memory vector store: cosine, dot and euclidean similarity, top-k, metadata filtering, MMR re-ranking and JSON persistence. No numpy.'],
      highlights: [
        ['📐', 'Three metrics', 'Cosine, dot product and euclidean.'],
        ['🎯', 'Top-k + filters', 'Search with metadata filtering.'],
        ['🔀', 'MMR re-ranking', 'Diverse results, not five near-duplicates.'],
        ['💾', 'JSON persistence', 'Save and load your store. No numpy needed.'],
      ] },
    { key: 'llmparse', name: 'llmparse', icon: '🧬', cat: 'kesar-chai', kind: 'python', status: 'free',
      tagline: 'Extract & repair JSON from messy LLM output, then coerce it to a schema.',
      about: ['Robustly extract and repair JSON from messy LLM text (code fences, prose, trailing commas, single quotes) and coerce it to a schema.'],
      highlights: [
        ['🪝', 'Finds the JSON', 'Pulls it out of code fences and surrounding prose.'],
        ['🔧', 'Repairs it', 'Fixes trailing commas, single quotes and other slips.'],
        ['📋', 'Coerces to a schema', 'Get back the shape your code expects.'],
      ] },
  ];

  const byKey = Object.fromEntries(APPS.map((a) => [a.key, a]));
  const catById = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const pickById = Object.fromEntries(PICKS.map((p) => [p.id, p]));
  const inCat = (id) => APPS.filter((a) => a.cat === id);
  return { CATS, PICKS, APPS, byKey, catById, pickById, inCat };
})();
